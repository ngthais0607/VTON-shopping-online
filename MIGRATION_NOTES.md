# TrueLook (AI-VTON) Migration & Operational Architecture Guide

## 1. Overview & Objectives

This document summarizes the architectural hardening, data integrity improvements, and operational optimizations delivered across the system:

- **Security & Payments:** Timing-safe static secret comparison (`hmac.compare_digest`) via `X-Webhook-Secret` header, strict memo pattern matching, secure HTTP-only cookies, bounded stream reading & magic-byte image validation (JPEG, PNG, WebP up to 5MB), and unguessable public order tracking tokens.
- **Data Model & Integrity:** Transitioned from single-product order records to a normalized `Order` + `OrderItem` (`1:N`) architecture, `Numeric(12, 2)` monetary columns in MariaDB, atomic inventory reservation, deadlock-free row locking ordering (`Product` before `Order`), and centralized state machine transitions.
- **Frontend & Rebranding:** Rebranded from `LuxeStore` to `TrueLook`, full TypeScript 5.7.3 alignment, multi-item order breakdown in admin and customer views, and clean Next.js 16 production builds.
- **Reliability & CI:** GitHub Actions CI with MariaDB 11.2 and Redis 7 service containers running unit and concurrency tests, modernized Docker Compose without obsolete `version` tags and externalized `.env` credentials.
- **Performance & Observability:** Composite and MariaDB `FULLTEXT` indexes, Redis caching for dashboard metrics with automatic invalidation, batch order expiration using `SKIP LOCKED`, request ID correlation middleware (`X-Request-ID`), and health check endpoint (`/api/v1/health`).

---

## 2. Database Migrations

### Revision History
1. `6ea70e2e94f1_initial_schema.py`: Initial schema baseline.
2. `c91f8a4e2b10_add_order_fulfillment_fields.py`: Added `public_code`, `payment_method`, `notes`, `expires_at`, `paid_at`.
3. `8f4c2d1a7b90_add_user_refresh_version.py`: Added durable `refresh_version` on users for revocation.
4. `d4a7c8e91f23_order_items_and_reviews_integrity.py`: Created `order_items` and `product_reviews`, backfilled legacy orders into `order_items`, added quantity constraints (`stock_quantity >= 0`, `reserved_quantity >= 0`, `sold_quantity >= 0`).
   > **CẢNH BÁO MẤT DỮ LIỆU (DATA LOSS WARNING):** Chạy `alembic downgrade` qua revision này sẽ DROP hoàn toàn hai bảng `order_items` và `product_reviews`, làm mất toàn bộ chi tiết sản phẩm của các đơn hàng và toàn bộ đánh giá của khách hàng mà không thể khôi phục nếu không có bản sao lưu trước đó.
5. `e5b8c9d0f1a2_performance_indexes.py`: Added composite indexes (`ix_orders_user_status`, `ix_orders_status_created_at`, `ix_orders_status_expires_at`, `ix_products_cat_active_price`) and MariaDB `FULLTEXT` index (`ix_products_name_desc_ft`).
6. `f7c2a1b9e8d3_enforce_orders_public_code_not_null.py`: Enforced non-null constraint on orders public_code.
7. `a1b2c3d4e5f6_expand_product_variants_and_fashion.py`: Expand migration introducing `product_variants` (size, color, SKU, price override, variant inventory), fashion attributes (`brand`, `gender`, `material`, `fit`, `care_instructions`, `size_chart`), category hierarchy (`parent_id`, `slug`), and backfilling existing catalog stock into default `ONE_SIZE` variants.
8. `b2c3d4e5f6a7_contract_drop_product_stock_paddle.py`: Contract migration dropping legacy stock columns from `products` table and dropping legacy Paddle payment columns.
9. `c3d4e5f6a7b8_add_inventory_adjustments.py`: Added inventory adjustments table and audit reason tracking.
10. `d4e5f6a7b8c9_dedupe_and_add_unique_review_constraint.py`: Deduplicates legacy reviews per (user_id, product_id) preserving newest created_at (with ID tie-break), and adds unique constraint `uq_product_reviews_user_product`.
    > **CẢNH BÁO MẤT DỮ LIỆU (DESTRUCTIVE DEDUPLICATION WARNING):** Revision này xóa vĩnh viễn các đánh giá trùng lặp cũ hơn của cùng một người dùng trên cùng một sản phẩm. Khi chạy `alembic downgrade`, constraint duy nhất bị xóa nhưng các bản ghi đánh giá trùng lặp đã bị xóa sẽ KHÔNG được khôi phục.

### How to Apply Migrations
```bash
cd backend
alembic upgrade head
```

To roll back the latest revision:
```bash
alembic downgrade -1
```

> **Note on Application Startup:**
> `Base.metadata.create_all()` has been strictly removed from runtime startup code and seed scripts. All schema modifications are tracked deterministically via Alembic migrations.

---

## 3. Data Model Changes

### 3.1 Order and OrderItem (1:N)
- A checkout containing multiple products now creates a single `Order` with multiple associated `OrderItem` records.
- For backward compatibility with existing clients, `Order` preserves legacy fields (`product_name`, `unit_price`, `quantity`, `product_id`) referencing the primary item while exposing `items: list[OrderItemResponse]` in API responses.
- Database tables:
  - `orders`: `id`, `user_id`, `total_amount` (`Numeric(12, 2)`), `status`, `payment_method`, `public_code`, `expires_at`, `paid_at`, etc.
  - `order_items`: `id`, `order_id` (FK to `orders.id`), `product_id` (FK to `products.id`), `product_name`, `unit_price` (`Numeric(12, 2)`), `quantity`, `subtotal` (`Numeric(12, 2)`).

### 3.2 Monetary Precision
- Product price, order item price, order total, and payment amount now use `sa.Numeric(12, 2)` in MariaDB.
- Financial arithmetic in Python uses Python's `Decimal` with `ROUND_HALF_UP` for VietQR memo and payment amounts.
- API serialization formats prices as standard JSON floating-point numbers (`50.0`) to maintain full backward compatibility with frontend clients.

### 3.3 Fashion Catalog & Variant Inventory Breaking Changes
- **Cart Keying (`truelook_cart_v2`):** Frontend cart now stores items uniquely keyed by `variant_id` (`{ variantId: number, productId: number, quantity: number }`). Legacy `luxestore_cart` and `fastapi_store_cart` keys are safely upgraded or ignored.
- **Cart Checkout (`POST /api/v1/orders/checkout-cart`):** Checkout payload requires `variant_id` on each item. Server validates stock and creates `OrderItem` referencing `variant_id`, preserving size, color, and SKU snapshots.
- **Catalog Computed Projections:** `ProductResponse` dynamically computes `price_min`, `price_max`, `available_sizes`, and `available_colors` across active variants.
- **Variant Inventory Management:** Product stock updates are performed via `POST /api/v1/variants/{id}/adjust-stock` with mandatory audit reason (`set`, `restock`, `damage`, `correction`).
- **Variant Lookup Endpoint:** `GET /api/v1/products/variants/lookup?ids=1,2,3` allows clients to fetch live pricing and stock status for cached cart items in a single HTTP roundtrip.

---

## 4. Concurrency & Deadlock Prevention

### Row Locking Hierarchy
To prevent database deadlocks under high-concurrency checkouts and expiration sweeps:
1. All candidate product IDs are discovered first without locks.
2. `Product` and `ProductVariant` rows are locked with `FOR UPDATE` strictly in ascending order by `id`.
3. `Order` rows are locked with `FOR UPDATE` strictly after product rows.
4. Background order expiration uses `SELECT ... FOR UPDATE SKIP LOCKED` with a batch size limit (default `50`), ensuring long-running cron jobs never block or wait on active checkout transactions. Inventory restoration locks affected `ProductVariant` rows strictly in ascending order with `FOR UPDATE` to release reserved quantities without deadlocks.

---

## 5. Caching & Operational Architecture

### 5.1 Dashboard Caching (`app/core/cache.py`)
- Key: `dashboard:metrics`
- TTL: 60 seconds
- Invalidation: Automatically triggered when orders are created, payment status updates, orders cancel/expire, or product inventory changes.
- Fallback: Gracefully falls back to in-memory TTL caching or direct database queries if Redis is unavailable.

### 5.2 Observability & Health
- **Endpoint:** `GET /api/v1/health`
  - Validates active database connectivity (`SELECT 1`), Redis ping, and storage configuration.
  - Returns `200 OK` with `{"status": "ok", "components": {...}}` or `503 Service Unavailable` if database connectivity is down.
- **Request Tracing:** `RequestIDMiddleware` injects or propagates `X-Request-ID` across all incoming HTTP requests and response headers.

---

## 6. Environment Variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | MariaDB / MySQL connection string | `mysql+pymysql://root:password123@localhost:3307/fastapi_founder` |
| `TEST_DATABASE_URL` | Integration test database | `mysql+pymysql://root:password123@localhost:3307/fastapi_founder` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` (or `memory://`) |
| `SECRET_KEY` | Secret key for JWT signing (min 32 chars) | Required |
| `VIETQR_BANK_ID` | Bank BIN code | Required |
| `VIETQR_ACCOUNT_NO` | Bank account number | Required |
| `VIETQR_ACCOUNT_NAME` | Bank account name | `TRUELOOK` |
| `VIETQR_WEBHOOK_SECRET` | Secret for verifying webhook HMAC | Required in production |
| `MINIO_ENDPOINT` | MinIO host and port | `localhost:9000` |
| `MINIO_ACCESS_KEY` | MinIO root user | `admin` |
| `MINIO_SECRET_KEY` | MinIO root password | `password123` |
| `MINIO_BUCKET` | Image storage bucket | `product-images` |

---

## 7. Verification & Testing

### Running Tests
- **Backend Full Suite (Unit + Concurrency Integration):**
  ```bash
  cd backend
  $env:PYTHONPATH="."
  $env:TEST_DATABASE_URL="mysql+pymysql://root:password123@localhost:3307/fastapi_founder"
  .venv\Scripts\pytest -v
  ```
- **Backend Linting:**
  ```bash
  cd backend
  .venv\Scripts\ruff check app/ tests/
  ```
- **Frontend Quality & Tests:**
  ```bash
  cd frontend
  npx tsc --noEmit
  npm test
  npm run build
  ```

---

## 8. Known Limitations & Operational Considerations

- **VietQR Webhook Verification:** Merchant payment notification authentication uses timing-safe static secret verification (`hmac.compare_digest`) provided in the `X-Webhook-Secret` HTTP header. The webhook payload body is not cryptographically signed with HMAC-SHA256 and does not include timestamp replay defense. This aligns with standard Vietnamese banking webhook aggregators which push static shared secrets.
- **Asynchronous Email Queue Reliability:** Outbound order confirmation emails are dispatched using ARQ over Redis via best-effort enqueue. While enqueue failures log structured errors with associated `order_id` and metadata, there is currently no persistent database dead-letter queue table for automated resending.
- **Irreversible Migration Rollback:** Downgrading past migration `d4a7c8e91f23` drops the `order_items` and `product_reviews` tables. Order-item line records and review content will be permanently lost unless restored from a pre-downgrade database snapshot.
- **Irreversible Review Deduplication (`d4e5f6a7b8c9`):** Upgrading through `d4e5f6a7b8c9` permanently deletes older duplicate reviews per `(user_id, product_id)` to enforce the `uq_product_reviews_user_product` unique constraint. Downgrading removes the constraint but cannot restore the deleted duplicate review records.
