import json
from datetime import datetime, timezone

from app.core.schemas import serialize_utc_datetime
from app.features.categories.schemas import CategoryResponse
from app.features.dashboard.schemas import RecentOrderSummary
from app.features.orders.schemas import TrackingStep
from app.features.products.variant_schemas import InventoryAdjustmentResponse
from app.features.users.schemas import UserResponse


def test_serialize_utc_datetime_handles_naive_and_aware():
    # Naive datetime
    naive_dt = datetime(2026, 10, 14, 15, 30, 45)
    assert serialize_utc_datetime(naive_dt) == "2026-10-14T15:30:45Z"

    # Aware UTC datetime
    aware_utc = datetime(2026, 10, 14, 15, 30, 45, tzinfo=timezone.utc)
    assert serialize_utc_datetime(aware_utc) == "2026-10-14T15:30:45Z"

    # Aware non-UTC datetime (+7 hours)
    from datetime import timedelta
    tz_plus_7 = timezone(timedelta(hours=7))
    aware_plus_7 = datetime(2026, 10, 14, 22, 30, 45, tzinfo=tz_plus_7)
    assert serialize_utc_datetime(aware_plus_7) == "2026-10-14T15:30:45Z"


def test_schema_json_serialization_appends_z():
    now_naive = datetime(2026, 10, 14, 12, 0, 0)

    # 1. CategoryResponse
    cat = CategoryResponse(
        id=1,
        name="Shirts",
        slug="shirts",
        parent_id=None,
        created_at=now_naive,
        updated_at=now_naive,
    )
    cat_json = json.loads(cat.model_dump_json())
    assert cat_json["created_at"] == "2026-10-14T12:00:00Z"
    assert cat_json["updated_at"] == "2026-10-14T12:00:00Z"

    # 2. UserResponse
    user = UserResponse(
        id=1,
        username="tester",
        email="test@example.com",
        first_name="Test",
        last_name="User",
        role="customer",
        created_at=now_naive,
        updated_at=now_naive,
    )
    user_json = json.loads(user.model_dump_json())
    assert user_json["created_at"] == "2026-10-14T12:00:00Z"
    assert user_json["updated_at"] == "2026-10-14T12:00:00Z"

    # 3. InventoryAdjustmentResponse
    adj = InventoryAdjustmentResponse(
        id=1,
        variant_id=10,
        old_stock=5,
        new_stock=10,
        delta=5,
        reason="Restock",
        user_id=1,
        created_at=now_naive,
    )
    adj_json = json.loads(adj.model_dump_json())
    assert adj_json["created_at"] == "2026-10-14T12:00:00Z"

    # 4. RecentOrderSummary
    from app.features.orders.constants import OrderStatus

    recent = RecentOrderSummary(
        id=1,
        product_name="Sample Shirt",
        quantity=2,
        total=150000.0,
        currency="VND",
        status=OrderStatus.PENDING,
        payment_status="unpaid",
        created_at=now_naive,
    )
    recent_json = json.loads(recent.model_dump_json())
    assert recent_json["created_at"] == "2026-10-14T12:00:00Z"

    # 5. TrackingStep
    timeline = TrackingStep(
        step=1,
        title="Order Placed",
        description="Order created",
        completed=True,
        timestamp=now_naive,
    )
    timeline_json = json.loads(timeline.model_dump_json())
    assert timeline_json["timestamp"] == "2026-10-14T12:00:00Z"
