# TrueLook Security, Integrity & Operational Optimization Design Specification

- **Date:** 2026-10-13
- **Branch:** `feature/vton-security-integrity-optimization`
- **Scope:** Full hardening across Phase A, Phase B, and Phase C (C1–C7)

---

## 1. Overview & Context

This design specification addresses database migration integrity, media streaming resource limits, documentation alignment, administrative reconciliation, configuration hygiene, schema tightening, and frontend authentication memory isolation for the TrueLook AI-VTON platform.

### Hard Constraints
- **Preserve Existing Tests:** 253 backend tests and 52 frontend tests must remain passing unless an explicit change is necessitated and explained.
- **Strict MariaDB Compatibility:** Migrations and locking primitives must be strictly valid on real MariaDB 11.2 InnoDB.
- **Clean Git History:** Changes must be separated by phase/item into individual commits with clean Conventional Commits messages.
- **Fail-First Verification:** For each bugfix or feature, write reproducing tests first, confirm failure, apply the fix, and confirm success.

---

## 2. Phase A: Core Bug Fixes

### A1. MariaDB Alembic Downgrade Foreign Key Error (Root Cause & Fix)

#### Problem Analysis
In `backend/alembic/versions/d4a7c8e91f23_order_items_and_reviews_integrity.py`, `downgrade()` calls `batch_op.drop_index(ix_order_items_product_id)` and related index drops on `order_items` and `product_reviews`. In MariaDB InnoDB, an index backing a Foreign Key constraint cannot be dropped while the constraint exists (`Error 1553: Cannot drop index ... needed in a foreign key constraint`).

#### Implementation Design
1. **Refactor `d4a7c8e91f23` `downgrade()`:**
   - Remove individual `batch_op.drop_index()` calls on `order_items` and `product_reviews`.
   - Directly invoke `op.drop_table("order_items")` and `op.drop_table("product_reviews")`. InnoDB automatically drops all associated indexes and FK constraints when a table is dropped.
2. **Audit All 5 Migrations:**
   - `6ea70e2e94f1`: Drop tables in reverse FK dependency order (`payments` -> `product_images` -> `orders` -> `products` -> `categories` -> `users`) without redundant index drops prior to table drops.
   - `c91f8a4e2b10`: Drops fulfillment columns on `orders` (verified safe).
   - `8f4c2d1a7b90`: Drops `refresh_version` on `users` (verified safe).
   - `e5b8c9d0f1a2`: Gracefully drops `FULLTEXT` and composite indexes with existence guards.
3. **Idempotence & Round-Trip Integration Test:**
   - Create `backend/tests/integration/test_migration_roundtrip.py` using Alembic programmatic API.
   - Execute: `upgrade("head")` -> `downgrade("base")` -> `upgrade("head")` -> `downgrade("base")` -> `upgrade("head")`.
   - Assert all expected tables and column structures match.
4. **CI Pipeline Step:**
   - Add `python -m alembic downgrade base && python -m alembic upgrade head` to `.github/workflows/ci.yml` after the initial migration upgrade.
5. **Documentation:**
   - Explicitly note in `MIGRATION_NOTES.md` that rolling back `d4a7c8e91f23` drops `order_items` and `product_reviews`, permanently deleting order item details and review records.

---

### A2. Safe Image Upload (Bounded Memory & Magic-Byte Validation)

#### Problem Analysis
`backend/app/features/products/images.py` reads the entire upload payload into RAM via `stream.read()` before evaluating size limits. It also trusts the client-provided `Content-Type` and filename extension without inspecting the file signature.

#### Implementation Design
1. **Pure Helper Function `sniff_image_type(data: bytes) -> str | None`:**
   - JPEG: Starts with `b"\xff\xd8\xff"`.
   - PNG: Starts with `b"\x89PNG\r\n\x1a\n"` (`89 50 4E 47 0D 0A 1A 0A`).
   - WebP: Bytes 0..3 are `b"RIFF"` and bytes 8..11 are `b"WEBP"`.
   - Returns `"jpeg"`, `"png"`, `"webp"`, or `None`.
2. **Bounded Stream Reading:**
   - Reject early if `Content-Length` header exceeds `MAX_IMAGE_SIZE_BYTES` (5MB).
   - Read with bound: `payload = stream.read(MAX_IMAGE_SIZE_BYTES + 1)`.
   - If `len(payload) == 0`: Raise `BusinessRuleError("Product image file cannot be empty", code="invalid_product_image")`.
   - If `len(payload) > MAX_IMAGE_SIZE_BYTES`: Raise `BusinessRuleError("Product image must not exceed 5MB", code="image_too_large")` without buffering more.
3. **Format Alignment & Sanitization:**
   - Sniff image type from `payload[:16]`. Reject with `invalid_product_image` if unrecognized.
   - Assert consistency between sniffed format, client Content-Type, and file extension.
   - Construct object name using the detected extension: `products/{image_id}.{sniffed_type}` (ignoring arbitrary client filenames).
4. **Test Updates (`backend/tests/test_product_images.py`):**
   - Update dummy fixtures from raw strings `b"png-image"` to valid PNG/JPEG/WebP header payloads.
   - Add stream consumption counter test ensuring no more than `5MB + 1` bytes are read.
   - Test empty file rejection, payload/extension mismatch rejection, and fake image rejection.

---

## 3. Phase B: Documentation Alignment

1. **`MIGRATION_NOTES.md` & `README.md` Corrections:**
   - **VietQR Webhook Verification:** Clarify that authentication uses timing-safe static secret comparison (`hmac.compare_digest`) via `X-Webhook-Secret`. Document that request body is not cryptographically signed and lacks replay protection, matching the real-world merchant webhook protocol.
   - **TypeScript Version:** Correct claim from `TypeScript 5.8` to `TypeScript 5.7.3` matching `package.json`.
   - **Image Sniffing:** Accurately document bounded stream reading and magic-byte validation (JPEG, PNG, WebP).
   - **Known Limitations Section:** Document:
     - Asynchronous email queue best-effort delivery without persistent failure log table.
     - Static secret VietQR webhook mechanism without replay counter.
     - Irreversible data loss on migration rollback past `d4a7c8e91f23`.

---

## 4. Phase C: Systematic Hardening & Improvements

### C1. VietQR Webhook Handling for Expired / Cancelled Orders
- **Business Logic:**
  - When payment notification arrives for an order in `expired` or `cancelled` state:
    - Order status is NOT changed to `paid`.
    - Inventory is NOT altered.
    - Create a `Payment` record with `status="late_payment"`, recording `provider_transaction_id` (unique constraint preserves idempotency).
    - Log a structured warning with `order_id`, `provider_transaction_id`, `amount`, and `order_status`.
    - Webhook response returns `{"status": "late_payment", "order_id": order.id, "payment_id": payment.id}`.
    - For `paid` orders, continue returning `already_processed`.
- **Administrative Endpoint (`GET /api/v1/orders/late-payments`):**
  - Restricted to `admin` role.
  - Paginated query returning late payment records along with order public code and customer contact information for manual reconciliation.
- **Tests:** Verify late payment record creation without inventory modification, duplicate webhook idempotency, and admin listing.

### C2. MinIO Configuration Hardening
- **Settings:**
  - Remove default `"admin"` and `"password123"` in `backend/app/core/config.py`.
  - Set `minio_access_key: str = Field(min_length=1)` and `minio_secret_key: str = Field(min_length=1)`.
- **Environment Alignment:**
  - Update `.env.example`, `docker-compose.yml`, `backend/tests/conftest.py`, and `.github/workflows/ci.yml`.
- **Tests:** Add Settings instantiation test verifying `ValidationError` when credentials are empty or omitted.

### C3. Database-Enforced Non-Null `orders.public_code`
- **Migration:**
  - Create revision following `e5b8c9d0f1a2`.
  - In `upgrade()`, defensively backfill any null `public_code` with generated UUIDs, then alter `orders.public_code` to `nullable=False`.
  - In `downgrade()`, alter `orders.public_code` back to `nullable=True`.
- **Service Refactor (`backend/app/features/orders/service.py`):**
  - Remove fallback `uuid4().hex` in `order_to_response`. Directly read `order.public_code`.
  - Raise `BusinessRuleError` if `order.public_code` is missing.
- **Tests:** Verify all created orders contain unique `public_code` and public tracking endpoint works reliably.

### C4. Ruff Linting Across Backend Including `alembic`
- Annotate required autogenerate imports in `backend/alembic/env.py` with `# noqa: F401  # Required for Alembic autogenerate metadata registration`.
- Format and organize imports across `alembic/`.
- Update CI workflow to run `ruff check .` across the entire backend workspace with 0 errors.

### C5. Frontend In-Memory Access Token & Multi-Tab Synchronization
- **Session Architecture (`frontend/lib/session.ts`):**
  - Eliminate `localStorage.getItem('token')` / `setItem('token')`.
  - Store access token strictly in a module-level variable: `let inMemoryAccessToken: string | null = null`.
  - Synchronize cross-tab state via `BroadcastChannel("truelook_auth_sync")`:
    - Broadcast `{ type: "LOGOUT" }` on user logout or session termination.
    - Sibling tabs clear in-memory state and react accordingly.
- **Page Mount & Silent Refresh:**
  - On application initial load, call `POST /api/v1/users/refresh` with `withCredentials: true`.
  - On 200 OK: populate `inMemoryAccessToken`.
  - On 401 Unauthorized: gracefully set state to unauthenticated without error interruptions.
  - Maintain request serialization and queuing in `frontend/lib/api.ts` during token refresh.
- **Tests:** Update frontend mock suites (`session.test.tsx`, `api-client.test.ts`) with `BroadcastChannel` mocks and in-memory assertions.

### C6. Dependency & Asset Hygiene
- Grep and verify unused status of `apscheduler` in backend. If unused, remove from `requirements.txt` and `requirements-dev.txt`.
- In `frontend/next.config.mjs`:
  - Remove `images.unoptimized: true`.
  - Configure `images.remotePatterns` for the MinIO host based on environment configuration (`NEXT_PUBLIC_IMAGE_HOST`).
- Verify multi-stage build and non-root execution in `backend/Dockerfile`.

### C7. Email Queue Observability
- Update `_enqueue_best_effort` in `backend/app/integrations/email.py` to record structured error logs (`logger.error(...)` with `extra={"order_id": order_id, ...}`) upon Redis connection or enqueue failure.
- Document email queue retry considerations in `MIGRATION_NOTES.md` Known Limitations.

---

## 5. Verification & Acceptance Criteria

1. **Backend Quality:** `ruff check .` reports 0 errors; `pytest -q` passes 100% on active database.
2. **Migration Stability:** Two consecutive cycles of `alembic upgrade head -> downgrade base -> upgrade head` succeed without error.
3. **Frontend Quality:** `pnpm exec tsc --noEmit`, `pnpm exec eslint .`, `pnpm test`, and `pnpm run build` pass cleanly with 0 errors.
4. **CI Pipeline:** All GitHub Actions checks pass on push.
