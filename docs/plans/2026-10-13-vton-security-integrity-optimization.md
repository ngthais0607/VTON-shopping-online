# TrueLook Security, Integrity & Operational Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix MariaDB Alembic downgrade bug, implement bounded RAM & magic-byte product image validation, align technical documentation, implement late webhook payments with admin reconciliation, enforce non-null public_code, harden MinIO configuration, enable full backend ruff checks, isolate frontend access token in memory with BroadcastChannel sync, optimize Next.js images, and ensure production readiness.

**Architecture:** 
- Database migrations use native MariaDB drop operations respecting InnoDB FK constraints.
- Image streaming enforces a strict 5MB + 1 byte boundary with header signature sniffing (JPEG, PNG, WebP).
- Webhook handles late payments gracefully without mutating inventory, exposing reconciliation for admins.
- Frontend access tokens live strictly in JavaScript module memory with cross-tab logout synchronization via `BroadcastChannel` and silent cookie-based refresh.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, MariaDB 11.2 (InnoDB), Next.js 16 (App Router), TypeScript 5.7.3, Axios, Vitest, Pytest, Ruff.

## Global Constraints
- Preserve all existing 253 backend tests and 52 frontend tests.
- All database operations and migrations must succeed idempotently on MariaDB 11.2.
- Clean Git history: one commit per phase/subtask with Conventional Commits messages.
- Test-Driven Development (TDD): write failing test first, verify failure, implement fix, verify pass.

---

### Task 1: Phase A1 - Fix MariaDB Alembic Downgrade & Roundtrip Integration Test

**Files:**
- Modify: `backend/alembic/versions/d4a7c8e91f23_order_items_and_reviews_integrity.py:105-135`
- Modify: `backend/alembic/versions/6ea70e2e94f1_initial_schema.py:136-164`
- Create: `backend/tests/integration/test_migration_roundtrip.py`
- Modify: `.github/workflows/ci.yml:85-95`
- Modify: `MIGRATION_NOTES.md:20-35`

**Interfaces:**
- Consumes: Alembic migration files `6ea70e2e94f1` through `e5b8c9d0f1a2`.
- Produces: Reliable idempotent `alembic upgrade head` and `alembic downgrade base` on MariaDB.

- [ ] **Step 1: Write integration test for migration round-trip**

Create `backend/tests/integration/test_migration_roundtrip.py`:
```python
import os
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


@pytest.mark.integration
def test_alembic_roundtrip_two_cycles():
    db_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not db_url or "sqlite" in db_url:
        pytest.skip("MariaDB/MySQL environment required for migration roundtrip test")

    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    ini_path = os.path.join(backend_dir, "alembic.ini")
    alembic_cfg = Config(ini_path)
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)

    engine = create_engine(db_url)

    # Cycle 1: upgrade head -> downgrade base -> upgrade head
    command.upgrade(alembic_cfg, "head")
    command.downgrade(alembic_cfg, "base")
    inspector = inspect(engine)
    assert "order_items" not in inspector.get_table_names()
    assert "orders" not in inspector.get_table_names()

    command.upgrade(alembic_cfg, "head")
    inspector = inspect(engine)
    assert "order_items" in inspector.get_table_names()
    assert "orders" in inspector.get_table_names()
    assert "products" in inspector.get_table_names()

    # Cycle 2: verify idempotence
    command.downgrade(alembic_cfg, "base")
    command.upgrade(alembic_cfg, "head")
    inspector = inspect(engine)
    assert "order_items" in inspector.get_table_names()
    assert "product_reviews" in inspector.get_table_names()
```

- [ ] **Step 2: Fix `d4a7c8e91f23` downgrade function**

In `backend/alembic/versions/d4a7c8e91f23_order_items_and_reviews_integrity.py`:
Replace lines 122-135 with direct table drop without pre-dropping foreign key indexes:
```python
    op.drop_table("order_items")
    op.drop_table("product_reviews")
```

Also audit `6ea70e2e94f1_initial_schema.py`:
Ensure tables are dropped in reverse FK order without dropping indexes individually beforehand.

- [ ] **Step 3: Update `.github/workflows/ci.yml`**

Add roundtrip check after migration upgrade step:
```yaml
      - name: Verify Migration Downgrade & Upgrade Roundtrip
        working-directory: backend
        run: |
          python -m alembic downgrade base
          python -m alembic upgrade head
```

- [ ] **Step 4: Update `MIGRATION_NOTES.md`**

Add warning note under revision history:
`> Warning: Downgrading d4a7c8e91f23 drops 'order_items' and 'product_reviews' tables, resulting in permanent data loss for review records and normalized order items.`

- [ ] **Step 5: Run tests and verify**

Run: `pytest tests/integration/test_migration_roundtrip.py -v` (on active DB)

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/ backend/tests/integration/test_migration_roundtrip.py .github/workflows/ci.yml MIGRATION_NOTES.md
git commit -m "fix(migrations): fix alembic downgrade on mariadb and add roundtrip verification test"
```

---

### Task 2: Phase A2 - Safe Image Upload with Bounded RAM and Magic-Byte Sniffing

**Files:**
- Modify: `backend/app/features/products/images.py`
- Modify: `backend/tests/test_product_images.py`

**Interfaces:**
- Consumes: `stream: BinaryIO`, `filename: str`, `content_type: str`.
- Produces: `sniff_image_type(data: bytes) -> str | None`, `store_product_image(...) -> ProductImage`.

- [ ] **Step 1: Write failing tests in `backend/tests/test_product_images.py`**

Add tests for bounded reading, empty file rejection, magic byte sniffing:
```python
class CountingStream(BytesIO):
    def __init__(self, data: bytes):
        super().__init__(data)
        self.bytes_read = 0

    def read(self, size=-1):
        chunk = super().read(size)
        self.bytes_read += len(chunk)
        return chunk


def test_store_product_image_does_not_read_beyond_max_plus_one(db_session):
    product = persist_product(db_session)
    storage = FakeProductStorage()
    large_data = b"\x89PNG\r\n\x1a\n" + b"x" * (5 * 1024 * 1024 + 100)
    stream = CountingStream(large_data)

    with pytest.raises(BusinessRuleError) as exc:
        store_product_image(
            db_session,
            storage,
            product.id,
            stream,
            "large.png",
            "image/png",
        )
    assert exc.value.code == "image_too_large"
    assert stream.bytes_read <= (5 * 1024 * 1024 + 1)


def test_store_product_image_rejects_empty_file(db_session):
    product = persist_product(db_session)
    storage = FakeProductStorage()
    with pytest.raises(BusinessRuleError) as exc:
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(b""),
            "empty.png",
            "image/png",
        )
    assert exc.value.code == "invalid_product_image"


def test_store_product_image_rejects_spoofed_extension(db_session):
    product = persist_product(db_session)
    storage = FakeProductStorage()
    png_header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    with pytest.raises(BusinessRuleError) as exc:
        store_product_image(
            db_session,
            storage,
            product.id,
            BytesIO(png_header),
            "image.jpg",
            "image/jpeg",
        )
    assert exc.value.code == "invalid_product_image"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/test_product_images.py -k "CountingStream or empty_file or spoofed"`
Expected: FAIL

- [ ] **Step 3: Implement `sniff_image_type` and bounded read in `backend/app/features/products/images.py`**

```python
def sniff_image_type(data: bytes) -> str | None:
    if len(data) >= 3 and data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if len(data) >= 8 and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if (
        len(data) >= 12
        and data[:4] == b"RIFF"
        and data[8:12] == b"WEBP"
    ):
        return "webp"
    return None
```
In `store_product_image`:
- Read `payload = stream.read(MAX_IMAGE_SIZE_BYTES + 1)`
- If `len(payload) == 0`: raise `BusinessRuleError("Product image file cannot be empty", code="invalid_product_image")`
- If `len(payload) > MAX_IMAGE_SIZE_BYTES`: raise `BusinessRuleError("Product image must not exceed 5MB", code="image_too_large")`
- Sniff type: `sniffed = sniff_image_type(payload[:16])`. If `not sniffed`: raise `BusinessRuleError(...)`
- Validate sniffed type matches client extension (`.jpg`, `.jpeg` -> `jpeg`, `.png` -> `png`, `.webp` -> `webp`) and Content-Type.
- Construct `object_name = f"products/{image_id}.{sniffed if sniffed != 'jpeg' else 'jpg'}"`.
- Update dummy fixtures in `test_product_images.py` with valid headers:
  - PNG: `b"\x89PNG\r\n\x1a\n" + b"..."`
  - JPEG: `b"\xff\xd8\xff" + b"..."`
  - WebP: `b"RIFF\x00\x00\x00\x00WEBP" + b"..."`

- [ ] **Step 4: Run tests to verify all pass**

Run: `pytest backend/tests/test_product_images.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/features/products/images.py backend/tests/test_product_images.py
git commit -m "feat(products): enforce bounded stream reading and magic byte image validation"
```

---

### Task 3: Phase B - Documentation Corrections in `MIGRATION_NOTES.md` and `README.md`

**Files:**
- Modify: `MIGRATION_NOTES.md`
- Modify: `README.md`

- [ ] **Step 1: Update `MIGRATION_NOTES.md`**
- Change "Constant-time HMAC-SHA256 webhook verification" to "Timing-safe static secret verification (`hmac.compare_digest`) via `X-Webhook-Secret` header".
- Change "TypeScript 5.8" to "TypeScript 5.7.3".
- Add "Known Limitations" section:
  - Webhook verification uses a static header secret without payload body hashing or replay defense.
  - Background email delivery operates on best-effort dispatch via Redis ARQ with structured logging; dead-letter retry tables are not yet persisted.
  - Alembic rollback past revision `d4a7c8e91f23` irreversibly drops `order_items` and `product_reviews`.

- [ ] **Step 2: Update `README.md`**
Align mentions of TypeScript, webhooks, and image storage.

- [ ] **Step 3: Commit**

```bash
git add MIGRATION_NOTES.md README.md
git commit -m "docs: align architecture documentation with implementation reality"
```

---

### Task 4: Phase C1 - Late Payment Handling for Expired/Cancelled Orders & Admin Endpoint

**Files:**
- Modify: `backend/app/features/orders/webhook.py` (or service where webhook is processed)
- Modify: `backend/app/features/orders/service.py`
- Modify: `backend/app/features/orders/router.py`
- Modify: `backend/tests/test_vietqr_webhook.py`
- Create/Modify: `backend/tests/test_admin_orders.py`

**Interfaces:**
- Consumes: VietQR webhook payload.
- Produces: `Payment(status="late_payment")`, `GET /api/v1/orders/late-payments` endpoint.

- [ ] **Step 1: Write failing tests**

In `backend/tests/test_vietqr_webhook.py`:
- Test webhook arriving for order with `status="expired"`:
  - Order status remains `expired`.
  - Inventory is not modified.
  - Payment created with `status="late_payment"`.
  - Response returns `status="late_payment"`.
  - Second webhook with same transaction ID returns idempotent response without creating duplicate payment.
- Test `GET /api/v1/orders/late-payments`:
  - Returns paginated list of late payments for admin user.
  - Returns 403 for non-admin user.

- [ ] **Step 2: Run tests to verify failure**

Run: `pytest backend/tests/test_vietqr_webhook.py -k "late_payment"`
Expected: FAIL

- [ ] **Step 3: Implement late payment logic & router endpoint**

In webhook handler:
- If order is expired/cancelled:
  - Do NOT change order status, do NOT restore or alter inventory.
  - Query if payment already exists with `provider="vietqr"` and `provider_transaction_id=trans_id`. If so, return already processed.
  - Create `Payment(order_id=order.id, provider="vietqr", provider_transaction_id=trans_id, amount=amount, currency="VND", status="late_payment")`.
  - Log warning with structured details: `order_id`, `provider_transaction_id`, `amount`, `order_status`.
  - Return `{"status": "late_payment", "order_id": order.id, "payment_id": payment.id}`.
- In `backend/app/features/orders/router.py`:
  - Add `GET /api/v1/orders/late-payments` requiring admin role, returning paginated late payments.

- [ ] **Step 4: Run tests to verify pass**

Run: `pytest backend/tests/test_vietqr_webhook.py backend/tests/test_admin_orders.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/features/orders/ backend/tests/
git commit -m "feat(orders): handle late webhook payments on expired orders and add admin reconciliation endpoint"
```

---

### Task 5: Phase C2 - Remove Default MinIO Secrets & Enforce Validation

**Files:**
- Modify: `backend/app/core/config.py:43-47`
- Modify: `backend/.env.example`
- Modify: `docker-compose.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_settings.py`

**Interfaces:**
- Consumes: Environment variables.
- Produces: `Settings` object with strictly validated non-empty `minio_access_key` and `minio_secret_key`.

- [ ] **Step 1: Write failing test in `backend/tests/test_settings.py`**

```python
import pytest
from pydantic import ValidationError
from app.core.config import Settings


def test_settings_raises_validation_error_when_minio_credentials_missing(monkeypatch):
    monkeypatch.delenv("MINIO_ACCESS_KEY", raising=False)
    monkeypatch.delenv("MINIO_SECRET_KEY", raising=False)
    with pytest.raises(ValidationError) as exc:
        Settings(
            _env_file=None,
            secret_key="a" * 32,
            vietqr_bank_id="MB",
            vietqr_account_no="123456",
            minio_access_key="",
            minio_secret_key="",
        )
    errors = str(exc.value)
    assert "minio_access_key" in errors or "minio_secret_key" in errors
```

- [ ] **Step 2: Run test to verify failure**

Run: `pytest backend/tests/test_settings.py -v`
Expected: FAIL

- [ ] **Step 3: Update `backend/app/core/config.py`**

Change:
```python
    minio_access_key: str = Field(min_length=1)
    minio_secret_key: str = Field(min_length=1)
```
Remove default `"admin"` and `"password123"`.
Update `backend/tests/conftest.py`:
```python
os.environ["MINIO_ACCESS_KEY"] = "test-minio-access-key"
os.environ["MINIO_SECRET_KEY"] = "test-minio-secret-key"
```
Update `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml` with explicit keys.

- [ ] **Step 4: Run test to verify pass**

Run: `pytest backend/tests/test_settings.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/.env.example docker-compose.yml .github/workflows/ci.yml backend/tests/
git commit -m "refactor(config): remove default minio credentials and enforce explicit non-empty validation"
```

---

### Task 6: Phase C3 - Make `orders.public_code` NOT NULL and Remove Runtime Fallback

**Files:**
- Create: `backend/alembic/versions/<hash>_enforce_orders_public_code_not_null.py`
- Modify: `backend/app/features/orders/service.py`
- Modify: `backend/tests/test_orders.py`

**Interfaces:**
- Consumes: `orders.public_code` database column.
- Produces: Guaranteed non-null public codes on all order records.

- [ ] **Step 1: Create Alembic migration**

Run `alembic revision` or create migration script:
```python
"""enforce orders public_code not null

Revision ID: f6a1b2c3d4e5
Revises: e5b8c9d0f1a2
"""
from uuid import uuid4
from alembic import op
import sqlalchemy as sa

revision = 'f6a1b2c3d4e5'
down_revision = 'e5b8c9d0f1a2'

def upgrade() -> None:
    bind = op.get_bind()
    orders_table = sa.table("orders", sa.column("id", sa.Integer), sa.column("public_code", sa.String))
    result = bind.execute(sa.select(orders_table.c.id).where(orders_table.c.public_code.is_(None))).fetchall()
    for row in result:
        bind.execute(
            orders_table.update()
            .where(orders_table.c.id == row[0])
            .values(public_code=uuid4().hex)
        )
    with op.batch_alter_table("orders") as batch_op:
        batch_op.alter_column("public_code", existing_type=sa.String(36), nullable=False)

def downgrade() -> None:
    with op.batch_alter_table("orders") as batch_op:
        batch_op.alter_column("public_code", existing_type=sa.String(36), nullable=True)
```

- [ ] **Step 2: Update `orders/service.py`**

In `order_to_response`:
Remove `public_code = order.public_code or uuid4().hex`.
Directly read `order.public_code`. If `not order.public_code`: raise `BusinessRuleError("Order public code missing", code="order_integrity_error")`.

- [ ] **Step 3: Run tests to verify pass**

Run: `pytest backend/tests/test_orders.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/ backend/app/features/orders/service.py backend/tests/test_orders.py
git commit -m "fix(orders): enforce not null constraint on orders public_code and remove runtime fallback"
```

---

### Task 7: Phase C4 - Standardize Alembic Linting with Ruff

**Files:**
- Modify: `backend/alembic/env.py`
- Modify: `backend/alembic/versions/*.py`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add `# noqa: F401` in `backend/alembic/env.py`**

Annotate model imports:
```python
from app.core.database import Base  # noqa: F401
from app.features.users.model import User  # noqa: F401
from app.features.categories.model import Category  # noqa: F401
from app.features.products.model import Product, ProductImage, ProductReview  # noqa: F401
from app.features.orders.model import Order, OrderItem, Payment  # noqa: F401
```

- [ ] **Step 2: Run ruff check on alembic and auto-fix**

Run: `cd backend && ruff check alembic/ --fix`

- [ ] **Step 3: Update `.github/workflows/ci.yml`**

Change lint command:
```yaml
      - name: Lint with Ruff
        working-directory: backend
        run: |
          ruff check .
```

- [ ] **Step 4: Verify `ruff check .` passes with 0 errors**

Run: `cd backend && ruff check .`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/ .github/workflows/ci.yml
git commit -m "chore(lint): include alembic in ruff check and annotate model registration imports"
```

---

### Task 8: Phase C5 - Frontend In-Memory Access Token & Multi-Tab Synchronization

**Files:**
- Modify: `frontend/lib/session.ts`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/__tests__/session.test.tsx`
- Modify: `frontend/__tests__/api-client.test.ts`
- Modify: `frontend/vitest.setup.ts`

**Interfaces:**
- Consumes: HttpOnly refresh token cookie on `POST /api/v1/users/refresh`.
- Produces: In-memory access token storage, `BroadcastChannel('truelook_auth_sync')` logout propagation.

- [ ] **Step 1: Update `frontend/lib/session.ts`**

Eliminate `localStorage.getItem('token')`.
Implement:
```typescript
let inMemoryAccessToken: string | null = null;
let generation = 0;
const listeners = new Set<() => void>();
let sessionNotice: string | null = null;

const authChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('truelook_auth_sync')
  : null;

if (authChannel) {
  authChannel.onmessage = (event) => {
    if (event.data?.type === 'LOGOUT') {
      inMemoryAccessToken = null;
      generation++;
      listeners.forEach(l => l());
    }
  };
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setAccessToken(token: string): void {
  generation++;
  sessionNotice = null;
  renewAccessToken(token);
}

export function renewAccessToken(token: string): void {
  inMemoryAccessToken = token;
  listeners.forEach(l => l());
}

export function clearAccessToken(): void {
  generation++;
  inMemoryAccessToken = null;
  if (authChannel) {
    authChannel.postMessage({ type: 'LOGOUT' });
  }
  listeners.forEach(l => l());
}
```

- [ ] **Step 2: Update tests and vitest setup**

In `frontend/vitest.setup.ts`, provide mock `BroadcastChannel` implementation if missing.
Update `frontend/__tests__/session.test.tsx` and `api-client.test.ts` to test in-memory storage and cross-tab logout message broadcasting.

- [ ] **Step 3: Run frontend tests and type checks**

Run: `cd frontend && pnpm test && pnpm exec tsc --noEmit`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): isolate access token in memory and synchronize logout across tabs via broadcast channel"
```

---

### Task 9: Phase C6 - Dependency and Asset Hygiene

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/requirements-dev.txt`
- Modify: `frontend/next.config.mjs`
- Modify: `backend/Dockerfile`

- [ ] **Step 1: Check and remove `apscheduler`**

Grep for `apscheduler` in `backend/app/`. If unused, remove from `backend/requirements.txt` and `backend/requirements-dev.txt`.

- [ ] **Step 2: Update `frontend/next.config.mjs`**

Remove `images.unoptimized: true`.
Configure `remotePatterns`:
```javascript
images: {
  remotePatterns: [
    {
      protocol: process.env.NEXT_PUBLIC_IMAGE_PROTOCOL || 'http',
      hostname: process.env.NEXT_PUBLIC_IMAGE_HOST || 'localhost',
      port: process.env.NEXT_PUBLIC_IMAGE_PORT || '9000',
      pathname: '/**',
    },
  ],
},
```

- [ ] **Step 3: Verify Dockerfile multi-stage and non-root user**

Ensure `backend/Dockerfile` creates a non-root user (`USER appuser`) and uses multi-stage caching.

- [ ] **Step 4: Verify frontend build**

Run: `cd frontend && pnpm run build`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add backend/requirements*.txt frontend/next.config.mjs backend/Dockerfile
git commit -m "chore: clean unused backend dependencies, configure next image remote patterns, and verify non-root dockerfile"
```

---

### Task 10: Phase C7 - Structured Logging for Email Queue Dispatch

**Files:**
- Modify: `backend/app/integrations/email.py`
- Create: `backend/tests/test_email_logging.py`

**Interfaces:**
- Consumes: Background email task requests.
- Produces: Structured error logs with `order_id` on Redis/ARQ enqueue failure.

- [ ] **Step 1: Write test for structured error logging**

In `backend/tests/test_email_logging.py`, mock ARQ pool failure and assert `logger.error` was called with `extra={"order_id": ...}`.

- [ ] **Step 2: Implement structured logging in `backend/app/integrations/email.py`**

Catch enqueue errors and log:
```python
logger.error(
    "Failed to enqueue email job",
    extra={"order_id": order_id, "recipient": recipient, "template": template_name, "error": str(exc)},
    exc_info=True,
)
```

- [ ] **Step 3: Run test to verify pass**

Run: `pytest backend/tests/test_email_logging.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/integrations/email.py backend/tests/test_email_logging.py
git commit -m "fix(email): add structured error logging with order context on enqueue failure"
```

---

### Task 11: Final Full-Suite Verification & Push

- [ ] **Step 1: Run Backend Verification**
`cd backend && ruff check . && pytest -v`

- [ ] **Step 2: Run Alembic Roundtrip on MariaDB (2 rounds)**
`alembic upgrade head && alembic downgrade base && alembic upgrade head && alembic downgrade base && alembic upgrade head`

- [ ] **Step 3: Run Frontend Verification**
`cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm test && pnpm run build`

- [ ] **Step 4: Push to origin and monitor GitHub Actions**
`git push origin feature/vton-security-integrity-optimization`
