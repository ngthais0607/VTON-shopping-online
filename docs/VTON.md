# Virtual try-on (CatVTON)

Updated 2026-11-09. Pipeline is implemented and tested with a CPU **mock** engine. The real CatVTON service (`vton-service/`) is written but **has not been run here** (no GPU in CI/dev); treat quality, latency and VRAM needs as unverified until you benchmark it.

## Flow

1. Product page asks `GET /api/v1/vton/products/{id}/eligibility?color=` and shows **Virtual try-on** only if the category is mapped and a raster garment image exists for the colour.
2. Signed-in user uploads a portrait photo with explicit consent → `POST /api/v1/vton/tasks` (202). Photo is validated (PNG/JPEG/WebP, ≤5 MiB, ≥256 px, portrait), EXIF/GPS stripped, stored privately under `vton/people/`.
3. Task row (`vton_tasks`) is committed, then enqueued on a **separate ARQ queue** (`vton`) consumed by the `vton_worker` container. Order e-mail/expiry worker is untouched.
4. Worker claims the task atomically, calls the engine, stores `vton/results/{id}.png`.
5. UI polls `GET /tasks/{id}`; images are fetched through authenticated endpoints (`/tasks/{id}/person|result`, `Cache-Control: private, no-store`). The bucket policy only exposes `products/*`, so `vton/*` is never public.

## Engines (`VTON_ENGINE`)

| Value | What it does |
|---|---|
| `mock` (default) | Overlays the garment on the photo and stamps "DEMO PREVIEW". No AI. For dev/CI. |
| `catvton` | HTTP call to `vton-service` (CatVTON, `upper`/`lower`/`overall`). Needs an NVIDIA GPU; first start downloads ~10 GB into the `catvton_models` volume. |

Denoising steps default to 10 (`CATVTON_STEPS`, set in `.env`; upstream uses 50). Fewer steps are faster but blurrier; raise it if results look unfinished.

Run real inference: set `VTON_ENGINE=catvton`, then `docker compose --profile gpu up -d --build catvton vton_worker`. Pin `CATVTON_REF` in `vton-service/Dockerfile` to a reviewed upstream commit.

## Catalog mapping

Explicit in `backend/app/features/vton/mapping.py` (by category slug, parent as fallback; `vay-dam` is intentionally unmapped). Anything else is `category_unsupported`. If an admin edits a mapped slug the product silently becomes unsupported.

Garment images: `ProductImage.kind = vton_garment` (or `flat_lay`/`catalog`), raster only, optional `color_name`. SVG never qualifies.

## Garment images (no seed data)

The project ships no seed data, so a product only offers try-on once an administrator uploads a raster garment image for it. In the admin product page choose the image type "Try-on garment" and, for multi-colour products, the matching colour (API: `kind=vton_garment`, `color_name`).

`frontend/public/garments/` keeps 24 ready-made studio photos (flat-lay garment on a white background, 768×1024), named `<product-slug>__<colour-slug>.png`, that can be uploaded this way.

## Safety, quota, retention

- Consent required on every task (`consent_at` stored). Only the owner can read/delete; others get 404.
- One active task per user; `VTON_DAILY_QUOTA` tasks per rolling 24 h (deleting a photo does not refund quota). Rate limit 10 requests/min.
- `Idempotency-Key` header makes retries safe. Lost enqueues and stuck tasks are recovered by cron (every 30 s); failures after `VTON_MAX_ATTEMPTS` become `failed`.
- Photos/results are purged after `VTON_RETENTION_HOURS` or when the user deletes them; the row remains for quota accounting.

## Known gaps

No GPU benchmark; no admin UI for category mapping or garment kinds; no moderation of uploaded photos beyond format checks; the one-active-task check is not a DB constraint (two simultaneous requests can both pass).

## Long-running generation

Generation time is not capped for the user. Timeouts are layered so nothing fails a task that is still running:

| Layer | Setting | Default |
| --- | --- | --- |
| Engine HTTP call to the GPU service | `VTON_SERVICE_TIMEOUT_SECONDS` | 3600 s |
| ARQ job timeout | service timeout + 60 s | 3660 s |
| Recovery cron fails a `processing` task after | `VTON_STALE_PROCESSING_MINUTES` | 75 min |
| Storefront polling | `VTON_POLL_TIMEOUT_MS` (frontend) | 2 h |

`VTON_STALE_PROCESSING_MINUTES` must exceed the service timeout by at least 2 minutes (enforced at startup). The storefront keeps polling through transient network errors and re-attaches to an in-flight task when the modal is reopened, so the user can close it and come back. The first real CatVTON run also downloads model weights, which can add several minutes.
