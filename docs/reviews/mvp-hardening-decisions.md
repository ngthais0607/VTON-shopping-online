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

