# TrueLook Frontend

The storefront and the admin dashboard use the Next.js App Router, React, TypeScript, and Tailwind CSS. Axios calls the API; SWR manages data in the browser.

[Main README](../README.md) · [Backend](../backend/README.md) · [Design references](../docs/design-review/README.md)

## Run for development

You need Node.js 22, pnpm 10.33.4, and a running TrueLook API. The quickest way is to keep the backend in Docker. From the repository root, prepare `.env` as described in the [quickstart](../README.md#quickstart), then run:

```powershell
docker compose stop frontend
docker compose up --build -d --wait api arq_worker vton_worker
Set-Location frontend
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
pnpm install --frozen-lockfile
pnpm dev
```

- [Storefront](http://localhost:3000/store) · [Collection](http://localhost:3000/store/collection)
- [Admin sign-in](http://localhost:3000/login) · [Dashboard](http://localhost:3000/dashboard)

If the database is empty, [create an administrator](../backend/README.md), then add a category, a product, variants, and images from the admin dashboard.

## Configuration

| Variable in `.env.local` | Role |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | API address for the browser; `.env.example` sets `http://localhost:8000`. The client normalizes the `/api/v1` prefix. |
| `NEXT_PUBLIC_IMAGE_HOST` | Image origin allowed for Next Image; `.env.example` sets `http://localhost:9000`. |
| `MINIO_INTERNAL_URL` | MinIO origin that Next.js uses when rewriting `/storage/<bucket>/...` paths. Set it only when it differs from the native default `http://localhost:9000`. |
| `MINIO_BUCKET` | Bucket name for the `/storage/` path. Set it only when the backend uses a name other than `product-images`. |

Use `localhost` or `127.0.0.1` consistently. If you change the frontend address or port, add the matching origin to the API's `CORS_ORIGINS`. After changing `NEXT_PUBLIC_*`, restart the dev server or rebuild the production build.

The access token is kept in memory; the refresh token uses an HttpOnly cookie. The cart stores variant IDs and quantities in the browser. The API decides the final price and stock availability.

## Find the code

| Path | Contents |
| --- | --- |
| [app/store/](app/store/) | Home, collection, product, account, and checkout pages |
| [app/dashboard/](app/dashboard/) · [app/products/](app/products/) · [app/orders/](app/orders/) | Dashboard and admin screens |
| [components/](components/) · [hooks/](hooks/) | Shared components and client-side logic |
| [lib/](lib/) | API client, sessions, images, and types |
| [tests/](tests/) · [e2e/](e2e/) | Vitest and Playwright tests |

## Tests

From `frontend/`:

```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings=0
pnpm build
```

The Playwright flows need the API, MinIO, and test data. To let the script prepare the data and run on a temporary stack, install Chromium with `pnpm exec playwright install chromium` in `frontend/` (after `pnpm install --frozen-lockfile`). Then return to the repository root and run:

```powershell
$env:SMOKE_BROWSER_TESTS = '1'
backend/.venv/Scripts/python.exe .github/scripts/compose_smoke.py
```
