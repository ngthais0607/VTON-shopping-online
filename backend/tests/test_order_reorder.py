import pytest

from app.features.orders.model import Order
from app.integrations.queue import get_task_queue
from app.main import app
from tests.factories import make_product
from tests.test_orders import _checkout, persist


class _Queue:
    async def enqueue(self, *args, **options):
        return None


@pytest.fixture(autouse=True)
def _queue():
    app.dependency_overrides[get_task_queue] = lambda: _Queue()
    yield
    app.dependency_overrides.pop(get_task_queue, None)


def _expired_order(client, db_session, stock=5, quantity=2):
    product = make_product(
        db_session, name="Again", price=25000, currency="VND", stock_quantity=stock
    )
    persist(db_session, product)
    data = _checkout(client, product, quantity=quantity, payment_method="vietqr").json()
    order = db_session.get(Order, data["orders"][0]["id"])
    order.status = "expired"
    order.expires_at = None
    # Mimic the expiry job releasing the reservation.
    variant = product.variants[0]
    variant.reserved_quantity = 0
    db_session.commit()
    return order, product


def _reorder(client, order):
    return client.post(f"/api/v1/orders/track/{order.public_code}/reorder")


def test_reorder_creates_fresh_pending_vietqr_order(client, db_session, mock_user_auth):
    order, product = _expired_order(client, db_session)

    response = _reorder(client, order)

    assert response.status_code == 201
    body = response.json()
    new = body["orders"][0]
    assert new["id"] != order.id
    assert new["public_code"] != order.public_code
    assert new["status"] == "pending"
    assert body["vietqr"]["amount"] == 50000
    db_session.refresh(product.variants[0])
    assert product.variants[0].reserved_quantity == 2


def test_reorder_rejects_order_that_is_still_open(client, db_session, mock_user_auth):
    order, _ = _expired_order(client, db_session)
    order.status = "pending"
    db_session.commit()

    response = _reorder(client, order)

    assert response.status_code == 400
    assert response.json()["code"] == "order_not_reorderable"


def test_reorder_reports_out_of_stock_and_creates_nothing(
    client, db_session, mock_user_auth
):
    order, product = _expired_order(client, db_session, stock=2, quantity=2)
    product.variants[0].stock_quantity = 1
    db_session.commit()
    before = db_session.query(Order).count()

    response = _reorder(client, order)

    assert response.status_code >= 400
    assert db_session.query(Order).count() == before


def test_reorder_is_forbidden_for_another_customer(client, db_session, mock_user_auth):
    order, _ = _expired_order(client, db_session)
    order.user_id = 999
    db_session.commit()

    assert _reorder(client, order).status_code == 403


def test_reorder_unknown_code_is_404(client, db_session, mock_user_auth):
    response = client.post("/api/v1/orders/track/nope/reorder")
    assert response.status_code == 404
