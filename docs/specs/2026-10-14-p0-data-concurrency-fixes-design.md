# Design Specification: Batch 1 - P0 Data Integrity & Concurrency Fixes

- **Date**: 2026-10-14
- **Branch**: `fix/fashion-review-fixes`
- **Scope**: Fix critical issues P0-1, P0-2, P0-7, and P0-5 identified in `docs/reviews/REVIEW_fashion-review-fixes.md`.

---

## 1. Problem Statement & Motivation

During production simulation and regression testing on MariaDB:
1. **P0-1 (Stock Inflation)**: Updating product details via Admin UI (`app/products/page.tsx`) sends `stock_quantity`, which `products/service.py::update_product` forcefully assigns to `product.variants[0].stock_quantity`, bypassing inventory adjustment audits and inflating stock when editing products with multiple variants.
2. **P0-2 (VietQR Race Condition)**: `process_vietqr_webhook` reads `Order` objects without row locking, then locks variants, and checks in-memory `order.status` without `populate_existing()`. Under concurrent webhooks or simultaneous admin updates, `sold_quantity` is incremented twice and duplicate `paid` payments are persisted.
3. **P0-7 (Async Event Loop Blocking)**: `checkout_cart`, `update_order_status`, and `register_user` are declared as `async def` endpoints, but run synchronous SQLAlchemy database queries with row-level locks (`with_for_update()`). Under high concurrency or long lock waits (up to 50s), the entire FastAPI asyncio event loop is blocked.
4. **P0-5 (Rate Limiter Redis Outage Crash)**: `backend/app/core/rate_limiter.py` only wraps initialization in a `try/except` block. When Redis becomes unreachable at runtime, `limits` raises `ConnectionError`, returning HTTP 500 on all rate-limited endpoints (login, register, payment webhook).

---

## 2. Technical Architecture & Detailed Design

### 2.1 Component 1: Product Stock Inflation Fix (P0-1)

#### Backend Changes
- **Schemas (`backend/app/features/products/schemas.py`)**:
  - Remove `stock_quantity` from `ProductPatch`.
  - Remove `stock_quantity` from `ProductCreate` (stock can only be defined via `variants: list[VariantItem]` during creation or via adjust-stock API).
- **Service (`backend/app/features/products/service.py`)**:
  - In `update_product`: remove the block that reads `stock_quantity` and sets `first_v.stock_quantity = stock_quantity`.
  - All inventory changes must strictly flow through `POST /api/v1/variants/{id}/adjust-stock` to ensure audit entries in `InventoryAdjustment`.
- **Frontend Changes (`frontend/app/products/page.tsx`)**:
  - Remove `stock_quantity` input field from the Add/Edit Product modal forms.
  - Display product and variant stock numbers as read-only badges.
  - Stock updates are managed solely through `VariantStockDialog`.

### 2.2 Component 2: VietQR Webhook Concurrency & Idempotency Fix (P0-2)

#### Backend Service (`backend/app/features/orders/service.py`)
- **Deadlock-Free Lock Hierarchy**:
  1. Lock variants in ascending order of `variant_id` via `_resolve_and_lock_order_inventory(db, order_ids)`.
  2. Lock `Order` rows in ascending order of `order.id` using `populate_existing().with_for_update()`:
     ```python
     orders = (
         db.query(Order)
         .filter(Order.id.in_(order_ids))
         .order_by(Order.id.asc())
         .populate_existing()
         .with_for_update()
         .all()
     )
     ```
- **Post-Lock Status Evaluation**:
  - **Case `order.status == OrderStatus.PENDING.value`**:
    - Call `apply_order_transition(order, OrderStatus.PAID, current_time)` (moves reserved -> sold).
    - Insert `Payment(status="paid", provider_transaction_id=payload.transaction_id, ...)`.
  - **Case `order.status == OrderStatus.PAID.value`**:
    - If `Payment` with matching `provider_transaction_id` already exists, return `already_processed`.
    - If new `provider_transaction_id` for an already-paid order, record `Payment(status="duplicate_payment")` and log warning; **do not** call `apply_order_transition`.
  - **Case `order.status in (OrderStatus.EXPIRED.value, OrderStatus.CANCELLED.value)`**:
    - Record `Payment(status="late_payment")`.
- **Unique Constraint Exception Handling**:
  - Wrap database commit in a `try...except IntegrityError` block. If `Payment.provider_transaction_id` conflicts, rollback and return `VietQRWebhookResponse(status="already_processed")`.

### 2.3 Component 3: Non-blocking Sync Endpoints for DB Locking (P0-7)

#### Route Handlers (`backend/app/features/orders/router.py`, `backend/app/features/users/router.py`)
- Convert endpoint signatures from `async def` to synchronous `def`:
  - `orders/router.py`:
    - `def checkout_cart(command: CheckoutCommand, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user), queue: TaskQueue = Depends(get_task_queue))`
    - `def update_order_status(order_id: int, command: OrderPatchStatus, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin), queue: TaskQueue = Depends(get_task_queue))`
  - `users/router.py`:
    - `def register_user(command: UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), queue: TaskQueue = Depends(get_task_queue))`
- Convert `service.checkout_cart` and `service.change_order_status` from `async def` to `def`.
- Background task dispatch:
  - Instead of blocking on or awaiting `queue.enqueue(...)` inside database transaction scopes, use FastAPI's built-in `background_tasks.add_task(queue.enqueue, task_name, entity_id)`.
  - FastAPI handles coroutine execution for background tasks automatically on the event loop after the response has been sent to the client.

### 2.4 Component 4: Rate Limiter Resilience & Fail-Open Fallback (P0-5)

#### Core Rate Limiter (`backend/app/core/rate_limiter.py`)
- Initialize `slowapi.Limiter` with fallback and error-swallowing enabled:
  ```python
  limiter = Limiter(
      key_func=get_remote_address,
      storage_uri=redis_url,
      storage_options=storage_options,
      swallow_errors=True,
      in_memory_fallback_enabled=True,
  )
  ```
- If Redis is unreachable, down, or fails mid-request, rate limiting fails open or falls back to local in-memory storage instead of throwing unhandled `ConnectionError` (HTTP 500).

---

## 3. Data Flow & Sequence

### 3.1 Webhook VietQR Resolution Flow
```
Webhook Request
   │
   ▼
Validate Secret & Payload
   │
   ▼
Acquire Variant Locks (ASC order: variant_id)
   │
   ▼
Acquire Order Locks (ASC order: order_id with FOR UPDATE & populate_existing)
   │
   ├── Status == PENDING  ──► Transition to PAID ──► Record Payment("paid")
   ├── Status == PAID     ──► Existing Txn? ──► already_processed
   │                                 └─► New Txn? ──► Record Payment("duplicate_payment")
   └── Status == CANCELLED/EXPIRED ──► Record Payment("late_payment")
   │
   ▼
Commit (Catch IntegrityError -> already_processed)
   │
   ▼
Return VietQRWebhookResponse
```

---

## 4. Testing & Verification Plan

1. **P0-1 Verification**:
   - Create product with 2 variants (each with stock=10).
   - Send PATCH request to `/api/v1/products/{id}` with new product name. Ensure `stock_quantity` is rejected if passed in payload, and variant stocks remain 10 each (total stock = 20).
   - Adjust variant 1 stock via `/variants/{id}/adjust-stock` to 15; verify audit log entry created and total stock = 25.
2. **P0-2 Verification**:
   - Run concurrency test: two threads sending simultaneous VietQR webhooks with different `transaction_id` for the same pending order.
   - Verify: exactly one payment records `paid`, order transitions to `PAID`, `sold_quantity` increments by order quantity only once, and second transaction records `duplicate_payment` or returns `already_processed`.
3. **P0-7 Verification**:
   - Execute concurrent `checkout_cart` and `update_order_status` requests.
   - Verify thread pool offloading: during a simulated long DB lock wait, a lightweight async endpoint (e.g., `/health` or catalog query) responds immediately without event loop starvation.
4. **P0-5 Verification**:
   - Configure invalid Redis URL (e.g., `redis://127.0.0.1:9999`).
   - Call `/api/v1/users/register`, `/api/v1/users/login`, and `/api/v1/orders/vietqr-webhook`.
   - Verify requests return valid HTTP 200/201/400 responses rather than HTTP 500 crash.
