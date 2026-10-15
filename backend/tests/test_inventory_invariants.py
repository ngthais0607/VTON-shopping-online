from datetime import datetime, timezone

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError
from app.features.orders.constants import OrderStatus
from app.features.orders.domain import InvalidOrderTransition, apply_order_transition
from tests.test_order_domain import _order


@pytest.mark.parametrize(
    "status,paid,source",
    [
        ("paid", False, "sold"),
        ("shipped", True, "sold"),
        ("delivered", True, "sold"),
        ("shipped", False, "reserved"),
        ("delivered", False, "reserved"),
    ],
)
def test_cancel_uses_order_ownership_not_other_orders_stock(status, paid, source):
    order, _, variant = _order("cod", status)
    order.paid_at = datetime.now(timezone.utc) if paid else None
    variant.reserved_quantity = 3
    variant.sold_quantity = 4
    apply_order_transition(order, OrderStatus.CANCELLED)
    assert (variant.reserved_quantity, variant.sold_quantity) == (
        (3, 2) if source == "sold" else (1, 4)
    )


@pytest.mark.parametrize(
    "status,paid,target",
    [
        ("paid", False, OrderStatus.CANCELLED),
        ("shipped", True, OrderStatus.CANCELLED),
        ("delivered", True, OrderStatus.CANCELLED),
        ("shipped", False, OrderStatus.CANCELLED),
        ("delivered", False, OrderStatus.CANCELLED),
        ("shipped", False, OrderStatus.PAID),
        ("delivered", False, OrderStatus.PAID),
    ],
)
def test_inconsistent_inventory_fails_without_changing_order(status, paid, target):
    order, _, variant = _order("cod", status)
    order.paid_at = datetime.now(timezone.utc) if paid else None
    variant.reserved_quantity = 1
    variant.sold_quantity = 1
    with pytest.raises(ConflictError) as exc:
        apply_order_transition(order, target)
    assert exc.value.code == "inventory_state_inconsistent"
    assert order.status == status
    assert (variant.reserved_quantity, variant.sold_quantity) == (1, 1)


@settings(max_examples=150, deadline=None)
@given(
    method=st.sampled_from(["cod", "vietqr"]),
    transitions=st.lists(st.sampled_from(list(OrderStatus)), max_size=45),
)
def test_random_transitions_preserve_inventory_and_other_orders(method, transitions):
    order, _, variant = _order(method, "pending" if method == "vietqr" else "confirmed")
    # Two reserved and one sold belong to OTHER orders sharing this variant.
    variant.stock_quantity = 8
    variant.reserved_quantity = 4
    variant.sold_quantity = 1
    paid = False
    terminal = False
    for target in transitions:
        before = (
            order.status,
            variant.reserved_quantity,
            variant.sold_quantity,
            order.paid_at,
        )
        try:
            apply_order_transition(order, target)
        except InvalidOrderTransition:
            assert (
                order.status,
                variant.reserved_quantity,
                variant.sold_quantity,
                order.paid_at,
            ) == before
        else:
            paid = paid or target == OrderStatus.PAID
            terminal = target in {OrderStatus.CANCELLED, OrderStatus.EXPIRED}
        assert variant.reserved_quantity >= 0
        assert variant.sold_quantity >= 0
        assert (
            variant.reserved_quantity + variant.sold_quantity <= variant.stock_quantity
        )
        assert (variant.reserved_quantity, variant.sold_quantity) == (
            (2, 1) if terminal else (2, 3) if paid else (4, 1)
        )


def test_database_rejects_reservations_plus_sales_exceeding_stock(db_session):
    from tests.factories import make_product

    product = make_product(
        db_session, stock_quantity=3, reserved_quantity=2, sold_quantity=1
    )
    db_session.flush()
    product.variants[0].reserved_quantity = 3
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_repaying_cod_after_delivery_does_not_sell_twice():
    order, _, variant = _order("cod", "confirmed")
    apply_order_transition(order, OrderStatus.PAID)
    first_paid_at = order.paid_at
    apply_order_transition(order, OrderStatus.SHIPPED)
    apply_order_transition(order, OrderStatus.DELIVERED)
    apply_order_transition(order, OrderStatus.PAID)
    assert (variant.reserved_quantity, variant.sold_quantity) == (0, 3)
    assert order.paid_at == first_paid_at


@pytest.mark.parametrize("target", [OrderStatus.PAID, OrderStatus.CANCELLED])
def test_duplicate_variant_lines_accumulate_instead_of_overwriting(target):
    from app.features.orders.model import OrderItem

    order, _, variant = _order("vietqr", "pending")
    order.items[0].quantity = 1
    order.items.append(OrderItem(variant=variant, variant_id=variant.id, quantity=1))
    apply_order_transition(order, target)
    assert (variant.reserved_quantity, variant.sold_quantity) == (
        (0, 3) if target == OrderStatus.PAID else (0, 1)
    )


def test_duplicate_variant_lines_validate_total_before_any_mutation():
    from app.features.orders.model import OrderItem

    order, _, variant = _order("vietqr", "pending")
    order.items[0].quantity = 1
    order.items.append(OrderItem(variant=variant, variant_id=variant.id, quantity=1))
    variant.reserved_quantity = 1
    with pytest.raises(ConflictError) as exc:
        apply_order_transition(order, OrderStatus.PAID)
    assert exc.value.code == "inventory_state_inconsistent"
    assert (order.status, variant.reserved_quantity, variant.sold_quantity) == (
        "pending",
        1,
        1,
    )
