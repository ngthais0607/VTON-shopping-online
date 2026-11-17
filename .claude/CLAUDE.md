# TrueLook (fastapi-founder)

Clothing e-commerce: Next.js 16 storefront + admin, FastAPI backend, MariaDB, Redis/ARQ, MinIO, optional CatVTON virtual try-on. Windows dev machine, PowerShell is the usual shell. Product docs live in `README.md` and `docs/`; this file only holds what an assistant would otherwise guess wrong.

## Layout

- `backend/app/features/*` – routers + services (services own SQLAlchemy queries and transactions). `integrations/` = MinIO, Redis queue, SMTP, VietQR. `jobs/` + `worker.py` = ARQ. `vton_worker.py` = separate try-on queue.
- `backend/alembic/versions/` – migrations. `backend/tests/` – unit tests (SQLite); `tests/integration/` needs MariaDB.
- `frontend/` – Next.js App Router (`app/`, `components/`, `hooks/`, `lib/`), Vitest in `tests/`, Playwright in `e2e/`.
- `vton-service/` – CatVTON inference service (GPU), not part of normal CI.
- `docker-compose.yml` – canonical Compose project is `truelook` (see `docs/LOCAL_ENVIRONMENT.md`).

## Commands

Backend (run from `backend/`, use `backend/.venv`, never the system Python):

```powershell
$env:REDIS_URL='memory://'; $env:EMAILS_ENABLED='false'
.venv/Scripts/python.exe -m pytest tests --ignore=tests/integration -q
.venv/Scripts/python.exe -m ruff check app tests
.venv/Scripts/python.exe -m ruff format --check app tests   # CI fails on this; line length 88
```

Frontend (run from `frontend/`, pnpm 10.33.4, Node 22):

```powershell
pnpm test; pnpm exec tsc --noEmit; pnpm exec eslint . --max-warnings=0; pnpm build
```

MariaDB integration tests (needs Docker): `backend/.venv/Scripts/python.exe .github/scripts/run_integration.py`.
CI (`.github/workflows/ci.yml`) runs all of the above plus an Alembic upgrade/downgrade round trip and a Compose smoke test. Match it before pushing.

## Rules that matter

- **Never** run `docker compose down -v` or point `TEST_DATABASE_URL` at the main database; the `truelook_*_data` volumes hold the real local catalog, orders and images. Tests write `./test.db` (SQLite) in the working directory.
- `demo-backups/` and `.env` contain credentials and customer data. Never print, commit or paste them.
- Money/stock paths are sensitive: checkout, order state transitions, VietQR webhook, inventory adjustments. They rely on DB row locking and constraints. Change them only with a failing test first, and run the concurrency tests (`tests/integration/`).
- Schema changes need an Alembic migration that survives `downgrade base` then `upgrade head`. Do not edit an existing migration that has been applied.
- Dependencies are hash-locked (`backend/requirements*-lock.txt`, `frontend/pnpm-lock.yaml`). Edit the `.in` files and regenerate; do not hand-edit lockfiles. Native Windows uses the `*-windows-lock.txt` files (Python 3.13); Docker/CI use Python 3.12.
- `NEXT_PUBLIC_*` values are compiled in: after changing API/image URLs rebuild the frontend image.
- `ruff` runs only `E4,E9,F,I`; keep imports sorted. Frontend lint is `--max-warnings=0`.

## Domain conventions

- Catalogue and UI copy are English. Four flat top-level categories are in use; the older Vietnamese slugs still exist in code, so do not delete mapping entries without checking `backend/app/features/vton/mapping.py`.
- Virtual try-on: mapped by category slug in `features/vton/mapping.py`; a product only offers it when a raster garment image (`ProductImage.kind = vton_garment`) exists for the colour. `VTON_ENGINE=mock` (default) never runs AI and stamps "DEMO PREVIEW"; `catvton` calls `vton-service`. `docs/VTON.md` is authoritative; the README line saying try-on is "not implemented" is outdated.
- Inventory belongs to variants; checkout uses `variant_id` and stores order-item snapshots. Server-side price/stock checks are authoritative.

## Working agreements

- One change per branch, small PRs, CI green before merge. Never merge or deploy for the user unprompted.
- Ask before: deleting data or volumes, rewriting migrations, changing payment logic, force-pushing, adding dependencies.
- Reports and design notes go in `docs/`, not the repo root. Do not leave scratch files, screenshots or model outputs in the repo; use a temp directory.
- A `ruff` hook runs after every Python edit under `backend/` (`.claude/settings.json`). Fix what it reports.
