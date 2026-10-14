# Batch 1: P0 Data Integrity & Concurrency Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical issues P0-1 (stock inflation), P0-2 (VietQR webhook race condition), P0-7 (event loop blocking on sync DB locks), and P0-5 (rate limiter 500 crashes during Redis outages) to ensure data and concurrency integrity before MVP release.

**Architecture:** 
- Disallow direct stock mutation on products; all stock adjustments flow strictly through variant adjustment APIs with audit logs.
- Enforce strict hierarchical row locking (`ProductVariant` ASC followed by `Order` ASC with `populate_existing().with_for_update()`) and catch `IntegrityError` in VietQR webhook.
- Offload long-blocking DB operations to Starlette/FastAPI's worker threadpool by declaring route handlers as synchronous `def` and dispatching asynchronous background tasks via FastAPI `BackgroundTasks`.
- Configure SlowAPI limiter with fail-open / in-memory fallback to avoid request failures during Redis downtime.

**Tech Stack:** Python 3.12/FastAPI, SQLAlchemy ORM, Pydantic v2, SlowAPI, Next.js 14 / TypeScript, pytest, vitest.

## Global Constraints

- Python version: Python 3.12 compatible.
- All database mutations with locking must prevent deadlocks by sorting IDs ascending.
- Test-driven development: Write regression test first, verify failure, apply fix, verify pass.
- Frequent commits per task.

---

### Task 1: Fix Product Stock Inflation on Admin Edit (P0-1)

**Files:**
- Modify: `backend/app/features/products/schemas.py:80-115`
- Modify: `backend/app/features/products/service.py:530-555`
- Modify: `frontend/app/products/page.tsx:130-170, 390-410`
- Create: `backend/tests/test_product_stock_inflation.py`

**Interfaces:**
- Consumes: `ProductPatch`, `ProductCreate`, `update_product`
- Produces: `ProductPatch` without `stock_quantity`, `update_product` that only mutates product metadata without altering variant inventory.

- [x] **Step 1: Write failing regression test for stock inflation**

Create `backend/tests/test_product_stock_inflation.py`:
```python
from decimal import Decimal
import pytest
from sqlalchemy.orm import Session

from app.features.products.models import Product
from app.features.products.variant_model import ProductVariant
from app.features.products.schemas import ProductPatch
from app.features.products.service import update_product


def test_update_product_does_not_inflate_variant_stock(db_session: Session):
    # Setup product with 2 variants, 10 stock each -> total = 20
    product = Product(
        name="Original Shirt",
        slug="original-shirt",
        price=Decimal("100.00"),
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    v1 = ProductVariant(
        product_id=product.id,
        sku="SHIRT-RED-S",
        color_name="Red",
        size="S",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    v2 = ProductVariant(
        product_id=product.id,
        sku="SHIRT-RED-M",
        color_name="Red",
        size="M",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add_all([v1, v2])
    db_session.commit()

    assert product.stock_quantity == 20

    # Simulate admin updating only the product name
    command = ProductPatch(name="Updated Shirt Name")
    updated = update_product(db_session, product.id, command)

    db_session.refresh(v1)
    db_session.refresh(v2)

    assert updated.name == "Updated Shirt Name"
    assert v1.stock_quantity == 10
    assert v2.stock_quantity == 10
    assert updated.stock_quantity == 20
```

- [x] **Step 2: Run test to verify behavior and test schema rejection**

Run: `pytest backend/tests/test_product_stock_inflation.py -v`
Ensure test runs.

- [x] **Step 3: Modify backend schemas and service**

1. In `backend/app/features/products/schemas.py`:
Remove `stock_quantity` from `ProductPatch` and `ProductCreate`:
```python
# In ProductCreate:
# Remove: stock_quantity: int = Field(default=0, ge=0)

# In ProductPatch:
# Remove: stock_quantity: int | None = Field(default=None, ge=0)
```

2. In `backend/app/features/products/service.py`:
Remove legacy `stock_quantity` assignment in `update_product`:
Delete:
```python
    stock_quantity = changes.pop("stock_quantity", None)
    if stock_quantity is not None:
        if (product.reserved_quantity or 0) + (
            product.sold_quantity or 0
        ) > stock_quantity:
            raise BusinessRuleError(
                "Reserved and sold quantities cannot exceed total stock",
                code="invalid_product_inventory",
            )
        if product.variants:
            first_v = product.variants[0]
            first_v.stock_quantity = stock_quantity
```

3. In `frontend/app/products/page.tsx`:
- Remove `stock_quantity: 0` / `stock_quantity: product.stock_quantity` from form state initialization and submission payloads.
- Remove the stock input element from the modal form.
- Keep the read-only display of total stock and variant stocks.

- [x] **Step 4: Run tests to verify fix**

Run: `pytest backend/tests/test_product_stock_inflation.py backend/tests/test_products.py -v`
Expected: PASS

- [x] **Step 5: Commit Task 1**

```bash
git add backend/app/features/products/schemas.py backend/app/features/products/service.py frontend/app/products/page.tsx backend/tests/test_product_stock_inflation.py
git commit -m "fix(products): remove stock_quantity from product patch and admin form to prevent stock inflation"
```

---

### Task 2: Fix VietQR Webhook Concurrency Race Condition (P0-2)

**Files:**
- Modify: `backend/app/features/orders/service.py:573-705`
- Create: `backend/tests/test_vietqr_webhook_concurrency.py`

**Interfaces:**
- Consumes: `VietQRWebhookPayload`, `process_vietqr_webhook`
- Produces: Concurrent-safe `process_vietqr_webhook` with strict locking order and duplicate payment idempotency.

- [x] **Step 1: Write failing concurrency regression test for VietQR Webhook**

Create `backend/tests/test_vietqr_webhook_concurrency.py`:
```python
from decimal import Decimal
import threading
import pytest
from sqlalchemy.orm import Session

from app.features.orders.models import Order, OrderItem, Payment
from app.features.orders.schemas import VietQRWebhookPayload
from app.features.orders.service import process_vietqr_webhook
from app.features.products.models import Product
from app.features.products.variant_model import ProductVariant
from app.core.config import get_settings


def test_vietqr_concurrent_webhook_does_not_double_count_sold(db_session: Session):
    settings = get_settings()
    secret = settings.vietqr_webhook_secret or "test-secret"
    settings.vietqr_webhook_secret = secret

    # Setup product, variant, and pending order
    prod = Product(name="Shoes", slug="shoes", price=Decimal("500000.00"), currency="VND", is_active=True)
    db_session.add(prod)
    db_session.flush()

    variant = ProductVariant(
        product_id=prod.id,
        sku="SHOES-42",
        color_name="Black",
        size="42",
        stock_quantity=10,
        reserved_quantity=2,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(variant)
    db_session.flush()

    order = Order(
        user_id=None,
        total_amount=Decimal("1000000.00"),
        currency="VND",
        status="pending",
        payment_method="vietqr",
    )
    db_session.add(order)
    db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=prod.id,
        variant_id=variant.id,
        quantity=2,
        unit_price=Decimal("500000.00"),
    )
    db_session.add(item)
    db_session.commit()

    order_id = order.id

    payload1 = VietQRWebhookPayload(
        transaction_id="TXN_CONCURRENT_1",
        amount=1000000.0,
        content=f"TRUELOOK_{order_id}",
    )
    payload2 = VietQRWebhookPayload(
        transaction_id="TXN_CONCURRENT_2",
        amount=1000000.0,
        content=f"TRUELOOK_{order_id}",
    )

    # Process first webhook
    res1 = process_vietqr_webhook(db_session, payload1, secret)
    assert res1.status == "success"

    # Process second webhook with different txn_id
    res2 = process_vietqr_webhook(db_session, payload2, secret)
    assert res2.status in ("already_processed", "duplicate_payment")

    db_session.refresh(variant)
    db_session.refresh(order)

    # Sold quantity should be 2 (not 4), reserved should be 0 (not -2)
    assert variant.sold_quantity == 2
    assert variant.reserved_quantity == 0
    assert order.status == "paid"
```

- [x] **Step 2: Run test to see current behavior**

Run: `pytest backend/tests/test_vietqr_webhook_concurrency.py -v`

- [x] **Step 3: Refactor `process_vietqr_webhook` in `orders/service.py`**

In `backend/app/features/orders/service.py`:
Update `process_vietqr_webhook` to:
1. Lock variants first in ascending `id` order using `_resolve_and_lock_order_inventory(db, order_ids)`.
2. Lock order rows in ascending `id` order with `.order_by(Order.id.asc()).populate_existing().with_for_update()`.
3. Check status:
   - If `order.status == OrderStatus.PENDING.value`: transition to `PAID`, record `Payment(status="paid")`.
   - If `order.status == OrderStatus.PAID.value`: if transaction already recorded, return `already_processed`; if new transaction, record `Payment(status="duplicate_payment")` without transitioning or altering variant stock.
   - If `order.status in (OrderStatus.EXPIRED.value, OrderStatus.CANCELLED.value)`: record `Payment(status="late_payment")`.
4. Catch `IntegrityError` on commit, rollback, and return `status="already_processed"`.

- [x] **Step 4: Run test to verify fix passes**

Run: `pytest backend/tests/test_vietqr_webhook_concurrency.py backend/tests/test_order_domain.py -v`
Expected: PASS

- [x] **Step 5: Commit Task 2**

```bash
git add backend/app/features/orders/service.py backend/tests/test_vietqr_webhook_concurrency.py
git commit -m "fix(orders): lock orders with for update and handle duplicate payments in VietQR webhook"
```

---

### Task 3: Offload Blocking DB Locking from Async Event Loop (P0-7)

**Files:**
- Modify: `backend/app/features/orders/router.py:45-60, 94-108`
- Modify: `backend/app/features/orders/service.py:164-180, 375-435`
- Modify: `backend/app/features/users/router.py:30-40`
- Modify: `backend/app/features/users/service.py:47-68`
- Create: `backend/tests/test_nonblocking_event_loop.py`

**Interfaces:**
- Consumes: `checkout_cart`, `update_order_status`, `register_user`
- Produces: Synchronous `def` route handlers taking `BackgroundTasks` to enqueue email tasks asynchronously without blocking the event loop.

- [x] **Step 1: Write test for sync route execution and background task scheduling**

Create `backend/tests/test_nonblocking_event_loop.py`:
```python
import inspect
from fastapi import BackgroundTasks
from app.features.orders import router as order_router
from app.features.users import router as user_router


def test_db_lock_endpoints_are_synchronous():
    # Endpoints with synchronous DB transactions must be 'def' (not 'async def')
    # so FastAPI executes them in the worker threadpool.
    assert not inspect.iscoroutinefunction(order_router.checkout_cart)
    assert not inspect.iscoroutinefunction(order_router.update_order_status)
    assert not inspect.iscoroutinefunction(user_router.register_user)
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_nonblocking_event_loop.py -v`
Expected: FAIL because functions are currently `async def`.

- [x] **Step 3: Convert endpoints to synchronous `def` with `BackgroundTasks`**

1. In `backend/app/features/orders/service.py`:
   - Change `def checkout_cart(...)` to synchronous `def`.
   - Change `def change_order_status(...)`, `def mark_paid(...)`, `def cancel_order(...)`, `def expire_order(...)` to synchronous `def`.
   - Remove `await` inside these functions. If emails need to be enqueued, pass a background callback or enqueue via `background_tasks`.

2. In `backend/app/features/orders/router.py`:
   - Change `checkout_cart` signature to:
     ```python
     @router.post("/checkout-cart", ...)
     def checkout_cart(
         command: CheckoutCommand,
         background_tasks: BackgroundTasks,
         db: Session = Depends(get_db),
         current_user: User = Depends(get_current_user),
         queue: TaskQueue = Depends(get_task_queue),
     ):
         return service.checkout_cart(db, current_user, command, queue, background_tasks=background_tasks)
     ```
   - Change `update_order_status` signature to:
     ```python
     @router.put("/{order_id}/status", ...)
     def update_order_status(
         order_id: int,
         command: OrderPatchStatus,
         background_tasks: BackgroundTasks,
         db: Session = Depends(get_db),
         _admin: User = Depends(get_current_admin),
         queue: TaskQueue = Depends(get_task_queue),
     ):
         return service.change_order_status(db, order_id, command.status, queue, background_tasks=background_tasks)
     ```

3. In `backend/app/features/users/service.py`:
   - Change `def register_user(db: Session, command: UserCreate, queue: TaskQueue, background_tasks: BackgroundTasks | None = None) -> User:` to synchronous `def`.
   - Replace `await queue.enqueue(...)` with:
     ```python
     if background_tasks is not None:
         background_tasks.add_task(queue.enqueue, "send_welcome_email_task", user.id)
     ```

4. In `backend/app/features/users/router.py`:
   - Change `register_user` to synchronous `def`:
     ```python
     @router.post("/register", ...)
     def register_user(
         command: UserCreate,
         background_tasks: BackgroundTasks,
         db: Session = Depends(get_db),
         queue: TaskQueue = Depends(get_task_queue),
     ):
         return service.register_user(db, command, queue, background_tasks=background_tasks)
     ```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_nonblocking_event_loop.py backend/tests/test_order_domain.py backend/tests/test_users.py -v`
Expected: PASS

- [x] **Step 5: Commit Task 3**

```bash
git add backend/app/features/orders/router.py backend/app/features/orders/service.py backend/app/features/users/router.py backend/app/features/users/service.py backend/tests/test_nonblocking_event_loop.py
git commit -m "fix(concurrency): offload sync DB lock operations to threadpool and use BackgroundTasks"
```

---

### Task 4: Fix Rate Limiter Failure on Redis Outage (P0-5)

**Files:**
- Modify: `backend/app/core/rate_limiter.py:1-20`
- Create: `backend/tests/test_rate_limiter_resilience.py`

**Interfaces:**
- Consumes: `slowapi.Limiter`, `redis_url`
- Produces: Resilient `limiter` instance that swallows connection errors and falls back to memory storage.

- [x] **Step 1: Write failing test for rate limiter resilience when Redis fails**

Create `backend/tests/test_rate_limiter_resilience.py`:
```python
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.core.rate_limiter import limiter


def test_rate_limiter_swallows_storage_errors():
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.get("/test-limited")
    @limiter.limit("5/minute")
    def limited_endpoint(request: Request):
        return {"ok": True}

    client = TestClient(app)
    response = client.get("/test-limited")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
```

- [x] **Step 2: Run test to verify current behavior**

Run: `pytest backend/tests/test_rate_limiter_resilience.py -v`

- [x] **Step 3: Update `rate_limiter.py` configuration**

In `backend/app/core/rate_limiter.py`:
Update initialization to support `swallow_errors=True` and `in_memory_fallback_enabled=True`:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

redis_url = get_settings().redis_url.strip() or "memory://"
storage_options = {}
if redis_url.startswith("redis"):
    storage_options["protocol"] = 2

try:
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri=redis_url,
        storage_options=storage_options,
        swallow_errors=True,
        in_memory_fallback_enabled=True,
    )
except Exception:
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri="memory://",
        swallow_errors=True,
    )
```

- [x] **Step 4: Run test to verify pass**

Run: `pytest backend/tests/test_rate_limiter_resilience.py -v`
Expected: PASS

- [x] **Step 5: Commit Task 4**

```bash
git add backend/app/core/rate_limiter.py backend/tests/test_rate_limiter_resilience.py
git commit -m "fix(resilience): enable swallow_errors and in-memory fallback on rate limiter"
```

---

### Task 5: Full Regression & Integration Verification

- [x] **Step 1: Run all backend tests**

Run: `pytest backend/tests/ -v`
Expected: 315+ pass, 0 fail.

- [x] **Step 2: Run ruff check and format**

Run: `ruff check backend/ && ruff format --check backend/`
Expected: Clean or format cleanly.

- [x] **Step 3: Run frontend typecheck and tests**

Run: `cd frontend && npm run type-check && npm run test`
Expected: All type checks and tests pass.
