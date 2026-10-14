# Virtual Try-On (VTON) Architectural Readiness Assessment

This document provides a comprehensive evaluation of the TrueLook platform's architectural, data model, and operational readiness for integrating Virtual Try-On (VTON) deep learning inference pipelines.

---

## 1. Executive Summary & Readiness Matrix

| Area | Status | Notes |
|---|---|---|
| **(a) CI & Test Suite Integrity** | ✅ **READY** | Full green test suites across Backend (Pytest 328/328 tests) and Frontend (Vitest 21/21 files, 86/86 tests). Expand-and-contract migrations verified across round-trip cycles up to head `c3d4e5f6a7b8`. |
| **(b) Variant Data Model Stabilization** | ✅ **READY** | Normalized `ProductVariant` entity with size, color, SKU, and MariaDB concurrency safety. Cart and order items strictly key by `variant_id`. Audit history recorded in `inventory_adjustments`. |
| **(c) Garment Imagery Specification** | ⚠️ **CONDITIONAL** | Support for `kind` (`model_photo`, `flat_lay`, `detail`, `size_chart`, `catalog`) and `color_name` tagging exists in `ProductImage`. Product photography guidelines must enforce transparent/neutral flat-lay images for ML warp models. |
| **(d) Category Classification Mappings** | ✅ **READY** | Hierarchical category system (`Áo`, `Quần`, `Váy & Đầm`, `Áo khoác`, `Giày`, `Phụ kiện`) maps 1:1 to VTON engine garment classes (upper-body, lower-body, dresses/full-body). |
| **(e) Async Task Queue Pipeline** | ✅ **READY** | ARQ over Redis 7 is established and operational for background processing. Ready to accept async GPU job dispatching and webhook callbacks without blocking HTTP workers. |
| **(f) Object Storage & Mask Artifacts** | ✅ **READY** | MinIO S3-compatible storage with dedicated bucket configurations supports human pose maps, garment masks, and warp output composites. |
| **(g) Business & Product Decision Items** | 🚩 **ACTION REQUIRED** | Requires business decisions regarding user photo retention, privacy consent regulations, inference timeout SLA (5-15s), and GPU infrastructure hosting. |

---

## 2. Detailed Technical Readiness Assessment

### (a) CI & Test Suite Stability
- **Backend:** 100% test pass rate with Pytest (328 tests) against MariaDB 10.11+ and SQLite fallback. Concurrency tests guarantee deadlock-free inventory reservation (`ORDER BY product_id ASC, id ASC FOR UPDATE`).
- **Frontend:** 100% Vitest pass rate across 21 test files (86 passing tests) and clean TypeScript type-checking (`tsc --noEmit` exits code 0).
- **Alembic:** Expand-and-contract migration pipeline (`a1b2c3d4e5f6`, `b2c3d4e5f6a7`, `c3d4e5f6a7b8`) tested with full round-trip upgrade/downgrade consistency.

### (b) Variant Data Model (`ProductVariant`)
- VTON engines require exact garment specifications (e.g., trying on a "Red Size M" vs. "White Size S").
- `ProductVariant` attributes (`size`, `color_name`, `color_hex`, `sku`) are first-class database entities.
- Every cart item and checkout order item records the `variant_id` exclusively, eliminating arbitrary variant fallback.
- Stock adjustments are tracked in `inventory_adjustments` audit table.
- Strict **Zero-VTON Boundary**: No `vton_*` tables or mock inference endpoints exist in the base catalog release branch.
- Every cart item and checkout order item records the `variant_id` alongside product snapshots, ensuring try-on actions link directly to cart adds with identical variant parameters.

### (c) Flat-Lay vs. On-Model Photography
- **VTON Input Requirements:** Diffusion-based virtual try-on pipelines (such as IDM-VTON, OOTDiffusion, or CatVTON) require high-resolution flat-lay garment cutouts (white or transparent background, no human model overlapping the clothing).
- **Database Schema Support:** `ProductImage` includes:
  - `kind`: `model_photo` vs. `flat_lay` vs. `back_view`.
  - `color_name`: Associates specific photos with corresponding variant colors.
- **Action Needed:** When catalog merchants upload garments, the admin portal should require at least one `flat_lay` image per variant color to feed into the warp segmentation pre-processor.

### (d) Category Engine Mappings
VTON diffusion pipelines segment garments into 3 canonical semantic categories:
1. **Upper-Body (`upper`):**
   - TrueLook Categories: `Áo thun` (T-shirts), `Áo sơ mi` (Shirts), `Áo polo` (Polos), `Áo hoodie` (Hoodies), `Áo khoác bomber` (Bombers), `Áo blazer` (Blazers).
2. **Lower-Body (`lower`):**
   - TrueLook Categories: `Quần jeans` (Jeans), `Quần tây` (Trousers), `Quần short` (Shorts), `Chân váy chữ A` (Skirts).
3. **Full-Body / Dresses (`dresses`):**
   - TrueLook Categories: `Đầm dáng xòe` (Flared dresses), `Đầm dạ hội` (Evening gowns).

Each subcategory has a deterministic slug that maps directly to the appropriate VTON pipeline configuration.

### (e) Asynchronous Job Queue (ARQ + Redis)
- **Problem:** Neural network inference on GPU nodes takes between 3 to 15 seconds per try-on session. Running inference synchronously in FastAPI request threads would exhaust worker pools and trigger HTTP timeouts.
- **Current Architecture:** TrueLook already uses ARQ with Redis 7 for scheduled background jobs and email notifications.
- **Integration Path:**
  1. Frontend submits try-on request (`POST /api/v1/vton/try-on`).
  2. FastAPI creates a pending `VtonTask` record and enqueues an ARQ job `generate_tryon_task(user_id, garment_variant_id, photo_url)`.
  3. Worker dispatches payload to dedicated GPU worker (e.g., RunPod, Modal, or local ComfyUI/Triton server).
  4. On completion, worker updates task status to `completed` and notifies client via polling or WebSocket/Server-Sent Events (SSE).

### (f) Object Storage & Artifact Isolation
- MinIO S3 storage is already configured with presigned URLs and dedicated bucket structures.
- For VTON production readiness, create two isolated buckets:
  1. `vton-user-photos`: Strictly private with short-lived presigned URLs (15-minute TTL) for customer input selfies/full-body pictures.
  2. `vton-results`: Cache bucket for rendered try-on outputs with automatic lifecycle deletion policies (e.g., expire after 30 days unless saved to user gallery).

---

## 3. Product & Governance Decisions Flagged for Business Review

Before enabling live user try-on in production, the product and legal teams must resolve:

1. **User Photo Retention & Biometric Consent:**
   - Vietnam Personal Data Protection Decree (PDPD / Decree 13/2023/ND-CP) and international privacy laws mandate explicit consent before processing facial/body biometric photos.
   - Recommended policy: Checkbox consent on upload; photos automatically purged 24 hours after session unless user explicitly opts in to save to "My TrueLook Avatar".
2. **GPU Infrastructure & Cost Economics:**
   - Inference cost ranges from $0.005 to $0.02 per try-on on shared NVIDIA A10G/L4 GPUs.
   - Rate limiting policy required: e.g., 5 free try-ons per day for guests; unlimited for signed-in customers with purchase history.
3. **Latency & Fallback UX:**
   - When GPU nodes are cold-booting, inference latency may spike to 30-45 seconds.
   - Frontend must implement animated skeleton previews and progress stages ("Segmenting garment...", "Aligning posture...", "Generating look...").
