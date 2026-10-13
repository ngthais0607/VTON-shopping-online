# Design Document: Fashion Catalog & Variant Inventory System

- **Date**: 2026-10-13
- **Author**: Antigravity Senior Fullstack Engineer
- **Status**: Approved
- **Target Branch**: `feature/fashion-catalog` (branched from `feature/vton-security-integrity-optimization`)

---

## 1. Executive Summary

This project transforms the existing multi-category store into a dedicated **Fashion Apparel E-Commerce Store** with multi-variant management (size, color, SKU), hierarchical categories, and variant-level inventory locking. All historical AI-VTON / TrueLook remnants are cleaned up, Paddle references removed in favor of VietQR/COD, and strict database integrity is enforced on MariaDB 11.2 using SQLAlchemy 2.0 and Alembic.

Virtual Try-On (VTON) features remain **strictly out of scope** for implementation code; readiness criteria are formally evaluated and documented in `docs/VTON_READINESS.md`.

---

## 2. Technical Stack & Verification Baseline

- **Backend**: Python 3.13, FastAPI, SQLAlchemy 2.0 (ORM 2.0 syntax, strict type protocol), Alembic, PyMySQL, ARQ (Redis background worker).
- **Frontend**: Next.js 16 (App Router), React 19, SWR 2.5, Tailwind CSS 4, Radix UI primitives, Vitest 3.0.
- **Database**: MariaDB 11.2 (InnoDB, row-level locking via `with_for_update`, transactional DDL constraints).
- **Test Baseline**: 270+ backend pytest passing on real MariaDB, 55 frontend vitest passing, zero `Empty parameter sequence` deprecation warnings, TypeScript and ESLint clean.

---

## 3. Architecture & Data Model

### 3.1 Data Models

#### 3.1.1 `ProductVariant` (`product_variants`)
- `id`: Integer primary key, autoincrement.
- `product_id`: Integer foreign key -> `products.id`, indexed.
- `sku`: String(64) UNIQUE, not null. Format: `{slug}-{COLOR}-{SIZE}`.
- `size`: String(20), not null. Default for non-sized goods: `"ONE_SIZE"`.
- `color_name`: String(50), not null. Default for uncolored goods: `"Default"`.
- `color_hex`: String(7), nullable. Validated with regex `^#[0-9A-Fa-f]{6}$`.
- `price`: Numeric(12, 2), nullable. `NULL` indicates fallback to `Product.price`.
- `stock_quantity`: Integer, not null, default 0.
- `reserved_quantity`: Integer, not null, default 0.
- `sold_quantity`: Integer, not null, default 0.
- `is_active`: Boolean, default True.
- `created_at`, `updated_at`: DateTime UTC with timezone.
- **Constraints**:
  - `UniqueConstraint('product_id', 'size', 'color_name', name='uq_variants_product_size_color')`
  - `CheckConstraint('stock_quantity >= 0', name='ck_variants_stock_non_negative')`
  - `CheckConstraint('reserved_quantity >= 0', name='ck_variants_reserved_non_negative')`
  - `CheckConstraint('sold_quantity >= 0', name='ck_variants_sold_non_negative')`
  - `CheckConstraint('reserved_quantity + sold_quantity <= stock_quantity', name='ck_variants_reserved_sold_lte_stock')`
- **Indexes**:
  - `ix_product_variants_product_active` (`product_id`, `is_active`)
  - `ix_product_variants_sku` (`sku`)

#### 3.1.2 `Product` Extensions (`products`)
- `slug`: String(255) UNIQUE.
- `brand`: String(100), nullable.
- `gender`: String(20), not null, default `"unisex"` (enum: `women`, `men`, `unisex`, `kids`).
- `material`: String(255), nullable.
- `fit`: String(50), nullable (e.g., `slim`, `regular`, `oversized`).
- `care_instructions`: String(500), nullable.
- `size_chart`: JSON, nullable. Format: `{"unit": "cm", "columns": ["Ngực", "Eo", "Hông"], "rows": {"S": [88, 70, 92], "M": [92, 74, 96]}}`.
- **Computed Attributes (in responses, dynamic aggregations)**:
  - `stock_quantity`: Sum of `stock_quantity` across active variants.
  - `reserved_quantity`: Sum of `reserved_quantity` across active variants.
  - `sold_quantity`: Sum of `sold_quantity` across active variants.
  - `price_min`, `price_max`: Computed across active variants taking variant price or product base price.
  - `available_sizes`: Distinct active sizes.
  - `available_colors`: Distinct active colors `{name, hex}`.

#### 3.1.3 `Category` Extensions (`categories`)
- `parent_id`: Integer foreign key -> `categories.id`, nullable. Max depth = 2 (root -> child). Self-referencing loops and cycles blocked at service level.
- `slug`: String(255) UNIQUE.
- Deleting category with subcategories or active products returns `409 Conflict`.

#### 3.1.4 `ProductImage` Extensions (`product_images`)
- `sort_order`: Integer, default 0.
- `is_primary`: Boolean, default False. Exactly 1 primary image per product enforced.
- `color_name`: String(50), nullable (NULL = product-wide, non-null = variant color association).
- `kind`: String(30), default `"model_photo"` (values: `model_photo`, `flat_lay`, `detail`).

#### 3.1.5 `OrderItem` Extensions (`order_items`)
- `variant_id`: Integer foreign key -> `product_variants.id`, indexed.
- `sku`: String(64), not null snapshot.
- `size`: String(20), not null snapshot.
- `color_name`: String(50), not null snapshot.

#### 3.1.6 `ProductReview` Extensions (`product_reviews`)
- `fit_feedback`: String(20), nullable (values: `small`, `true_to_size`, `large`).

---

## 4. Migration Strategy: Expand & Contract

To ensure zero downtime, deterministic data preservation, and safe rollback:

### 4.1 Phase F1.2: Migration A (Expand)
1. Create `product_variants` table with all constraints and indexes.
2. Add nullable/default columns to `products`, `categories`, `order_items`, `product_images`, and `product_reviews`.
3. **Data Backfill**:
   - For every existing `Product`, insert a default `ProductVariant`:
     - `sku`: `P{id}-DEFAULT`
     - `size`: `"ONE_SIZE"`
     - `color_name`: `"Default"`
     - `stock_quantity`, `reserved_quantity`, `sold_quantity`: Copied directly from `Product`.
   - Generate unique slugs for all `Product` and `Category` rows using an in-migration pure Python slugify algorithm (NFKD normalizer, converting đ/Đ to d, removing diacritics, hyphenating, deduplicating with `-2`, `-3`).
   - Populate `order_items.variant_id` with the default variant ID corresponding to `order_items.product_id`, snapshotting `sku`, `size="ONE_SIZE"`, `color_name="Default"`.
4. Keep original `products.stock_quantity`, `reserved_quantity`, `sold_quantity` intact during this phase.

### 4.2 Phase F1.4: Migration B (Contract)
1. Executed after backend code completely references `ProductVariant` for all reads, writes, and locking.
2. Verify no remaining NULLs in `order_items.variant_id`, `sku`, `size`, `color_name`, and slugs.
3. Drop `products.stock_quantity`, `products.reserved_quantity`, `products.sold_quantity` and their 3 check constraints.
4. Drop legacy `products.paddle_product_id`, `products.paddle_price_id`.
5. Enforce `NOT NULL` on `order_items.variant_id`, `sku`, `size`, `color_name`, `products.slug`, and `categories.slug`.
6. **Downgrade Logic**:
   - Re-add product stock columns and copy aggregated sums (`SUM(stock_quantity)`, etc.) from active variants, logging a warning regarding loss of variant granularity.

---

## 5. Domain Rules & Locking Semantics

### 5.1 Concurrency & Deadlock Prevention
- All transactional operations locking multiple records sort target IDs in ascending numerical order (`ORDER BY id ASC`).
- **Checkout Locking Sequence**:
  1. Aggregate cart items by `variant_id`.
  2. Query and lock `ProductVariant` rows:
     `SELECT * FROM product_variants WHERE id IN (...) ORDER BY id FOR UPDATE`
  3. Validate `is_active` for variant, parent `Product`, and `Category`.
  4. Verify `available_stock = stock_quantity - reserved_quantity - sold_quantity >= requested_quantity`.
  5. Increment `reserved_quantity += quantity`.
  6. Compute unit price (`variant.price or product.price`).
  7. Insert `Order` and `OrderItem` records.
- **State Transition Locking Sequence (`_lock_transition_variants`)**:
  1. Extract distinct `variant_id`s from order items, sort ascending.
  2. Lock variants with `with_for_update()`.
  3. Lock `Order` record with `with_for_update()`.
  4. Apply stock transition atomically (e.g. `PENDING -> PAID`: decrement `reserved_quantity`, increment `sold_quantity`; `PENDING -> CANCELLED/EXPIRED`: decrement `reserved_quantity`).

---

## 6. API Contracts

- `GET /api/v1/categories/tree`: Returns roots with child categories.
- `GET /api/v1/products`: Supports filters `gender`, `brand`, `size`, `color`, `category_id` (recursive), `stock_status`. Uses `EXISTS` subqueries on active variants.
- `GET /api/v1/products/by-slug/{slug}`: Product details with full variant matrix and aggregated pricing.
- `GET /api/v1/products/facets`: Available size, color, brand, and price ranges.
- `GET /api/v1/products/variants/lookup?ids=1,2,3`: Public, batch up to 50 items for cart validation.
- `POST /api/v1/products/{id}/variants/bulk`: Matrix generation with size presets (XS–XXL, 35–45, ONE_SIZE) and colors. Idempotent skip for existing pairs.
- `POST /api/v1/variants/{id}/adjust-stock`: Manual inventory adjustment requiring mandatory `reason`, preventing drops below `reserved + sold`.

---

## 7. Frontend Storefront & Admin

- **Storefront (`/store`)**:
  - Two-way query param synchronization for multi-faceted filters with debounced search.
  - Product card displays `"Từ {price_min}"` when variant pricing differs, with color swatches.
- **Product Detail Page (`/store/products/[slug]`)**:
  - Image gallery synced to selected color.
  - Size and color buttons; out-of-stock sizes disabled based on chosen color.
  - Isolated `useVariantSelection` hook for unit testing.
  - Interactive Size Chart modal from `size_chart` JSON.
  - Review section displays fit feedback summary (% small, % true to size, % large).
- **Cart (`truelook_cart_v2`)**:
  - LocalStorage stores `{ variantId, productId, quantity }`.
  - Real-time SWR validation via `/variants/lookup` on drawer open; flags discontinued variants and blocks checkout if inventory is insufficient.
- **Admin Dashboard**:
  - Fashion attributes form.
  - Variant matrix builder with presets, inline adjustments with audit reasons.
  - Image manager with color tagging and `kind` (`flat_lay`, `model_photo`, `detail`).

---

## 8. Verification & Gate Checks

1. **MariaDB Tests**: Full suite execution (`pytest`) on real MariaDB 11.2 with concurrency integration tests.
2. **Round-Trip Migrations**: 2 consecutive cycles of `upgrade head -> downgrade base -> upgrade head` on MariaDB.
3. **Frontend Suite**: `pnpm vitest run`, `npx tsc --noEmit`, `npx eslint .`, and `next build`.
4. **End-to-End API Flow**: Creation -> bulk variants -> facets/filter -> cart -> checkout -> payment webhook -> stock verification -> expiration restock.
5. **No VTON Code Added**: Confirmed zero ML/try-on endpoints, UI buttons, or tables added. Readiness criteria assessed in `docs/VTON_READINESS.md`.
