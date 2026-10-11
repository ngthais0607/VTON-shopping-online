# MVP-First SOLID Backend Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the complete FastAPI backend into an MVP-first feature architecture with thin routers, explicit use cases and transactions, typed API contracts, narrow external boundaries, updated documentation, and a final severity-ranked review.

**Architecture:** Each feature defaults to `router.py`, `schemas.py`, `service.py`, and `model.py`; additional modules exist only for independently meaningful behavior. FastAPI remains the delivery boundary, SQLAlchemy remains the concrete persistence mechanism, and external SDKs sit behind small substitutable adapters only where tests or lifecycle handling require them.

**Tech Stack:** Python 3.13, FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2, Alembic, Pytest, Ruff, ARQ/Redis, MinIO, aiosmtplib/Jinja2, MariaDB integration tests.

**Spec:** `docs/superpowers/specs/2026-10-11-mvp-solid-backend-architecture-design.md`

## Global Constraints

- Optimize for an MVP: no generic repository, unit-of-work abstraction, DI framework, CQRS, event bus, or speculative interface.
- Backend API compatibility may break; the current frontend is not updated in this plan.
- All application routes move under `/api/v1`; `/` and framework documentation routes may remain unversioned.
- Routers must not call `Session.query`, `commit`, construct ORM entities, manually build response dictionaries, or import vendor SDKs.
- A write service owns one explicit transaction and commits once after all database state changes succeed.
- Service, job, and integration code must not raise `HTTPException`.
- Database schema and existing data remain unchanged unless a correctness issue proves a migration necessary.
- External delivery gaps are reported, never described as passing.
- Every feature slice ends with focused tests, the complete backend unit suite, and a commit.
- Format the Python paths changed by each task before its scoped Ruff check; Task 10 formats and checks the complete backend.
- `README.md` must be updated after implementation and verified against the actual commands.

## Review Focus

- Concurrent username/email writes: the unique constraint must preserve data and the API must return the common `409 duplicate_user` response rather than leak `IntegrityError`; Task 6 pins this.
- Storage compensation: if MinIO upload succeeds and the metadata commit fails, the uploaded object must be deleted and the transaction rolled back; Task 5 pins this.
- Final-unit checkout and duplicate cart lines: aggregation and row locking must prevent overselling and create exactly one effective quantity per product; Task 7 pins this.
- Invalid, expired, wrong-type, or deleted-user tokens: authentication must return the common error shape without exposing JWT/DB details; Task 6 pins this.
- Empty reviews and soft-deleted related data: empty aggregates return `average_rating: null`, while catalog/dashboard results exclude deleted resources without lazy-load/N+1 regressions; Tasks 3, 4, and 8 pin this.

---

### Task 1: Establish Core Configuration, Error, App, and Quality Foundations

**Files:**
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/errors.py`
- Create: `backend/app/core/schemas.py`
- Create: `backend/tests/test_config.py`
- Create: `backend/tests/test_errors.py`
- Create: `backend/requirements-dev.txt`
- Modify: `backend/app/main.py`
- Modify: `backend/app/core/database.py`
- Modify: `backend/app/core/security.py`
- Modify: `backend/app/core/rate_limiter.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/pyproject.toml`
- Modify: `backend/.env.example`
- Modify: `backend/tests/conftest.py`

**Interfaces:**
- Produces: `Settings`, `get_settings() -> Settings`, and validated fields for database, JWT, Redis, CORS, MinIO, VietQR, and SMTP configuration.
- Produces: `ApplicationError`, `ResourceNotFoundError`, `ConflictError`, `ForbiddenError`, `BusinessRuleError`, `ErrorResponse`, and `register_error_handlers(app: FastAPI) -> None`.
- Produces: generic `Page[T]` with `items`, `total`, `limit`, and `offset`.
- Produces: `create_app(settings: Settings | None = None) -> FastAPI` and global `app = create_app()`.

- [ ] **Step 1: Add failing configuration and error-contract tests**

Add tests with these assertions:

```python
def test_settings_rejects_missing_secret_key():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key="")

def test_application_error_uses_common_shape(client):
    response = client.get("/test/error")
    assert response.status_code == 409
    assert response.json() == {
        "code": "duplicate_resource",
        "message": "Resource already exists",
        "details": None,
    }

def test_unexpected_error_does_not_expose_internal_message(client):
    response = client.get("/test/unexpected")
    assert response.status_code == 500
    assert response.json()["message"] == "Internal server error"
    assert "database password" not in response.text
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_config.py tests\test_errors.py -v -p no:cacheprovider`

Expected: collection/import failure because the new core interfaces do not exist.

- [ ] **Step 3: Implement core interfaces and explicit app construction**

Use `pydantic-settings` for immutable cached settings. Move environment reads out of database, security, and rate-limiter modules. `create_app()` registers error handlers, middleware, lifespan, and existing routers without calling `Base.metadata.create_all()` or MinIO at module import time. The unexpected-error handler logs the exception with a traceback before returning the safe body. Keep current route prefixes until their owning feature task.

- [ ] **Step 4: Add reproducible development dependencies and Ruff configuration**

`requirements.txt` gains `pydantic-settings` and drops the runtime-only-inappropriate `pytest` entry; `requirements-dev.txt` contains `-r requirements.txt`, `pytest`, and `ruff`. Configure Ruff in `pyproject.toml` for Python 3.13, import sorting, common correctness rules, and the existing line-length convention. Do not enable rules that require unrelated rewrites.

- [ ] **Step 5: Run core and regression gates**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_config.py tests\test_errors.py -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest -q -W error::sqlalchemy.exc.SAWarning -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff format app\core app\main.py tests\test_config.py tests\test_errors.py
.\.venv\Scripts\python.exe -m ruff check app\core app\main.py tests\test_config.py tests\test_errors.py
```

Expected: core tests pass; the full suite remains green; Ruff reports no errors in the core files changed by this task.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/core backend/app/main.py backend/requirements*.txt backend/pyproject.toml backend/.env.example backend/tests
git commit -m "refactor: establish backend application boundaries"
```

### Task 2: Make Categories the Reference Feature

**Files:**
- Create: `backend/app/features/categories/schemas.py`
- Delete: `backend/app/features/categories/schema.py`
- Create: `backend/app/features/categories/service.py`
- Modify: `backend/app/features/categories/router.py`
- Modify: `backend/tests/test_categories.py`

**Interfaces:**
- Consumes: `Page[T]`, `ResourceNotFoundError`, `get_db`, and admin authentication from Task 1.
- Produces: `CategoryCreate`, `CategoryPatch`, `CategoryResponse`.
- Produces: `create_category(db, command, actor_id) -> Category`, `list_categories(db, search, limit, offset) -> Page[Category]`, `get_category(db, category_id) -> Category`, `update_category(db, category_id, command, actor_id) -> Category`, and `delete_category(db, category_id, actor_id) -> None`.

- [ ] **Step 1: Rewrite category tests against the new contract**

Pin `/api/v1/categories`, collection pagination, `PATCH`, `204`, audit fields from the authenticated admin rather than request data, and the common 404 body:

```python
assert client.get("/api/v1/categories").json().keys() == {
    "items", "total", "limit", "offset"
}
assert client.delete(f"/api/v1/categories/{category.id}").status_code == 204
assert response_404.json()["code"] == "category_not_found"
```

- [ ] **Step 2: Run category tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_categories.py -v -p no:cacheprovider`

Expected: failures on the versioned routes and response shapes.

- [ ] **Step 3: Implement the category schemas and use cases**

The service performs every query and commit. The router declares response models and delegates once. Remove `category_to_db`, `category_to_json`, request-controlled audit identifiers, and direct router transactions.

- [ ] **Step 4: Verify category and full backend behavior**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_categories.py -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest -q -W error::sqlalchemy.exc.SAWarning -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff check app\features\categories tests\test_categories.py
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/features/categories backend/tests/test_categories.py
git commit -m "refactor: establish category service pattern"
```

### Task 3: Extract Product Catalog Use Cases and Typed Responses

**Files:**
- Create: `backend/app/features/products/schemas.py`
- Delete: `backend/app/features/products/schema.py`
- Create: `backend/app/features/products/service.py`
- Modify: `backend/app/features/products/router.py`
- Modify: `backend/tests/test_products.py`

**Interfaces:**
- Consumes: `Page[T]`, application errors, category models, and Task 2's active-category behavior.
- Produces: `ProductCreate`, `ProductPatch`, `ProductFilters`, `CategorySummary`, `ProductImageResponse`, and `ProductResponse`.
- Produces: `create_product(db, command) -> Product`, `list_products(db, filters) -> Page[Product]`, `get_product(db, product_id) -> Product`, `update_product(db, product_id, command) -> Product`, and `delete_product(db, product_id) -> None`.

- [ ] **Step 1: Add failing catalog contract and service tests**

Pin `/api/v1/products`, canonical sort/stock enums, partial patch behavior, a single 404 error shape, and deleted-category filtering. Include query-count coverage proving category/image relationships do not introduce per-item queries.

```python
assert page == {"items": ANY, "total": 2, "limit": 20, "offset": 0}
assert client.get("/api/v1/products?sort=price_asc").status_code == 200
assert client.get("/api/v1/products?sort=price-asc").status_code == 422
assert client.patch(f"/api/v1/products/{product.id}", json={"name": "New"}).status_code == 200
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_products.py -v -p no:cacheprovider`

Expected: versioned routes, patch behavior, and response DTO assertions fail.

- [ ] **Step 3: Implement catalog services and schemas**

Keep SQLAlchemy filtering/eager-loading in the service because it is used once. Use enum-backed filter fields. Preserve inventory validation from the existing schema. Return ORM objects through typed response schemas; computed public image URLs may use a narrow schema validator/helper, not a router dictionary.

- [ ] **Step 4: Keep review/image endpoints reachable under the new prefix**

Move their existing route declarations to `/api/v1/products` during this task without changing their business implementation; Tasks 4 and 5 remove their remaining router logic. Update affected route strings in review tests.

- [ ] **Step 5: Verify catalog and regression gates**

Run product tests, then the complete backend suite with SQLAlchemy warnings fatal, then Ruff on the product package and tests. Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/features/products backend/tests/test_products.py backend/tests/test_reviews.py
git commit -m "refactor: extract product catalog use cases"
```

### Task 4: Isolate Product Review Behavior

**Files:**
- Create: `backend/app/features/products/reviews.py`
- Modify: `backend/app/features/products/schemas.py`
- Modify: `backend/app/features/products/router.py`
- Modify: `backend/tests/test_reviews.py`

**Interfaces:**
- Consumes: product/application errors and product response conventions from Task 3.
- Produces: `ReviewCreate` with `rating: int = Field(ge=1, le=5)`, `ReviewResponse`, `ReviewSummary` with `average_rating: float | None`.
- Produces: `list_product_reviews(db, product_id) -> ReviewSummary` and `create_product_review(db, product_id, user, command) -> ProductReview`.

- [ ] **Step 1: Add failing review behavior tests**

```python
assert client.get(f"/api/v1/products/{product.id}/reviews").json() == {
    "average_rating": None,
    "total_reviews": 0,
    "reviews": [],
}
assert client.post(path, json={"rating": 0}).status_code == 422
assert client.post(path, json={"rating": 6}).status_code == 422
```

Retain verified-purchase coverage and add a soft-deleted product 404 case.

- [ ] **Step 2: Run review tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_reviews.py -v -p no:cacheprovider`

Expected: empty rating remains `5.0` and validation/error contract assertions fail.

- [ ] **Step 3: Implement review use cases and thin routes**

Move product lookup, purchase verification, aggregation, commit, and response construction out of the router. Do not create a review repository.

- [ ] **Step 4: Run review, product, full-suite, and Ruff gates**

Expected: all pass and no review business logic remains in the router.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/features/products backend/tests/test_reviews.py
git commit -m "refactor: isolate product review use cases"
```

### Task 5: Add a Compensating Product Storage Boundary

**Files:**
- Create: `backend/app/integrations/storage.py`
- Create: `backend/app/features/products/images.py`
- Create: `backend/tests/test_product_images.py`
- Modify: `backend/app/features/products/schemas.py`
- Modify: `backend/app/features/products/router.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Delete after consumers move: `backend/app/integrations/minio_client.py`

**Interfaces:**
- Produces: `ProductStorage` protocol with `ensure_bucket()`, `put(object_name, stream, content_type)`, `delete(object_name)`, and `public_url(object_name) -> str`.
- Produces: `MinioProductStorage(settings: Settings)` and `get_product_storage() -> ProductStorage`.
- Produces: `store_product_image(db, storage, product_id, stream, filename, content_type) -> ProductImage`.

- [ ] **Step 1: Add failing fake-storage lifecycle tests**

Cover successful upload, product-not-found without upload, filename without a safe supported extension, and commit failure compensation:

```python
with pytest.raises(DatabaseError):
    store_product_image(failing_db, fake_storage, product.id, stream, "x.png", "image/png")
assert fake_storage.deleted == [fake_storage.put_objects[0]]
assert failing_db.rollback_called
```

- [ ] **Step 2: Run image tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_product_images.py -v -p no:cacheprovider`

Expected: import failure for the new boundary/use case.

- [ ] **Step 3: Implement storage adapter and image use case**

The router passes primitive file metadata and a stream; it does not import MinIO. Generate object names internally, validate supported image types, upload first, commit metadata second, and delete the object on database failure. Bucket initialization moves to application lifespan.

- [ ] **Step 4: Verify product image, product, full-suite, and Ruff gates**

Expected: all pass; searching the product router for `minio`, `put_object`, and `commit` returns no matches.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/integrations backend/app/features/products backend/app/main.py backend/tests
git commit -m "refactor: isolate product image storage"
```

### Task 6: Refactor Users, Authentication, and Queue Failure Handling

**Files:**
- Create: `backend/app/features/users/service.py`
- Create: `backend/app/integrations/queue.py`
- Create: `backend/app/features/users/schemas.py`
- Delete: `backend/app/features/users/schema.py`
- Modify: `backend/app/features/users/router.py`
- Modify: `backend/app/core/security.py`
- Modify: `backend/tests/test_users.py`
- Modify: `backend/tests/test_queue.py`
- Delete after consumers move: `backend/app/core/queue.py`

**Interfaces:**
- Produces: `TaskQueue` protocol with `async enqueue(task_name: str, *args: object) -> None`, `ArqTaskQueue`, and `get_task_queue() -> TaskQueue`.
- Produces: `UserCreate`, `UserPatch`, `UserResponse`, `LoginCommand`, `TokenPair`, `PasswordChange`.
- Produces user use cases: `register_user`, `login_user`, `refresh_user_session`, `update_profile`, `change_password`, `list_users`, `get_user`, `create_user`, `update_user`, and `delete_user` with typed inputs/results.
- Produces: token encode/decode helpers in `core.security` that raise application authentication errors; FastAPI authentication dependencies remain transport adapters.

- [ ] **Step 1: Rewrite user tests for `/api/v1/users` and the common contract**

Cover create/profile/admin paths, refresh cookies, `PATCH`, `204`, queue outage after commit, and error codes. Add parameterized access-token tests for missing, malformed, expired, refresh-token-as-access, and deleted-user cases.

- [ ] **Step 2: Add the concurrent uniqueness regression**

Use two independent MariaDB sessions when `TEST_DATABASE_URL` is available; otherwise keep a unit test that forces `IntegrityError`. Assert one write succeeds, one receives `409 duplicate_user`, and neither existing record is partially mutated.

- [ ] **Step 3: Run user and queue tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_users.py tests\test_queue.py -v -p no:cacheprovider`

Expected: new paths, response shapes, and service imports fail.

- [ ] **Step 4: Implement user services and queue adapter**

Centralize uniqueness queries and translate unique-constraint races after rollback. Commit the user before best-effort enqueue; log queue failure without changing success. Cookie creation/deletion stays in the router. Remove password hashing from the schema module.

- [ ] **Step 5: Verify user/security, full-suite, and Ruff gates**

Expected: all pass; the user router contains no SQLAlchemy query, commit, hashing, or token construction.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/features/users backend/app/core/security.py backend/app/integrations/queue.py backend/tests
git rm backend/app/core/queue.py
git commit -m "refactor: extract user and authentication use cases"
```

### Task 7: Consolidate Order Domain Policy and Application Use Cases

**Files:**
- Create: `backend/app/features/orders/domain.py`
- Create: `backend/app/features/orders/schemas.py`
- Delete: `backend/app/features/orders/schema.py`
- Modify: `backend/app/features/orders/service.py`
- Modify: `backend/app/features/orders/router.py`
- Modify: `backend/tests/test_orders.py`
- Modify: `backend/tests/integration/test_checkout_concurrency.py`
- Modify: `backend/tests/integration/test_order_transition_concurrency.py`

**Interfaces:**
- Consumes: `TaskQueue`, common errors/page contract, and security/user types from earlier tasks.
- Produces pure domain functions `available_stock(product) -> int`, `aggregate_cart_items(items) -> dict[int, int]`, and `apply_order_transition(order, new_status, now=None) -> None`.
- Produces: `OrderResponse`, `CheckoutCommand`, `CheckoutResponse`, `OrderPatchStatus`, `TrackingResponse`.
- Produces order use cases: `checkout_cart`, `list_orders`, `get_order_for_user`, `change_order_status`, `list_user_orders`, `track_order`, and `expire_pending_orders`.

- [ ] **Step 1: Move existing transition/inventory expectations into failing domain tests**

Add `backend/tests/test_order_domain.py` and pin duplicate-line aggregation, non-positive quantities, all allowed/forbidden transitions, inventory release, sold conversion, and already-transitioned orders.

- [ ] **Step 2: Rewrite API tests for `/api/v1/orders` and typed errors**

Pin pagination, ownership hiding, checkout response, canonical statuses, `409 insufficient_stock`, `409 invalid_order_transition`, and common 404/403 bodies.

- [ ] **Step 3: Run order tests and verify RED**

Run the domain and order unit tests. Expected: missing domain module/new contract failures.

- [ ] **Step 4: Implement domain policy and transactional order services**

Lock products in stable ID order, aggregate duplicates before availability checks, mutate all rows, commit once, refresh results, then enqueue best-effort notifications. The router performs no query or payment URL construction. Keep VietQR URL generation in the existing integration until Task 9 normalizes integrations.

- [ ] **Step 5: Run unit and MariaDB concurrency gates**

Run the order tests and full unit suite. If `TEST_DATABASE_URL` is configured, run both concurrency files and require one success/one conflict for the final unit. Otherwise record the exact skip.

- [ ] **Step 6: Run Ruff and commit**

```powershell
git add backend/app/features/orders backend/tests
git commit -m "refactor: consolidate order domain and use cases"
```

### Task 8: Refactor Dashboard as a Read-Only Cross-Feature Service

**Files:**
- Create: `backend/app/features/dashboard/schemas.py`
- Create: `backend/app/features/dashboard/service.py`
- Modify: `backend/app/features/dashboard/router.py`
- Create: `backend/tests/test_dashboard.py`

**Interfaces:**
- Consumes: product/order models and their response schemas, but never their routers.
- Produces: `DashboardMetrics`, `RecentOrderSummary`, `LowStockProductSummary`.
- Produces: `get_metrics(db) -> DashboardMetrics`, `get_recent_orders(db, limit) -> list[RecentOrderSummary]`, and `get_low_stock_products(db, limit) -> list[LowStockProductSummary]`.

- [ ] **Step 1: Add failing dashboard contract/query tests**

Pin `/api/v1/dashboard`, exclude soft-deleted products, define low stock as `0 <= available < 20`, count only intended pending states, sum paid revenue, and verify bounded query counts.

- [ ] **Step 2: Run dashboard tests and verify RED**

Expected: versioned paths and typed responses fail.

- [ ] **Step 3: Implement dashboard schemas/service and thin router**

Remove imports from product/order routers. Keep cross-feature aggregate SQL in this read-only service; do not add a repository.

- [ ] **Step 4: Run dashboard, full-suite, Ruff, and commit**

```powershell
git add backend/app/features/dashboard backend/tests/test_dashboard.py
git commit -m "refactor: isolate dashboard read models"
```

### Task 9: Normalize Email, Queue, VietQR, Workers, and Scheduled Jobs

**Files:**
- Create: `backend/app/integrations/email.py`
- Modify: `backend/app/integrations/vietqr.py`
- Create: `backend/app/jobs/emails.py`
- Create: `backend/app/jobs/orders.py`
- Modify: `backend/app/worker.py`
- Modify: `backend/tests/test_email_service.py`
- Modify: `backend/tests/test_worker.py`
- Modify: `backend/tests/test_queue.py`
- Delete: `backend/app/core/email.py`
- Delete: `backend/app/jobs/order_jobs.py`
- Delete if repository search confirms no consumer: `backend/app/integrations/paddle_client.py`

**Interfaces:**
- Consumes: Settings, user/order read use cases, `expire_pending_orders`, and queue adapter from prior tasks.
- Produces: `EmailSender` protocol, `SmtpEmailSender`, `render_email_template`, `VietQRInstructions`, and `build_vietqr_instructions(amount, memo, settings)`.
- Produces thin ARQ functions that open a session, invoke one job/use case, and close the session.

- [ ] **Step 1: Add failing adapter and worker delegation tests**

Verify disabled/console/SMTP email modes, Redis URL parsing, VietQR rounding/encoding, missing notification subjects, worker session closure on error, and cron delegation without duplicated transition logic.

- [ ] **Step 2: Run integration-adapter tests and verify RED**

Run email, queue, and worker tests. Expected: new module imports fail.

- [ ] **Step 3: Move concrete adapters and make worker entry points thin**

Centralize settings use, use structured logger calls rather than `print`/f-strings for operational errors, and keep vendor exceptions at the adapter boundary. Remove Paddle client only after an exact reference scan confirms no live consumer; retain database columns because schema cleanup is out of scope.

- [ ] **Step 4: Run adapter/worker, full-suite, Ruff, and commit**

```powershell
git add backend/app/integrations backend/app/jobs backend/app/worker.py backend/tests
git rm backend/app/core/email.py backend/app/jobs/order_jobs.py
git commit -m "refactor: normalize backend integrations and jobs"
```

### Task 10: Remove Legacy Helpers and Enforce Architecture Boundaries

**Files:**
- Create: `backend/tests/test_architecture.py`
- Create: `backend/tests/test_openapi_contract.py`
- Modify: `backend/app/core/database.py`
- Modify: `backend/app/main.py`
- Modify as reported by scans: backend imports and tests still referencing old routes/helpers

**Interfaces:**
- Consumes: all completed feature contracts.
- Produces: a single `/api/v1` application surface, no `save_to_db`, no legacy router mappers, and executable dependency-boundary tests.

- [ ] **Step 1: Add failing architecture and OpenAPI tests**

Use Python AST rather than substring matching. Assert router modules do not call `.query()`/`.commit()`, construct ORM model classes, or import vendor packages such as `minio`, `arq`, or `aiosmtplib`; assert core/integrations do not import `features.*.router`; assert every application path except `/` begins `/api/v1`; assert common error schemas appear in OpenAPI. Importing a narrow dependency factory such as `get_task_queue` from an application-owned integration module is allowed.

- [ ] **Step 2: Run the boundary tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_architecture.py tests\test_openapi_contract.py -v -p no:cacheprovider`

Expected: legacy helpers/imports or unversioned endpoints are reported precisely.

- [ ] **Step 3: Remove every reported legacy path**

Delete `save_to_db`, `*_to_json`, obsolete schema aliases, unused integration modules, duplicate settings constants, and old route strings only when the boundary/reference scans prove consumers have moved.

- [ ] **Step 4: Run all static and unit gates**

Run:

```powershell
.\.venv\Scripts\python.exe -m ruff format app tests
.\.venv\Scripts\python.exe -m ruff format --check app tests
.\.venv\Scripts\python.exe -m ruff check app tests
.\.venv\Scripts\python.exe -m compileall -q app tests
.\.venv\Scripts\python.exe -m pytest -q -W error::sqlalchemy.exc.SAWarning -p no:cacheprovider
```

Expected: all pass; only the already documented third-party Starlette/httpx deprecation may remain.

- [ ] **Step 5: Commit**

```powershell
git add backend
git commit -m "refactor: enforce backend dependency boundaries"
```

### Task 11: Update README, Validate Deployment Paths, and Review the Complete Diff

**Files:**
- Modify: `README.md`
- Create: `docs/reviews/2026-10-11-mvp-solid-backend-review.md`

**Interfaces:**
- Consumes: the implemented backend structure, API contract, verified commands, and approved spec.
- Produces: reproducible onboarding documentation and a severity-ranked final review.

- [ ] **Step 1: Rewrite the backend README sections from verified behavior**

Document the dependency direction, exact backend tree, `/api/v1`, error body, environment variables, server/worker/seed/migration commands, test/Ruff/compile commands, module-promotion rule, and the explicit note that the current frontend awaits migration. Remove stale claims such as full async I/O or dependencies deleted from the frontend.

- [ ] **Step 2: Verify every documented command or mark its prerequisite**

Run the backend server import check, worker settings import, seed help/dry path if available, Ruff, compile, unit tests, and Alembic upgrade/current on a new temporary SQLite database. Remove only the verified temporary database afterward.

- [ ] **Step 3: Run external MariaDB tests when reachable**

Run checkout concurrency, transition concurrency, the user uniqueness race, and fulfillment migration against `TEST_DATABASE_URL`. If Docker/database is unavailable, record the exact command and blocker without claiming a pass.

- [ ] **Step 4: Perform a read-only final code review**

Review the complete implementation range against the spec. Report Critical/High/Medium/Low findings with file references, fix Critical and High findings using regression tests, and rerun the owning gates. Explicitly review SOLID value versus boilerplate, transactions, authorization, error/OpenAPI consistency, naming, module sizes, and onboarding clarity.

- [ ] **Step 5: Write the final review report**

Record changed modules, API-breaking changes, deleted legacy code, every gate result, external gaps, and remaining Low findings in `docs/reviews/2026-10-11-mvp-solid-backend-review.md`.

- [ ] **Step 6: Run final repository gates and commit**

Run `git diff --check`, the complete Ruff/compile/pytest suite, the empty-database Alembic check, and `git status --short`. Then commit:

```powershell
git add README.md docs/reviews/2026-10-11-mvp-solid-backend-review.md
git commit -m "docs: update backend architecture and review"
```

Expected: the tracked tree is clean; generated caches/test databases are removed after verification; the branch is ready for final review and integration choice.
