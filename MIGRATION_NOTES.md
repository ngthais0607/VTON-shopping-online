# TrueLook (AI-VTON) Migration & Operational Architecture Guide

## 1. Overview & Objectives

This document summarizes the architectural hardening, data integrity improvements, and operational optimizations delivered across the system:

- **Security & Payments:** Constant-time HMAC-SHA256 webhook verification, strict memo pattern matching, secure HTTP-only cookies, magic-byte image validation, and unguessable public order tracking tokens.
- **Data Model & Integrity:** Transitioned from single-product order records to a normalized `Order` + `OrderItem` (`1:N`) architecture, `Numeric(12, 2)` monetary columns in MariaDB, atomic inventory reservation, deadlock-free row locking ordering (`Product` before `Order`), and centralized state machine transitions.
- **Frontend & Rebranding:** Rebranded from `LuxeStore` to `TrueLook`, full TypeScript 5.8 alignment, multi-item order breakdown in admin and customer views, and clean Next.js 16 production builds.
- **Reliability & CI:** GitHub Actions CI with MariaDB 11.2 and Redis 7 service containers running unit and concurrency tests, modernized Docker Compose without obsolete `version` tags and externalized `.env` credentials.
- **Performance & Observability:** Composite and MariaDB `FULLTEXT` indexes, Redis caching for dashboard metrics with automatic invalidation, batch order expiration using `SKIP LOCKED`, request ID correlation middleware (`X-Request-ID`), and health check endpoint (`/api/v1/health`).

---

## 2. Database Migrations

### Revision History
1. `6ea70e2e94f1_initial_schema.py`: Initial schema baseline.
2. `c91f8a4e2b10_add_order_fulfillment_fields.py`: Added `public_code`, `payment_method`, `notes`, `expires_at`, `paid_at`.
3. `8f4c2d1a7b90_add_user_refresh_version.py`: Added durable `refresh_version` on users for revocation.
4. `d4a7c8e91f23_order_items_and_reviews_integrity.py`: Created `order_items` and `product_reviews`, backfilled legacy orders into `order_items`, added quantity constraints (`stock_quantity >= 0`, `reserved_quantity >= 0`, `sold_quantity >= 0`).
5. `e5b8c9d0f1a2_performance_indexes.py`: Added composite indexes (`ix_orders_user_status`, `ix_orders_status_created_at`, `ix_orders_status_expires_at`, `ix_products_cat_active_price`) and MariaDB `FULLTEXT` index (`ix_products_name_desc_ft`).

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

---

## 4. Concurrency & Deadlock Prevention

### Row Locking Hierarchy
To prevent database deadlocks under high-concurrency checkouts and expiration sweeps:
1. All candidate product IDs are discovered first without locks.
2. `Product` rows are locked with `FOR UPDATE` strictly in ascending order by `id`.
3. `Order` rows are locked with `FOR UPDATE` strictly after product rows.
4. Background order expiration uses `SELECT ... FOR UPDATE SKIP LOCKED` with a batch size limit (default `50`), ensuring long-running cron jobs never block or wait on active checkout transactions.

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
