import pytest

from app.core.config import get_settings
from app.features.orders.model import Order, Payment
from app.integrations.queue import get_task_queue
from app.jobs.orders import demo_auto_pay_order
from app.main import app
from tests.factories import make_product
from tests.test_orders import _checkout, persist
from tests.test_vietqr_webhook import setup_test_order


class RecordingQueue:
    def __init__(self):
        self.calls = []

    async def enqueue(self, task_name, *args, **options):
        self.calls.append((task_name, args, options))


@pytest.fixture
def queue():
    recorder = RecordingQueue()
    app.dependency_overrides[get_task_queue] = lambda: recorder
    yield recorder
    app.dependency_overrides.pop(get_task_queue, None)


@pytest.fixture
def auto_pay_env(monkeypatch):
    def apply(seconds, env="development"):
        monkeypatch.setenv("DEMO_AUTO_PAY_SECONDS", str(seconds))
        monkeypatch.setenv("APP_ENV", env)
        get_settings.cache_clear()

    yield apply
    monkeypatch.undo()
    get_settings.cache_clear()


def _vietqr_checkout(client, db_session):
    product = make_product(
        db_session, name="Auto Pay", price=25000, currency="VND", stock_quantity=5
    )
    persist(db_session, product)
    return _checkout(client, product, payment_method="vietqr")


def _auto_pay_calls(queue):
    return [c for c in queue.calls if c[0] == "demo_auto_pay_order_task"]


def test_checkout_does_not_schedule_auto_pay_by_default(
    client, db_session, mock_user_auth, queue
):
    assert _vietqr_checkout(client, db_session).status_code == 201
    assert _auto_pay_calls(queue) == []


def test_checkout_schedules_delayed_auto_pay_when_enabled(
    client, db_session, mock_user_auth, queue, auto_pay_env
):
    auto_pay_env(15)
    response = _vietqr_checkout(client, db_session)
    order_id = response.json()["orders"][0]["id"]
    assert _auto_pay_calls(queue) == [
        ("demo_auto_pay_order_task", (order_id,), {"defer_seconds": 15})
    ]


def test_auto_pay_is_never_scheduled_in_production(
    client, db_session, mock_user_auth, queue, auto_pay_env
):
    auto_pay_env(15, env="production")
    _vietqr_checkout(client, db_session)
    assert _auto_pay_calls(queue) == []


def test_cod_checkout_never_schedules_auto_pay(
    client, db_session, mock_user_auth, queue, auto_pay_env
):
    auto_pay_env(15)
    product = make_product(
        db_session, name="COD", price=25000, currency="VND", stock_quantity=5
    )
    persist(db_session, product)
    _checkout(client, product, payment_method="cod")
    assert _auto_pay_calls(queue) == []


def test_job_marks_pending_order_paid_through_webhook_logic(db_session, auto_pay_env):
    auto_pay_env(15)
    order, product = setup_test_order(db_session, total_amount=150000, reserved=1)

    assert demo_auto_pay_order(db_session, order.id) is True

    db_session.refresh(order)
    db_session.refresh(product)
    assert order.status == "paid"
    assert product.reserved_quantity == 0 and product.sold_quantity == 1
    payment = db_session.query(Payment).filter(Payment.order_id == order.id).one()
    assert payment.provider_transaction_id.startswith("DEMO-")


def test_job_is_a_noop_when_order_already_paid_or_disabled(db_session, auto_pay_env):
    order, _ = setup_test_order(db_session, status="paid")
    auto_pay_env(15)
    assert demo_auto_pay_order(db_session, order.id) is False
    assert db_session.query(Payment).filter(Payment.order_id == order.id).count() == 0

    pending, _ = setup_test_order(db_session)
    auto_pay_env(0)
    assert demo_auto_pay_order(db_session, pending.id) is False
    db_session.refresh(pending)
    assert pending.status == "pending"
    assert db_session.query(Order).count() == 2
