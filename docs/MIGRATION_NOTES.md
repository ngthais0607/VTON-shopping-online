# Database Migration Guide & Notes

This document describes the database migration architecture, zero-downtime expand-contract strategy, and operational procedures for TrueLook E-Commerce (MariaDB 10.11+ / MySQL 8.0+).

---

## 1. Migration Chain Overview

The current migration head is `c3d4e5f6a7b8`:

```text
<base>
  │
  ▼
001_initial (Baseline schema: users, categories, products, orders, payments)
  │
  ▼
8f4c2d1a7b90_user_refresh_version (Refresh token rotation versioning)
  │
  ▼
a1b2c3d4e5f6_expand_product_variants_and_fashion (Expand phase: ProductVariants, fashion attributes, images, reviews)
  │
  ▼
b2c3d4e5f6a7_contract_product_legacy_columns (Contract phase: Preflight validation, clamp mode, slug uniqueness, drops legacy stock)
  │
  ▼
c3d4e5f6a7b8_add_inventory_adjustments (Audit phase: Adds inventory_adjustments table with FK to product_variants)
  │
  ▼
d4e5f6a7b8c9_dedupe_and_add_unique_review_constraint (Integrity phase: Deduplicates reviews, adds unique constraint)
  (head)
```

---

## 2. Key Migration Revisions

### `b2c3d4e5f6a7` (Contract Phase Preflight & Safe Clamp)
- **Preflight checks:** Validates that all active products have valid slugs and corresponding variants.
- **Inlined slug helpers:** Does not import application-level modules into Alembic migration scripts, preventing runtime circular import issues during standalone deployments.
- **Clamp Mode:** Resolves data discrepancies gracefully during migration execution:
  - Clamps negative stock quantities to zero.
  - Sanitizes and ensures uniqueness for null/duplicate product slugs.
- **MariaDB Concurrency:** Explicitly locks table rows during backfill and migration execution.

### `c3d4e5f6a7b8` (Inventory Adjustments Audit Table)
- **Schema:**
  - `id`: BigInteger auto-increment primary key.
  - `variant_id`: Integer foreign key referencing `product_variants.id` with `ON DELETE CASCADE`.
  - `old_stock`: Integer, previous stock quantity snapshot.
  - `new_stock`: Integer, updated stock quantity snapshot.
  - `delta`: Integer, difference (`new_stock - old_stock`).
  - `reason`: String(500), mandatory explanation for audit trail.
  - `user_id`: Integer, nullable user/admin identifier.
  - `created_at`: DateTime(timezone=True), timestamp of adjustment.
- **Indexes:**
  - `ix_inventory_adjustments_variant_id` on `variant_id`.
  - `ix_inventory_adjustments_created_at` on `created_at`.
- **Downgrade Safety:** In MariaDB/MySQL, dropping an index referenced by active foreign key constraints causes error 1553. The downgrade procedure directly drops `inventory_adjustments`, automatically removing associated constraints and indexes cleanly.

### `d4e5f6a7b8c9` (Review Deduplication & Unique Constraint)
- **Deduplication:** Scans `product_reviews` for duplicate entries with the same `(user_id, product_id)`. Retains the newest review based on `created_at` (tie-breaking with largest `id`), and deletes older duplicates.
- **Unique Constraint:** Creates `uq_product_reviews_user_product` on `(user_id, product_id)` using dialect-safe `batch_alter_table`.
- **Destructive Limitation Warning:** Older duplicate reviews are permanently removed during upgrade. Downgrade drops `uq_product_reviews_user_product` but does not restore previously deleted duplicate reviews.

---

## 3. Operational Verification Procedures

### Alembic 2-Cycle Roundtrip
To verify schema reversibility and migration integrity against a clean MariaDB test database:

```powershell
# Upgrade to head
$env:DATABASE_URL="mysql+pymysql://root:password123@127.0.0.1:3307/fastapi_founder_test"
.\.venv\Scripts\alembic.exe upgrade head

# Downgrade to base (Cycle 1)
.\.venv\Scripts\alembic.exe downgrade base

# Upgrade to head (Cycle 2)
.\.venv\Scripts\alembic.exe upgrade head

# Check current revision
.\.venv\Scripts\alembic.exe current
# Expected: c3d4e5f6a7b8 (head)
```

### Seed Data Idempotency
Verify that running the seed process multiple times does not produce duplicate rows or trigger constraint violations:

```powershell
# First execution
.\.venv\Scripts\python.exe -m app.seed --force

# Second execution (should report existing entities without error)
.\.venv\Scripts\python.exe -m app.seed --force
```

---

## 4. Zero VTON Boundary Commitment
- **Zero VTON Schema Objects:** No `vton_*` tables, columns, or foreign keys exist in migrations.
- **Future Integration:** All VTON deep learning inference pipelines must be integrated in future feature branches behind isolated workers and tables as outlined in `docs/VTON_READINESS.md`.
