# Fashion Catalog & Variant Inventory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the multi-category store into a dedicated fashion apparel catalog with variant-level inventory locking (size/color/SKU), expand-and-contract database migrations, MariaDB concurrency safety, and a modern Next.js 16 storefront and admin panel.

**Architecture:** Two-phase database migration strategy (Expand then Contract) transitioning inventory from `Product` to `ProductVariant`. Orders lock variants ascending by ID to eliminate deadlocks. Storefront and cart isolate state by `variantId` with SWR live validation and URL-synced multi-faceted filters.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic >= 1.13.3, PyMySQL, MariaDB 11.2, Next.js 16, React 19, SWR 2.5, Tailwind CSS 4, Vitest 3.0.

## Global Constraints

- Backend test suite MUST run on real MariaDB (`mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test`).
- Row-level locks strictly ordered by ID ascending (`ORDER BY id ASC FOR UPDATE`).
- `available_stock = stock_quantity - reserved_quantity - sold_quantity`.
- Pure Python slugify without new dependencies (NFKD normalization, đ/Đ -> d, hyphenation, deduplication).
- Zero virtual try-on (VTON) implementation code (no `vton_*` tables, no ML libraries, no try-on UI).
- Every phase must pass full verification before moving to the next.

---

### Task 0.1: Clean Empty Parameter Sequence Warning & Alembic (F0.1)

**Files:**
- Modify: `backend/requirements.txt:12`
- Modify: `backend/alembic/env.py:56-78`
- Modify: `backend/pytest.ini:1-10`
- Test: `backend/tests/integration/test_migration_roundtrip.py`

**Interfaces:**
- Consumes: Alembic migration execution runner.
- Produces: Warning-free migration round-trips; `pytest.ini` enforces `filterwarnings = error:Empty parameter sequence`.

- [ ] **Step 1: Write test configuration in pytest.ini**
Update `backend/pytest.ini` to add `filterwarnings`:
```ini
[pytest]
filterwarnings =
    error:Empty parameter sequence
```

- [ ] **Step 2: Run migration roundtrip to verify warning fails under strict flag**
Run: `cmd /c "set TEST_DATABASE_URL=mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test&& set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\integration\test_migration_roundtrip.py -k test_alembic_roundtrip_two_cycles"`
Expected: FAIL with `SADeprecationWarning: Empty parameter sequence passed to execute()`

- [ ] **Step 3: Update Alembic in requirements.txt and defensively filter empty parameter tuples in env.py**
Update `backend/requirements.txt` to `alembic>=1.13.3`.
In `backend/alembic/env.py`, wrap connection execution or monkey-patch `DefaultImpl._exec` to ensure empty parameter sequences `()` or `[]` are passed as `None` to `conn.execute`.
Install updated alembic in virtualenv: `backend/.venv/Scripts/pip install "alembic>=1.13.3"`

- [ ] **Step 4: Run migration roundtrip to verify it passes without warnings**
Run: `cmd /c "set TEST_DATABASE_URL=mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test&& set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\integration\test_migration_roundtrip.py"`
Expected: PASS (1 passed, 0 warnings or zero empty sequence warnings)

- [ ] **Step 5: Commit**
```bash
git add backend/requirements.txt backend/alembic/env.py backend/pytest.ini
git commit -m "fix(alembic): resolve empty parameter sequence warnings and enforce strict warning filter"
```

---

### Task 0.2: Safe Seed Script & App Environment (F0.2)

**Files:**
- Modify: `backend/app/core/config.py:10-40`
- Modify: `backend/app/seed.py:1-120`
- Test: `backend/tests/test_seed_safety.py`

**Interfaces:**
- Consumes: `Settings.app_env`.
- Produces: `seed.py` guard preventing execution in production without `--force`, hiding raw credentials.

- [ ] **Step 1: Write failing test for seed safety**
Create `backend/tests/test_seed_safety.py`:
```python
import pytest
from app.core.config import Settings
from app.seed import run_seed

def test_seed_refuses_production_without_force(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(RuntimeError, match="Refusing to seed in production without --force"):
        run_seed(force=False)
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_seed_safety.py"`
Expected: FAIL

- [ ] **Step 3: Implement app_env setting and seed protection**
In `backend/app/core/config.py`, add `app_env: str = "development"`.
In `backend/app/seed.py`, inspect `settings.app_env`. If `"production"` and not `force`, raise `RuntimeError("Refusing to seed in production without --force")`. When in production, do not print default user passwords to stdout. Support CLI arg `--force`.

- [ ] **Step 4: Run test to verify it passes**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_seed_safety.py"`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/app/core/config.py backend/app/seed.py backend/tests/test_seed_safety.py
git commit -m "feat(seed): add APP_ENV guard and mask credentials in production"
```

---

### Task 0.3: Paddle Cleanup & Order Legacy Fields Decoupling (F0.3 & F0.4)

**Files:**
- Modify: `backend/app/features/orders/model.py:20-60`
- Modify: `backend/app/features/orders/service.py:100-250`
- Modify: `backend/app/features/orders/schemas.py:50-90`
- Test: `backend/tests/test_orders.py`

**Interfaces:**
- Consumes: `Order` model, `OrderItem` model.
- Produces: New orders write `NULL` for legacy `product_id, product_name, unit_price, quantity`; `OrderResponse` synthesizes fields from `order_items`; payment provider defaults to `vietqr`.

- [ ] **Step 1: Write test asserting new orders leave legacy product columns NULL while OrderResponse synthesizes them**
Add test in `backend/tests/test_orders.py`:
```python
def test_new_order_leaves_legacy_product_columns_null(client, auth_headers, test_db, regular_product):
    # Checkout creates order with NULL legacy product_id
    response = client.post("/api/v1/orders/checkout", json={"items": [{"product_id": regular_product.id, "quantity": 1}], "customer_name": "Test", "customer_phone": "0123456789", "shipping_address": "Test St", "payment_method": "vietqr"}, headers=auth_headers)
    assert response.status_code == 201
    order_data = response.json()
    assert order_data["product_name"] == regular_product.name
    # Direct DB check
    order_db = test_db.query(Order).filter(Order.id == order_data["id"]).first()
    assert order_db.product_id is None
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_orders.py -k test_new_order_leaves_legacy_product_columns_null"`
Expected: FAIL

- [ ] **Step 3: Update Order creation and OrderResponse synthesis**
In `backend/app/features/orders/service.py`, set `product_id=None, product_name=None, unit_price=None, quantity=None` when creating `Order`.
In `backend/app/features/orders/schemas.py`, synthesize `product_name`, `quantity`, `unit_price` from `order.items`.
In `backend/app/features/orders/model.py`, change default `Payment.provider` to `"vietqr"`.
Remove all references to `legacy_pid` and `order.product_id` in locking or transition logic.

- [ ] **Step 4: Run test to verify it passes**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_orders.py"`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/app/features/orders/model.py backend/app/features/orders/service.py backend/app/features/orders/schemas.py backend/tests/test_orders.py
git commit -m "refactor(orders): decouple legacy order product columns and set vietqr payment default"
```

---

### Task 0.4: Frontend Independent Font & Build Verification (F0.5)

**Files:**
- Modify: `frontend/app/layout.tsx:1-53`
- Test: Frontend build script

**Interfaces:**
- Consumes: System sans font fallback.
- Produces: Offline-capable Next.js build.

- [ ] **Step 1: Check existing build command**
Run: `cmd /c "cd frontend&& npx next build"`
Verify if network requests to Google Fonts fail or delay build.

- [ ] **Step 2: Replace external Google Fonts in app/layout.tsx**
Remove `import { Geist, Geist_Mono } from 'next/font/google'` from `frontend/app/layout.tsx`. Use clean system font stack defined in CSS with `font-sans antialiased`.

- [ ] **Step 3: Run full frontend validation**
Run: `cmd /c "cd frontend&& npx tsc --noEmit&& npx eslint .&& npx vitest run&& npx next build"`
Expected: All commands exit with code 0.

- [ ] **Step 4: Commit**
```bash
git add frontend/app/layout.tsx
git commit -m "fix(frontend): remove google font external network dependency for deterministic offline build"
```

---

### Task 1.1: Fashion Domain Models Definition (F1.1)

**Files:**
- Create: `backend/app/features/products/variant_model.py`
- Modify: `backend/app/features/products/model.py:1-120`
- Modify: `backend/app/features/categories/model.py:1-40`
- Modify: `backend/app/features/orders/model.py:70-110`
- Test: `backend/tests/test_variant_models.py`

**Interfaces:**
- Consumes: SQLAlchemy Declarative Base.
- Produces: `ProductVariant` ORM model, updated `Product`, `Category`, `OrderItem`, `ProductImage`, and `ProductReview`.

- [ ] **Step 1: Write model unit tests**
Create `backend/tests/test_variant_models.py` asserting model columns, constraints, and relationships for `ProductVariant`, `Product.gender`, `Category.parent_id`, `OrderItem.variant_id`.

- [ ] **Step 2: Run test to verify it fails**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_variant_models.py"`
Expected: FAIL

- [ ] **Step 3: Implement ORM models**
- Define `ProductVariant` with `sku` UNIQUE, `size`, `color_name`, `color_hex`, `price`, `stock_quantity`, `reserved_quantity`, `sold_quantity`, `is_active`, and check constraints: `stock >= 0`, `reserved >= 0`, `sold >= 0`, `reserved + sold <= stock`.
- Add `slug, brand, gender, material, fit, care_instructions, size_chart` to `Product`.
- Add `parent_id, slug` to `Category`.
- Add `sort_order, is_primary, color_name, kind` to `ProductImage`.
- Add `variant_id, sku, size, color_name` to `OrderItem`.
- Add `fit_feedback` to `ProductReview`.

- [ ] **Step 4: Run test to verify it passes**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_variant_models.py"`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/app/features/products/variant_model.py backend/app/features/products/model.py backend/app/features/categories/model.py backend/app/features/orders/model.py backend/tests/test_variant_models.py
git commit -m "feat(catalog): define ProductVariant, category hierarchy, and fashion product attributes"
```

---

### Task 1.2: Migration A (Expand) & Data Backfill (F1.2)

**Files:**
- Create: `backend/alembic/versions/<hash>_expand_product_variants_and_fashion.py`
- Create: `backend/app/core/slug.py`
- Test: `backend/tests/test_slug.py`
- Test: `backend/tests/integration/test_expand_migration.py`

**Interfaces:**
- Consumes: Existing DB at `f7c2a1b9e8d3`.
- Produces: New tables & columns created, every Product backfilled with 1 default variant, order items linked to variant.

- [ ] **Step 1: Write slugify tests**
Create `backend/tests/test_slug.py` testing diacritics removal, Vietnamese `đ/Đ` to `d`, hyphenation, collision avoidance.

- [ ] **Step 2: Implement slugify pure function**
In `backend/app/core/slug.py`, implement `slugify(text: str) -> str` using `unicodedata.normalize('NFKD', ...)`.

- [ ] **Step 3: Write Migration A (Expand)**
Create Alembic revision adding `product_variants` and new columns. In `upgrade()`, insert default variant for each product, populate unique slugs, backfill `order_items.variant_id`.

- [ ] **Step 4: Run migration and test on MariaDB**
Run: `cmd /c "set TEST_DATABASE_URL=mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test&& set PYTHONPATH=.&& cd backend&& .venv\Scripts\alembic upgrade head"`
Expected: Upgrade successful without errors.

- [ ] **Step 5: Commit**
```bash
git add backend/app/core/slug.py backend/tests/test_slug.py backend/alembic/versions/*_expand*.py
git commit -m "feat(migration): add Expand migration for product variants with default backfill"
```

---

### Task 1.3: Update Domain & Service Locking Logic (F1.3)

**Files:**
- Modify: `backend/app/features/orders/domain.py:1-60`
- Modify: `backend/app/features/orders/service.py:1-350`
- Modify: `backend/app/features/products/service.py:1-200`
- Modify: `backend/app/features/dashboard/service.py:1-150`
- Test: `backend/tests/test_order_domain.py`
- Test: `backend/tests/test_order_service_locking.py`

**Interfaces:**
- Consumes: `ProductVariant` rows.
- Produces: `CartItemRequest` accepts `variant_id`; `_lock_transition_variants` locks variants ascending; stock aggregations computed dynamically.

- [ ] **Step 1: Write failing unit tests for variant locking and stock domain**
Update `backend/tests/test_order_domain.py` to test `available_stock(variant: ProductVariant)`.
Update `backend/tests/test_order_service_locking.py` for variant ordering locks.

- [ ] **Step 2: Run tests to verify failure**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_order_domain.py tests\test_order_service_locking.py"`
Expected: FAIL

- [ ] **Step 3: Update domain and order service logic**
- In `domain.py`, accept `variant: ProductVariant` in `available_stock`.
- In `orders/service.py`, update `checkout_cart` to lock variants in ascending order (`ORDER BY id ASC FOR UPDATE`), check stock, deduct reserved stock on variant.
- In `_lock_transition_variants`, lock variants by ID ascending before locking Order. Apply reserved/sold delta to variants.
- In `products/service.py`, calculate `stock_quantity`, `reserved_quantity`, `sold_quantity` as sum of active variants.

- [ ] **Step 4: Run tests to verify they pass**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_order_domain.py tests\test_order_service_locking.py"`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/app/features/orders/domain.py backend/app/features/orders/service.py backend/app/features/products/service.py backend/app/features/dashboard/service.py backend/tests/test_order_domain.py backend/tests/test_order_service_locking.py
git commit -m "refactor(orders): switch checkout and transition locking to variant level"
```

---

### Task 1.4: Migration B (Contract) (F1.4)

**Files:**
- Create: `backend/alembic/versions/<hash>_contract_drop_product_stock_paddle.py`
- Test: `backend/tests/integration/test_migration_roundtrip.py`

**Interfaces:**
- Consumes: Fully variant-driven backend.
- Produces: Dropped legacy `products.stock_*` columns and constraints, dropped Paddle columns, enforced NOT NULL on foreign keys and slugs.

- [ ] **Step 1: Create Migration B (Contract)**
In `upgrade()`:
- Drop `products.stock_quantity`, `reserved_quantity`, `sold_quantity` and checks.
- Drop `products.paddle_product_id`, `products.paddle_price_id`.
- Alter `order_items.variant_id`, `sku`, `size`, `color_name` to `nullable=False`.
- Alter `products.slug` and `categories.slug` to `nullable=False`.
In `downgrade()`:
- Re-add stock columns, populate with sum of variants, log precision warning.

- [ ] **Step 2: Execute upgrade head on MariaDB**
Run: `cmd /c "set TEST_DATABASE_URL=mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test&& set PYTHONPATH=.&& cd backend&& .venv\Scripts\alembic upgrade head"`
Expected: PASS

- [ ] **Step 3: Run migration round-trip verification**
Run: `cmd /c "set TEST_DATABASE_URL=mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test&& set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\integration\test_migration_roundtrip.py"`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add backend/alembic/versions/*_contract*.py
git commit -m "feat(migration): add Contract migration dropping product stock and paddle columns"
```

---

### Task 1.5: Port & Verify Concurrency Tests on MariaDB (F1.5)

**Files:**
- Modify: `backend/tests/integration/test_checkout_concurrency.py`
- Modify: `backend/tests/integration/test_order_transition_concurrency.py`
- Modify: `backend/tests/integration/test_product_patch_checkout_concurrency.py`

**Interfaces:**
- Consumes: Real MariaDB on port 3307.
- Produces: High-concurrency validation verifying no overselling of last variant unit and zero deadlocks.

- [ ] **Step 1: Port integration tests from Product to ProductVariant**
Update tests to create variants, checkout with variant IDs, assert variant stock reservation and oversell prevention.

- [ ] **Step 2: Run all integration tests on MariaDB**
Run: `cmd /c "set TEST_DATABASE_URL=mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test&& set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\integration\ -v"`
Expected: PASS all integration tests.

- [ ] **Step 3: Commit**
```bash
git add backend/tests/integration/
git commit -m "test(integration): port concurrency and deadlock tests to product variants"
```

---

### Task 2.1: Hierarchical Category API (F2.1)

**Files:**
- Modify: `backend/app/features/categories/schemas.py`
- Modify: `backend/app/features/categories/service.py`
- Modify: `backend/app/features/categories/router.py`
- Test: `backend/tests/test_categories.py`

**Interfaces:**
- Consumes: Category ORM model.
- Produces: `GET /api/v1/categories/tree`, slug generation, max 2-level hierarchy validation, cycle blocking, 409 conflict when deleting active categories.

- [ ] **Step 1: Write tests for category tree and hierarchy rules**
Add tests in `backend/tests/test_categories.py`: tree endpoint, max 2-tier check, cycle prevention, 409 conflict on delete.

- [ ] **Step 2: Implement category tree service & router**
Add `GET /api/v1/categories/tree`. Implement parent-child hierarchy checks and recursive ID resolution.

- [ ] **Step 3: Run tests to verify**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_categories.py"`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add backend/app/features/categories/ backend/tests/test_categories.py
git commit -m "feat(categories): implement 2-level category tree and recursive hierarchy validation"
```

---

### Task 2.2: Fashion Product & Variant Lookup APIs (F2.2)

**Files:**
- Modify: `backend/app/features/products/schemas.py`
- Modify: `backend/app/features/products/service.py`
- Modify: `backend/app/features/products/router.py`
- Test: `backend/tests/test_products.py`
- Test: `backend/tests/test_variant_lookup.py`

**Interfaces:**
- Consumes: Fashion attributes and active variants.
- Produces: `GET /api/v1/products/variants/lookup` (placed before `/{product_id}`), `GET /api/v1/products/by-slug/{slug}`, `GET /api/v1/products/facets`, filters (`gender`, `brand`, `size`, `color`, `stock_status`, recursive `category_id`).

- [ ] **Step 1: Write tests for facets, slug lookup, and variants lookup**
Create `backend/tests/test_variant_lookup.py` testing max 50 IDs limit, missing IDs, out-of-stock data.
Add filter tests in `backend/tests/test_products.py`.

- [ ] **Step 2: Implement schemas, service, and routes**
- Place `/variants/lookup` before `/{product_id}` route.
- Implement `GET /products/by-slug/{slug}` and `GET /products/facets`.
- Enforce that setting `is_active = True` requires at least one active variant (return 409 Conflict).

- [ ] **Step 3: Run tests to verify**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_products.py tests\test_variant_lookup.py"`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add backend/app/features/products/ backend/tests/test_products.py backend/tests/test_variant_lookup.py
git commit -m "feat(products): add fashion filtering, facets, slug, and batch variant lookup"
```

---

### Task 2.3: Admin Variant Management & Inventory Adjustments (F2.3)

**Files:**
- Create: `backend/app/features/products/variant_schemas.py`
- Create: `backend/app/features/products/variant_service.py`
- Create: `backend/app/features/products/variant_router.py`
- Test: `backend/tests/test_admin_variants.py`

**Interfaces:**
- Consumes: Admin credentials.
- Produces: `POST /products/{id}/variants/bulk`, `PATCH /variants/{id}`, `POST /variants/{id}/adjust-stock`, `DELETE /variants/{id}`.

- [ ] **Step 1: Write tests for bulk variant matrix and stock adjustment**
Create `backend/tests/test_admin_variants.py`: idempotent bulk matrix generation, adjust-stock reason requirement, blocking decrement below `reserved + sold`, soft delete if orders exist.

- [ ] **Step 2: Implement variant management service and router**
Implement bulk matrix generation (`{slug}-{COLOR}-{SIZE}` SKU), stock adjustment with audit reason, and safe deletion.

- [ ] **Step 3: Run tests to verify**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_admin_variants.py"`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add backend/app/features/products/variant_* backend/tests/test_admin_variants.py
git commit -m "feat(variants): add admin bulk matrix generation and audited inventory adjustment"
```

---

### Task 2.4: Image Tags & Review Fit Feedback (F2.4 & F2.5)

**Files:**
- Modify: `backend/app/features/products/router.py`
- Modify: `backend/app/features/products/service.py`
- Modify: `backend/app/features/reviews/schemas.py`
- Modify: `backend/app/features/reviews/service.py`
- Test: `backend/tests/test_product_images.py`
- Test: `backend/tests/test_reviews.py`

**Interfaces:**
- Consumes: Image upload and review submission.
- Produces: Image `color_name` and `kind` support; review `fit_feedback` with percentage breakdown in product response.

- [ ] **Step 1: Write tests for image attributes and review fit feedback**
Update `backend/tests/test_product_images.py` and `backend/tests/test_reviews.py`.

- [ ] **Step 2: Implement image kind/color handling and fit feedback stats**
Add `color_name, kind` to upload params; update review response to summarize fit feedback (`small`, `true_to_size`, `large`).

- [ ] **Step 3: Run tests to verify**
Run: `cmd /c "set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\test_product_images.py tests\test_reviews.py"`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add backend/app/features/products/ backend/app/features/reviews/ backend/tests/test_product_images.py backend/tests/test_reviews.py
git commit -m "feat(catalog): add image color/kind tagging and review fit feedback aggregation"
```

---

### Task 3.1: Frontend Types, Inventory Helpers & Variant Selection Hook (F3.1 & F3.2)

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/inventory.ts`
- Create: `frontend/hooks/use-variant-selection.ts`
- Create: `frontend/tests/variant-selection.test.ts`
- Modify: `frontend/tests/inventory.test.ts`

**Interfaces:**
- Consumes: Variant schemas from backend.
- Produces: Type-safe variant data models, `getAvailableStock(variant)`, `useVariantSelection` hook.

- [ ] **Step 1: Write unit tests for useVariantSelection hook**
Create `frontend/tests/variant-selection.test.ts` testing color selection filtering, disabled out-of-stock sizes, price calculation.

- [ ] **Step 2: Implement types and useVariantSelection hook**
Update `frontend/lib/types.ts` with `ProductVariant` and fashion fields.
Implement `frontend/hooks/use-variant-selection.ts`.

- [ ] **Step 3: Run vitest to verify**
Run: `cmd /c "cd frontend&& npx vitest run tests/variant-selection.test.ts"`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add frontend/lib/types.ts frontend/lib/inventory.ts frontend/hooks/use-variant-selection.ts frontend/tests/variant-selection.test.ts frontend/tests/inventory.test.ts
git commit -m "feat(frontend): add variant types, stock helpers, and useVariantSelection hook"
```

---

### Task 3.2: Product Detail Page & QuickView (F3.2 & F3.3)

**Files:**
- Create: `frontend/app/store/products/[slug]/page.tsx`
- Create: `frontend/components/store/size-chart-modal.tsx`
- Modify: `frontend/components/quick-view-modal.tsx`
- Modify: `frontend/components/product-card.tsx`
- Test: `frontend/tests/product-detail.test.tsx`

**Interfaces:**
- Consumes: `GET /products/by-slug/{slug}`.
- Produces: Full fashion product detail page, color swatches, size buttons, size chart modal, dynamic gallery.

- [ ] **Step 1: Write component tests for Product Detail Page**
Create `frontend/tests/product-detail.test.tsx` asserting color swatch switching, size disable state, and size chart modal.

- [ ] **Step 2: Implement Product Detail Page and Size Chart modal**
Create `frontend/app/store/products/[slug]/page.tsx` and `frontend/components/store/size-chart-modal.tsx`.
Update `frontend/components/product-card.tsx` to display `"Từ {price_min}"` and color swatches.

- [ ] **Step 3: Run vitest to verify**
Run: `cmd /c "cd frontend&& npx vitest run tests/product-detail.test.tsx"`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add frontend/app/store/products/ frontend/components/store/ frontend/components/quick-view-modal.tsx frontend/components/product-card.tsx frontend/tests/product-detail.test.tsx
git commit -m "feat(storefront): add product detail page [slug], size chart modal, and variant swatches"
```

---

### Task 3.3: Storefront Multi-Faceted Filters Synced with URL (F3.4)

**Files:**
- Modify: `frontend/app/store/page.tsx`
- Create: `frontend/components/store/fashion-filters.tsx`
- Test: `frontend/tests/store-filters.test.tsx`

**Interfaces:**
- Consumes: `GET /products/facets` and Next.js `useSearchParams` / `useRouter`.
- Produces: URL query string synchronization for category, gender, size, color, brand, and stock status filters.

- [ ] **Step 1: Write tests for filter URL synchronization**
Create `frontend/tests/store-filters.test.tsx` testing query param syncing, back button support, debouncing.

- [ ] **Step 2: Implement FashionFilters component**
Integrate URL params reading/writing in `frontend/components/store/fashion-filters.tsx` and connect to `/store/page.tsx`.

- [ ] **Step 3: Run vitest to verify**
Run: `cmd /c "cd frontend&& npx vitest run tests/store-filters.test.tsx"`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add frontend/app/store/page.tsx frontend/components/store/fashion-filters.tsx frontend/tests/store-filters.test.tsx
git commit -m "feat(storefront): implement URL-synced multi-faceted fashion catalog filters"
```

---

### Task 3.4: Cart V2 by Variant ID & Checkout Integration (F3.5 & F3.6)

**Files:**
- Modify: `frontend/app/store/context/CartContext.tsx`
- Modify: `frontend/components/cart-drawer.tsx`
- Modify: `frontend/app/checkout/page.tsx`
- Modify: `frontend/app/orders/[id]/page.tsx`
- Modify: `frontend/app/admin/orders/page.tsx`
- Test: `frontend/tests/cart-context-v2.test.tsx`

**Interfaces:**
- Consumes: `truelook_cart_v2` in localStorage, `GET /variants/lookup`.
- Produces: Variant-keyed cart, real-time SWR pricing/stock validation, variant snapshot rendering in checkout and orders.

- [ ] **Step 1: Write cart tests for variant storage and SWR lookup validation**
Create `frontend/tests/cart-context-v2.test.tsx`: adding variant, combining quantities, ignoring deprecated cart format, alerting on price changes.

- [ ] **Step 2: Implement CartContext V2 and UI updates**
Update `CartContext.tsx` to store `{ variantId, productId, quantity }`. Fetch live metadata via `/variants/lookup`.
Update `CartDrawer`, `checkout/page.tsx`, and order view pages to render size, color, SKU snapshots.

- [ ] **Step 3: Run vitest to verify**
Run: `cmd /c "cd frontend&& npx vitest run tests/cart-context-v2.test.tsx"`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add frontend/app/store/context/CartContext.tsx frontend/components/cart-drawer.tsx frontend/app/checkout/page.tsx frontend/app/orders/ frontend/app/admin/orders/ frontend/tests/cart-context-v2.test.tsx
git commit -m "feat(cart): migrate cart to truelook_cart_v2 with SWR live validation and variant checkout"
```

---

### Task 4.1: Admin Products Fashion Form & Bulk Variant Generator (F4.1)

**Files:**
- Modify: `frontend/app/admin/products/page.tsx`
- Create: `frontend/components/admin/variant-matrix-generator.tsx`
- Create: `frontend/components/admin/variant-stock-dialog.tsx`
- Modify: `frontend/app/admin/categories/page.tsx`
- Test: `frontend/tests/admin-variants.test.tsx`

**Interfaces:**
- Consumes: Admin product endpoints and `POST /products/{id}/variants/bulk`.
- Produces: Admin fashion attributes form, preset size selector (XS-XXL, 35-45, ONE_SIZE), color palette manager, stock adjust dialog.

- [ ] **Step 1: Write tests for Admin Variant Matrix Generator**
Create `frontend/tests/admin-variants.test.tsx` verifying preset matrix generation and bulk payload formatting.

- [ ] **Step 2: Implement Admin UI components**
Build `variant-matrix-generator.tsx` and stock adjustment dialog with reason field.
Update `app/admin/categories/page.tsx` to support parent category selection and slug.

- [ ] **Step 3: Run vitest to verify**
Run: `cmd /c "cd frontend&& npx vitest run tests/admin-variants.test.tsx"`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add frontend/app/admin/products/ frontend/components/admin/ frontend/app/admin/categories/ frontend/tests/admin-variants.test.tsx
git commit -m "feat(admin): implement fashion attributes form and bulk variant matrix generator"
```

---

### Task 4.2: Revamp Seed Data for Fashion Catalog (F4.2)

**Files:**
- Modify: `backend/app/seed.py`
- Test: `backend/tests/test_seed_fashion.py`

**Interfaces:**
- Consumes: MariaDB test database.
- Produces: 100% apparel catalog (16-20 items across Women, Men, Unisex), 3-5 sizes x 2-4 colors, size charts, Unsplash photos, zero electronics/furniture.

- [ ] **Step 1: Write test verifying seed idempotence and fashion-only catalog**
Create `backend/tests/test_seed_fashion.py` asserting no electronics/gadgets remain, categories are fashion-based, variants have size/color.

- [ ] **Step 2: Rewrite seed.py dataset**
Populate 6 fashion parent categories (Áo, Quần, Váy & Đầm, Áo khoác, Giày, Phụ kiện) with subcategories. Create 18 fashion products with variants and size charts. Ensure running twice causes zero duplication.

- [ ] **Step 3: Run seed twice on test database**
Run: `cmd /c "set DATABASE_URL=mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test&& set PYTHONPATH=.&& cd backend&& .venv\Scripts\python -m app.seed&& .venv\Scripts\python -m app.seed"`
Expected: Clean execution without errors or duplicate rows.

- [ ] **Step 4: Commit**
```bash
git add backend/app/seed.py backend/tests/test_seed_fashion.py
git commit -m "feat(seed): replace legacy catalog with curated fashion catalog and variant matrices"
```

---

### Task 4.3: Brand Copy & Alt Text Sanitization (F4.3)

**Files:**
- Modify: `frontend/components/hero.tsx`
- Modify: `frontend/components/featured-products.tsx`
- Modify: `frontend/app/about/page.tsx`
- Modify: `frontend/app/returns/page.tsx`
- Modify: `frontend/app/help/page.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: Brand guidelines.
- Produces: Cohesive fashion branding, removing all "Featured laptop" and tech e-commerce copy.

- [ ] **Step 1: Audit and replace legacy text and alt attributes**
Scan and replace all references to laptops, smartphones, furniture, or gadgets with fashion apparel terminology and curated imagery.

- [ ] **Step 2: Run frontend tests & lint**
Run: `cmd /c "cd frontend&& npx eslint .&& npx vitest run"`
Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add frontend/ components/ README.md
git commit -m "chore(branding): sanitize copy and image alt text for fashion e-commerce identity"
```

---

### Task 5.1: Documentation & VTON Readiness Checklist (F5.1 & F5.2)

**Files:**
- Modify: `MIGRATION_NOTES.md`
- Create: `docs/VTON_READINESS.md`

**Interfaces:**
- Consumes: Verified architecture and codebase state.
- Produces: Migration instructions, breaking change logs, and 7-point VTON readiness assessment without any implementation code.

- [ ] **Step 1: Update MIGRATION_NOTES.md**
Document breaking changes: `truelook_cart_v2`, checkout `variant_id` requirement, product response computed fields, adjust-stock endpoint.

- [ ] **Step 2: Create docs/VTON_READINESS.md**
Write evaluation for items (a) through (g): CI green, variant model stabilized, flat-lay photos, category mappings, ARQ async queue, and flag items needing business decisions.

- [ ] **Step 3: Commit**
```bash
git add MIGRATION_NOTES.md docs/VTON_READINESS.md
git commit -m "docs: update migration notes and publish VTON readiness evaluation"
```

---

### Task 5.2: Final Verification Checklist Execution (Verification)

**Files:**
- Verification only

**Interfaces:**
- Consumes: Entire codebase on branch `feature/fashion-catalog`.
- Produces: Concrete test logs and execution proof.

- [ ] **Step 1: Backend checks on MariaDB**
Run: `cmd /c "cd backend&& .venv\Scripts\ruff check .&& set TEST_DATABASE_URL=mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test&& set PYTHONPATH=.&& .venv\Scripts\pytest -q"`
Expected: Zero ruff errors, >= 270 passed tests.

- [ ] **Step 2: Alembic round-trip verification**
Run: `cmd /c "set TEST_DATABASE_URL=mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test&& set PYTHONPATH=.&& cd backend&& .venv\Scripts\pytest tests\integration\test_migration_roundtrip.py"`
Expected: PASS 2 cycles without warnings.

- [ ] **Step 3: Frontend validation**
Run: `cmd /c "cd frontend&& npx tsc --noEmit&& npx eslint .&& npx vitest run&& npx next build"`
Expected: All pass.

- [ ] **Step 4: End-to-end API walkthrough test**
Verify product creation -> bulk variants -> facets -> checkout -> webhook -> variant stock deduction -> cancel restock.
