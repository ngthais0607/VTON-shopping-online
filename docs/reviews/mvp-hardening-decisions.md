# MVP Hardening Decisions Log

**Project:** TrueLook (`VTON-shopping-online`)  
**Branch:** `fix/mvp-hardening`  
**Base Commit:** `fae43e441a24d799da9487c1b999156d76dc9fad`  
**Date:** 2026-10-14  

---

## Technical & Business Decisions

### 1. Baseline & Test Suite Initialization (Task 0)
- **Pytest Module Namespace Collision:** `tests/test_vietqr_webhook_concurrency.py` and `tests/integration/test_vietqr_webhook_concurrency.py` shared identical basenames without package init files. Added `backend/tests/__init__.py` and `backend/tests/integration/__init__.py` to provide package qualification for pytest module collection.
- **Baseline Evidence Captured:**
  - Branch: `fix/mvp-hardening` checked out from `fae43e4`.
  - Alembic Head: `c3d4e5f6a7b8`.
  - Backend Unit Tests (SQLite): 335 passed, 0 failed, 1 warning (Starlette testclient httpx deprecation).
  - Frontend Vitest: 22 test files passed, 88 tests passed.
  - Frontend ESLint: 0 warnings, 0 errors.
  - Frontend TypeScript: 0 errors (`tsc --noEmit`).
  - Frontend Production Build: 26 routes compiled successfully.
  - Ruff Formatting Debt: 19 files unformatted (to be resolved cleanly in Task 31).

### 2. Phase 1: Core Transactional & Inventory Hardening (Tasks 1 - 4)
- **Item 1.1 (Stock Isolation):**
  - Confirmed product `PATCH` preserves variant stock quantities across multi-variant matrices.
  - Added regression test `backend/tests/test_product_stock_isolation.py` ensuring multi-variant matrix stock is untouched by base product field edits.
  - Commit: `dc94f1f` (`fix(products): complete product inventory isolation regressions and cleanup`).
- **Item 1.2 (COD State Machine & Invariants):**
  - Prevented inventory leakage on COD `PENDING -> CONFIRMED` by preserving `reserved_quantity` until payment completion or order cancellation.
  - Added counter sanity checks in `backend/app/features/orders/domain.py`: raises `ConflictError(..., code="inventory_state_inconsistent")` if decrementing below 0.
  - Implemented `is_order_paid(order: Order) -> bool` to reliably detect paid orders regardless of order model variations.
  - Commit: `79f9318` (`fix(orders): preserve COD reservations until explicit receipt`).
- **Item 1.3 (VietQR Memo Parsing):**
  - Standardized payment memo generator to `generate_order_payment_memo(order_id) -> f"TL{order_id}"`.
  - Upgraded regex token extractor to `(?i)(?<![A-Za-z0-9])(?:TL|TRUELOOK|LUXESTORE)[\s_-]*([1-9]\d*(?:(?:[xX]|_)[1-9]\d*)*)(?![A-Za-z0-9])`.
  - Added boundary guards rejecting malformed tails (`TL12ABC`), ambiguous multi-order memos (`TL12 TL13`), and invalid IDs (`TL0`).
  - Added regression suite `backend/tests/test_vietqr_memo_resilience.py` (23 passed).
  - Commit: `f43691c` (`fix(payments): parse complete bank memo tokens without truncating order IDs`).
- **Phase 1 Test Suite Gate (Task 4):**
  - Resolved session pollution in `test_seed_safety.py` by providing rollbackable `db_session`.
  - Added proper inventory accounting to historical order seeding in `backend/app/seed.py`.
  - Added catalog/facets cache invalidation in `conftest.py` between test runs.
  - Verified imports (`app.main`, `WorkerSettings`), `ruff check app tests` (0 errors), and full backend test suite: 363 passed, 0 failed.
  - Commit: `fabf9d2` (`fix(seed): isolate seed safety test session and book inventory quantities`).

### 3. Phase 2: Frontend Consistency, Internationalization & Trust (Tasks 5 - 10)
- **Item 2.1 (Currency Display Consistency):**
  - Standardized monetary formatting through `formatCurrency(amount, currency = "VND")` in `frontend/lib/utils.ts`.
  - VND formats with Vietnamese locale (`vi-VN`, e.g. `150.000 ₫`), foreign currencies use `en-US` (`$100.00`).
  - Audited and updated all storefront and dashboard components (`CartDrawer`, `checkout`, `FeaturedProducts`, `QuickViewModal`, `VietQRModal`, `orders/[id]`, `orders/page`, `revenue-chart`, `dashboard/page`).
  - Added regression test `frontend/tests/currency-formatting.test.ts` (3 passed).
  - Commit: `16fc6a1` (`fix(ui): format monetary values with their actual currency`).
- **Item 2.2 (UTC Serialization & Timezone Consistency):**
  - Created `UtcDatetime` annotated serializer in `backend/app/core/schemas.py` that guarantees JSON responses format ISO-8601 timestamps ending with `Z`.
  - Applied `UtcDatetime` to datetime fields in order, product, user, category, dashboard, and inventory adjustment schemas.
  - Updated `displayDate` in `frontend/lib/utils.ts` to normalize naive ISO timestamps by treating them as UTC before local formatting.
  - Added regression tests `backend/tests/test_utc_datetime_serialization.py` (2 passed) and `frontend/tests/date-formatting.test.ts` (3 passed).
  - Commit: `28d545a` (`fix(datetime): serialize UTC response timestamps and preserve local display`).
- **Item 2.3 (Truthful Reviews & Ratings):**
  - Replaced frontend synthetic formulas (`(p.id % 5) * 0.1 + 4.5` and `p.id * 17 + 23`) in `FeaturedProducts.tsx` and PDP fallback (`5.0`).
  - Exposed real metrics `rating_avg: float | None` and `review_count: int` on `ProductPublicResponse` and `ProductDetailPublicResponse` backed by model properties on `Product`.
  - Configured `selectinload(Product.reviews)` on `_active_products_query` to avoid N+1 queries.
  - Truthfully renders `(Chưa có đánh giá)` and grey stars for unreviewed products.
  - Added backend regression test in `backend/tests/test_reviews.py` (11 passed).
  - Commit: `da2380c` (`fix(catalog): expose real review metrics and remove synthetic storefront claims`).
- **Item 2.4 (Free Shipping Display Transparency):**
  - Audited marketing claims across storefront components and removed contradictory `$50` threshold statements (`HeroSection.tsx`, `FeaturesSection.tsx`, `auth-container.tsx`).
  - Aligned all statements to reflect TrueLook's actual unconditional free shipping policy (0 ₫ / "Miễn phí vận chuyển toàn quốc cho mọi đơn hàng").
  - Commit: `4b56420` (`fix(checkout): disclose free shipping consistently`).
- **Item 2.5 (Centralized Placeholder Images):**
  - Created high-resolution branded SVG placeholder `frontend/public/placeholder.svg`.
  - Created `frontend/lib/placeholder-images.ts` providing `DEFAULT_PRODUCT_PLACEHOLDER` and `getProductImageUrl(product)`.
  - Replaced ad-hoc external Unsplash fallbacks in `FeaturedProducts.tsx`, PDP `[slug]/page.tsx`, and `QuickViewModal.tsx`.
  - Added unit test `frontend/tests/placeholder-images.test.ts` (4 passed).
  - Commit: `5c6d658` (`refactor(ui): centralize placeholder assets and bounded image fallbacks`).
- **Phase 2 Test Suite Gate (Task 10):**
  - Full frontend Vitest suite: 25 test files passed, 98 tests passed.
  - Full frontend ESLint: 0 warnings, 0 errors.
  - Full frontend TypeScript typecheck: 0 errors (`tsc --noEmit`).
  - Full frontend Next.js production build: 26 routes compiled successfully.
  - Full backend pytest suite verified.

---

### 4. Phase 3: Security, Identity & Data Integrity (Tasks 11 - 18)
- **Item 3.1 (Review Deduplication, Unique Constraint, Purchase Eligibility & Pagination):**
  - Added Alembic migration `e4f5a6b7c8d9_dedupe_and_add_unique_review_constraint.py` with deterministic deduplication preserving newest verified purchase or highest ID, creating unique constraint `uq_product_reviews_user_product` on `(user_id, product_id)`.
  - Enforced verified paid purchase requirement for review creation; duplicate submissions update the existing review (upsert).
  - Migrated review listing to canonical `{items, total, limit, offset}` pagination.
  - Commit: `f3c5e9d` (`feat(reviews): enforce paid-purchase upserts and migrate paginated consumers`).
- **Item 3.2 (Public Order Tracking Masking & PII Protection):**
  - Isolated public order tracking DTO `PublicTrackingResponse` returning masked customer name (`Ng*** V** B`), masked phone (`*******678`), district/city only shipping destination (`Quan 1, Ho Chi Minh`), public tracking code, and sanitised timeline descriptions.
  - Migrated storefront tracking links to use `public_code` instead of internal integer ID.
  - Commit: `221b25a` (`fix(tracking): isolate public DTO and migrate storefront public-code links`).
- **Item 3.3 (Checkout Input Normalization & Server Validation):**
  - Implemented field validators on `CheckoutCommand` for `customer_name` (trimmed, 2-100 characters), `customer_phone` (strips whitespace/dots/hyphens, validates Vietnamese regex `^(0|\+84)(3|5|7|8|9)\d{8}$`, normalizes `+84` prefix to `0`), and `shipping_address` (trimmed, 10-1000 characters).
  - Aligned frontend Zod schema `checkoutSchema` in `frontend/lib/validations/checkout.ts` to transform and normalize input identically and pass normalized values to checkout payload.
  - Commit: `819bdb4` (`fix(checkout): normalize Vietnamese contact input consistently`).
- **Item 3.4 (Admin Management CLI & Bootstrap Removal):**
  - Removed `bootstrap_admin_email` config setting and promotion logic from `_create_user`. Registration exclusively assigns `customer` role.
  - Added management CLI `python -m app.cli create-admin --email <email> --username <username>` prompting securely for password and confirmation via `getpass`.
  - Added `backend/tests/test_admin_cli.py` covering creation, duplicate rejection, and password policy errors. Updated `README.md`.
  - Commit: `c17e076` (`feat(users): replace public admin bootstrap with secure management CLI`).
- **Item 3.5 (Actor-Aware Soft Deletion & Last Admin Safeguard):**
  - Updated `delete_user(db, user_id, actor)` in `service.py`: blocks self-deletion (409 `admin_cannot_delete_self`), locks all active admin rows ascending with `FOR UPDATE` to prevent concurrent mutual deletion and enforce last-admin guard (409 `cannot_delete_last_admin`).
  - Releases unique constraints on soft deletion by tombstoning email (`deleted+{id}+{ts}@invalid`) and username (`deleted_{id}_{ts}`), enabling immediate re-registration.
  - Added integration concurrency test `backend/tests/integration/test_admin_deletion_concurrency.py`.
  - Commit: `91435b7` (`fix(users): protect admin deletion and release soft-deleted identifiers`).
- **Item 3.6 (Canonical Optional-Auth Dependency):**
  - Consolidated `get_optional_user` into canonical `get_current_user_optional(credentials, db) -> User | None`.
  - Removed production test hack reading `request.app.dependency_overrides`.
  - Updated all route consumers and test override fixtures.
  - Commit: `023d6ce` (`refactor(auth): consolidate optional user dependency and remove mock bypass`).
- **Item 3.7 (Variant-Aware Catalog Price Filtering & Sorting):**
  - Replaced base-price-only filtering and sorting in `list_products` with correlated subquery `MIN(COALESCE(variant.price, product.price))` across all active variants, falling back to `Product.price` for products without active variants.
  - Implemented stable tie-break ordering (`Product.id.asc()` for `price_asc`, `Product.id.desc()` for `price_desc`).
  - Added regression suite `backend/tests/test_product_variant_price_query.py`.
  - Commit: `81ad23b` (`fix(products): filter and sort catalog by effective variant price`).
- **Phase 3 Test Suite Gate (Task 18):**
  - Full backend unit test suite: 426 passed, 0 failed, 1 warning (Starlette testclient httpx deprecation).
  - Full backend imports and `ruff check app tests`: 0 errors.
  - Full frontend Vitest suite: 26 test files passed, 100 tests passed.
  - Full frontend ESLint: 0 warnings, 0 errors.
  - Full frontend TypeScript typecheck: 0 errors (`tsc --noEmit`).
  - Full frontend Next.js production build: 26 routes compiled successfully.

---

### 5. Phase 4: Operations, Order Lifecycle & Proxy Security (Tasks 19 - 23b)
- **Item 4.1 (MinIO TLS & Configurable Storage Encryption):**
  - Added `storage_use_ssl: bool = False` to `Settings` in `backend/app/core/config.py`.
  - Updated `Minio` client initialization in `backend/app/features/storage/service.py` to pass `secure=settings.storage_use_ssl`.
  - Updated health check and storage service diagnostics to honor TLS configuration.
  - Added regression test `backend/tests/test_storage_tls.py`.
  - Commit: `24a877e` (`feat(storage): support configurable TLS for object storage`).
- **Item 4.2 (Cookie Security & CORS Realignment):**
  - Added `auth_cookie_secure: bool` and `auth_cookie_samesite: str` settings with sensible defaults (`secure=False` for dev, `True` for prod, `samesite="lax"`).
  - Aligned refresh cookie response headers across login, register, and refresh endpoints to enforce `httponly=True`, `secure=settings.auth_cookie_secure`, `samesite=settings.auth_cookie_samesite`.
  - Realigned CORS origins defaults (`cors_origins`) to include local development addresses and environment variables, forbidding wildcards when credentials are allowed.
  - Added regression tests in `backend/tests/test_cookie_security.py`.
  - Commit: `351d387` (`fix(auth): align refresh cookie attributes and CORS defaults`).
- **Item 4.3 (Rate Limiting Behind Trusted Reverse Proxy):**
  - Removed custom/insecure manual `X-Forwarded-For` string splitting in rate limiting middleware.
  - Standardized on ASGI `request.client.host` populated by trusted ASGI/Uvicorn proxy middleware (`--proxy-headers`, `--forwarded-allow-ips`).
  - Added `forwarded_allow_ips` configuration to `Settings` and Uvicorn deployment commands.
  - Added regression tests in `backend/tests/test_trusted_proxy_rate_limit.py`.
  - Commit: `485dd44` (`fix(security): delegate trusted proxy client resolution to ASGI server`).
- **Item 4.4 (N+1 Elimination & Order Pagination):**
  - Converted `list_user_orders` to return `Page[OrderResponse]` with explicit pagination query parameters (`limit`, `offset`), matching canonical API pagination.
  - Eliminated N+1 relational queries on orders, items, and payments by applying `selectinload(Order.items)` and `selectinload(Order.payments)`.
  - Updated frontend `useUserOrders` hook and customer orders page with pagination controls.
  - Added query counting regression tests in `backend/tests/test_orders_nplusone.py`.
  - Commit: `62faf0b` (`perf(orders): paginate customer order history and eliminate relational N+1 queries`).
- **Item 4.5 & 4.5b (Delivery Lifecycle, Cancellation & Payment Status):**
  - Implemented post-dispatch order states (`SHIPPED`, `DELIVERED`) and state transitions in `apply_order_transition` in `backend/app/features/orders/domain.py`.
  - Added customer cancellation endpoint (`POST /orders/{id}/cancel`), permitting owner cancellation only before dispatch (`PENDING`, `CONFIRMED`).
  - Maintained inventory accounting invariants: cancelling unpaid orders unreserves stock; cancelling paid orders unmarks sold stock; transitions to `SHIPPED` / `DELIVERED` leave physical inventory unchanged.
  - Centralized deterministic payment status evaluation for terminated orders in order and dashboard services.
  - Added regression tests in `backend/tests/test_order_delivery_lifecycle.py`.
  - Commit: `f943564` (`feat(orders): support customer cancellation and post-dispatch delivery lifecycle`).
- **Phase 4 Test Suite Gate:**
  - Full backend unit test suite: 445 passed, 22 skipped (MariaDB live tests without MariaDB env), 0 failed.
  - Full backend imports and `ruff check app tests`: 0 errors.
  - Full frontend Vitest suite: 26 test files passed, 100 tests passed.
  - Full frontend ESLint: 0 warnings, 0 errors.
  - Full frontend TypeScript typecheck: 0 errors (`tsc --noEmit`).
  - Full frontend Next.js production build: 26 routes compiled cleanly.

---


