# AI-VTON commerce MVP

FastAPI commerce API for catalog, customer accounts, cart checkout, order tracking, and an admin dashboard. The checked-in Next.js client uses the versioned API, paged collections, current account contracts, product images, checkout and order tracking. Frontend component/transport tests and live HTTP flows against isolated MariaDB, Redis and MinIO have been exercised. Interactive browser verification and real SMTP delivery remain separate checks; this milestone is not a production-release certification.

The current milestone repairs the existing backend/frontend flows. Currency policy, new payment integrations and VTON integration are deferred until these flows are ready. The existing COD and manual VietQR flow remain available. See the [BE–FE verification record](docs/reviews/2026-10-12-be-fe-flow-repair-review.md) for completed checks, implementation decisions and remaining limits.

The BE–FE repair was merged locally into `main` on 2026-10-12. The root `backend/` and `frontend/` now contain the repaired implementation; running it no longer requires the implementation worktree. VTON has not been integrated. Browser interaction and real SMTP delivery remain release checks.

## Architecture and scope

HTTP routers validate requests, require the appropriate user, and delegate to feature services. Services own SQLAlchemy queries and explicit write transactions; the order domain contains database-independent stock and transition rules. Outbound email, queue, object storage, and VietQR formatting live behind small integration boundaries; ARQ jobs adapt worker calls to services. Core owns typed settings, database sessions, authentication, common errors, and shared pagination. Dependencies flow from transport and jobs toward services/domain, and from services toward integrations—not from services into routers. A new feature starts as a `features/<name>/router.py`, `schemas.py`, and `service.py` slice. Add `domain.py` for meaningful policy that can be tested independently, and `repository.py` only for repeated or complex queries needing independent tests. Promote shared behavior into `core/` or `integrations/` after at least two real consumers need it. There is no generic repository, unit-of-work framework, event bus, or CQRS layer.

The API uses synchronous SQLAlchemy/PyMySQL and a synchronous MinIO client. Some FastAPI and ARQ entry points are `async`, but backend I/O is **not fully asynchronous**. Database writes commit in service use cases; email enqueue after a commit is best effort and can fail without undoing the write. MinIO upload uses best-effort object deletion if the database write fails; object storage and SQL are not one atomic transaction.

```text
backend/
  .env.example             settings example (never commit real secrets)
  alembic/                 initial, order-fulfillment, refresh-version migrations
  app/
    core/                   config, database, errors, schemas, security, rate limiter
    features/
      categories/           model, router, schemas, service
      dashboard/            router, schemas, service
      orders/               constants, domain, model, router, schemas, service
      products/             images, model, reviews, router, schemas, service
      users/                model, router, schemas, service
    integrations/           email, queue, storage, vietqr
    jobs/                   email composition and order-expiration delegation
    templates/emails/       HTML notification templates
    main.py                 create_app(), routes, handlers, MinIO startup
    seed.py                 demo-data seeder
    worker.py               ARQ task and cron entry points
  tests/                    unit/contract and gated external integration tests
frontend/                   Next.js storefront/admin client using the versioned API
```

## API contract

All application operations are under `/api/v1`; `/` is an unversioned message, and `/docs`, `/redoc`, and `/openapi.json` are framework documentation routes. Groups: `/api/v1/users`, `/api/v1/categories`, `/api/v1/products`, `/api/v1/orders`, and `/api/v1/dashboard`. Swagger UI is at `http://localhost:8000/docs` after the server starts. User, category, product, and admin-order lists use `{ "items": [...], "total": 0, "limit": 20, "offset": 0 }` (order default limit: 10). User, product, and category updates use `PATCH`; deletes return empty `204` responses.

Application errors use `{ "code": "...", "message": "...", "details": null }`; the shared shape is advertised for 400, 401, 403, 404, 409, and 500 responses. Framework validation errors such as 422 retain FastAPI's validation shape. Main operations:

- Public customer registration: `POST /api/v1/users/register`. Its request cannot select a role. The admin-only users API also creates customers; the local demo seed provisions a demo account for development. Administrative accounts are created securely via CLI: `python -m app.cli create-admin --email <email> --username <username>`, prompting interactively for password and confirmation via `getpass`. There is no API role-promotion path.
- Login: `POST /api/v1/users/login` accepts JSON (`identifier`, `password`); refresh: `POST /api/v1/users/refresh`; logout: `POST /api/v1/users/logout`. Protected routes use an HTTP bearer access token in OpenAPI. Login and refresh return a token pair and set an HttpOnly refresh cookie. Refresh also accepts a token in the request body. Logout clears the cookie; it does not revoke an issued access token. New passwords are limited to 72 UTF-8 bytes for bcrypt.
- Cart checkout: `POST /api/v1/orders/checkout-cart`; owner/admin order read: `GET /api/v1/orders/{id}`; paginated customer history: `GET /api/v1/orders/user/{user_id}`; public unauthenticated tracking: `GET /api/v1/orders/track/{public_code}` strictly queries the order's unguessable public code (internal numeric IDs return 404). Admin status transitions: `PUT /api/v1/orders/{id}/status` supporting post-dispatch delivery states (`shipped`, `delivered`). Customer cancellation: `POST /api/v1/orders/{id}/cancel` follows `CUSTOMER_CANCELLABLE` in `backend/app/features/orders/domain.py`: customers may cancel VietQR `pending` and COD `confirmed` orders before dispatch, with automatic reservation release. Admin cancellation follows the domain transition table. A cart must use one currency; VietQR accepts VND only and uses one rounded VND amount in both the QR URL and response. COD accepts a homogeneous currency without conversion. VietQR checkout reserves stock in `pending` state until payment confirmation via `POST /api/v1/orders/vietqr-webhook` (authenticated via timing-safe `X-Webhook-Secret` header verification) or expiration; COD starts `confirmed`.
- Public catalog/category reads; admin catalog/category writes and product image upload; authenticated product reviews. Admin-only dashboard metrics, recent-order summaries, and low-stock summaries.

Refresh rotation uses the durable `users.refresh_version` integer. Each successful refresh consumes the previous version for that user, so a second concurrent use conflicts. This is **per-user** rotation: refreshing in one browser invalidates that user's older refresh tokens in other browsers. Existing refresh tokens lacking the new version claim and legacy email-subject access/refresh tokens are invalid; users must log in again after rollout. Deploy the Alembic migration **before** deploying code that reads `refresh_version`.

## Local prerequisites and configuration

- Python 3.11+ and a virtual environment; install `backend/requirements.txt` plus `backend/requirements-dev.txt` for checks.
- For a running server: MariaDB, Redis, and MinIO (the root Compose file provides local instances). Startup ensures a MinIO bucket/policy, so MinIO must be reachable. Redis is needed for background notification enqueue and the ARQ worker. SMTP is optional for local console logging, but real delivery needs valid SMTP settings.
- `SECRET_KEY` is required and must be private/nonempty. `DATABASE_URL` defaults to `sqlite:///./app.db` only for local experimentation; use MariaDB for deployed operation and concurrency validation. `REDIS_URL` defaults to `memory://`, an unavailable-queue sentinel, not an in-memory ARQ worker. Defaults are not production configuration.

Copy `backend/.env.example` to `backend/.env` and set at least `SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, MinIO credentials/endpoint, `CORS_ORIGINS`, and VietQR bank fields for your environment. The settings model also supports `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`, `REFRESH_COOKIE_SECURE`, `REFRESH_COOKIE_SAMESITE`, `FORWARDED_ALLOW_IPS`, `MINIO_BUCKET`, `MINIO_SECURE`, `MINIO_EXTERNAL_URL`, `EMAILS_ENABLED`, `EMAILS_CONSOLE_LOG`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAILS_FROM_EMAIL`, and `EMAILS_FROM_NAME`. Environment variables override `.env`; `CORS_ORIGINS` is comma-separated. When running behind a reverse proxy, set `FORWARDED_ALLOW_IPS` (comma-separated IPs/CIDRs or `*`) to enable trusted proxy resolution and pass `--proxy-headers --forwarded-allow-ips`; otherwise, `X-Forwarded-For` is ignored to prevent client IP spoofing in rate limiters. Refresh cookies are `Secure` by default; set `REFRESH_COOKIE_SECURE=False` only for plain-HTTP local development. Example credentials and seeded passwords are for disposable local development only.

From the repository root, start local dependencies if Docker is available:

```powershell
docker compose up -d mariadb redis minio
```

The example MariaDB endpoint is `localhost:3307`, Redis `localhost:6379` (use `127.0.0.1` for IPv4-only Docker bindings on Windows), MinIO API `localhost:9000`, and MinIO console `localhost:9001`. Do not apply the demo seed to a real database. The `arq_worker` Compose service reads `SECRET_KEY` from the environment of the `docker compose` process, not from `backend/.env`; set it before starting that service. An unset or empty value prevents worker startup. No production secret is checked in.

From `backend/` (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
Copy-Item .env.example .env   # then edit .env for local services
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\alembic.exe current
.\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

Do not reverse the migration/deploy order. `alembic current` should report `d4e5f6a7b8c9 (head)` for this revision. Importing the app alone does not verify service connectivity; serving requests runs the MinIO startup hook. To run notifications and minute-by-minute pending-order expiration, open another configured `backend/` terminal:

```powershell
.\.venv\Scripts\arq.exe app.worker.WorkerSettings
```

For Windows development, prefer the Compose worker service with its required environment configured. The live verification exercised an ARQ burst worker and expiration entry point; standard ARQ shutdown depends on Unix signals and was not certified on native Windows.

The seed script has **no `--help` or dry-run mode**; `python -m app.seed` immediately creates tables if needed and writes demo accounts, catalog, and historical orders to the configured database. Run it only after verifying `DATABASE_URL` points to an isolated local/demo database. Production demo seeding is refused even with `--force`; use `python -m app.cli create-admin`. Development accounts use generated passwords printed only at creation, or explicit `SEED_ADMIN_PASSWORD` / `SEED_CUSTOMER_PASSWORD`. Repeated runs preserve existing credentials. Public `/register` creates customers, not admins.

## Frontend and session behavior

`frontend/` is a Next.js 16 / React 19 client with Axios, SWR, Tailwind and Vitest. `NEXT_PUBLIC_API_BASE_URL` accepts an API origin such as `http://localhost:8000`, or a base already ending in `/api/v1`; the client adds the version prefix exactly once. Configure the backend CORS origin to match the frontend host/port. Both frontend and backend hosts must share the same site (e.g. `localhost` on both, rather than mixing `127.0.0.1` and `localhost`) for the browser to send `SameSite=Lax` refresh cookies. Local HTTP development also requires `REFRESH_COOKIE_SECURE=False`.

From `frontend/`:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

Login sends `{identifier,password}` and accepts an email or username. The client keeps access tokens in memory and refreshes through an HttpOnly cookie. Web Locks coordinate cookie mutations across supported same-origin tabs, with BroadcastChannel sharing token renewal. Tokens are never persisted in browser storage. Each device has its own database session and absolute refresh expiry. Legacy refresh cookies require login again after the session migration. Logout clears local credentials/private cache and calls the backend cookie-clearing endpoint; server-clear failures are visible. By architectural design, logout does not maintain a server-side denylist for stateless access tokens; issued access tokens remain valid until their natural short-lived expiration. Password changes use PATCH, invalidate refresh tokens on the backend, and return the client to login. Backend access tokens retain their existing expiration semantics.

Products, categories, customers and admin orders consume `{items,total,limit,offset}` pages. Category selectors load all pages. Profile/product/category edits use PATCH; order status retains PUT. Product images use `{id,url}`. Upload retry after a saved product does not create the product again. Dashboard charts describe the recent-order sample and do not invent weekly revenue or growth comparisons.

Checkout uses backend totals and stock as the authority. The client blocks overlapping submissions from the same checkout action; this is not backend idempotency against retries after a lost network response. COD and the existing manual VietQR instructions remain supported under the existing currency rules. Opening or closing a QR modal is not payment confirmation; an admin must verify the transfer. A multi-item checkout retains a link to every returned order. Currency policy and VTON integration are deferred.

## Checks

From `backend/` with a local `SECRET_KEY` (or configured `.env`):

```powershell
.\.venv\Scripts\python.exe -c "from app.main import app; from app.worker import WorkerSettings; print('imports OK')"
.\.venv\Scripts\ruff.exe format --check app tests
.\.venv\Scripts\ruff.exe check app tests
.\.venv\Scripts\python.exe -m compileall -q app tests
.\.venv\Scripts\python.exe -m pytest -q -W error::sqlalchemy.exc.SAWarning -p no:cacheprovider --basetemp=../.superpowers/pytest-temp
```

MariaDB integration tests skip unless `TEST_DATABASE_URL` is set. Use a dedicated empty, disposable MariaDB database; never point them at production or shared data. Before running the suite, set `DATABASE_URL` to that test database and run `alembic upgrade head`; then set `TEST_DATABASE_URL` to the same migrated database. The fulfillment-migration test creates and drops a separate `migration_<random>` database on that server, so the test account also needs `CREATE` and `DROP` database privileges. Confirm the server and account are isolated before granting them. The checkout, PATCH/checkout, transition, uniqueness, and fulfillment cases are in `tests/integration/`. SQLite unit tests and mocked adapters alone do not establish live MariaDB locking, Redis, MinIO, or SMTP behavior. Each live run must record its isolated infrastructure and results separately. From `frontend/`, run `pnpm test`, `pnpm exec eslint . --max-warnings=0`, `pnpm exec tsc --noEmit` and `pnpm build`. The [BE–FE repair review](docs/reviews/2026-10-12-be-fe-flow-repair-review.md) records the available frontend and live-service evidence. SMTP and an interactive browser flow are not claimed as verified.

## License

Proprietary project; no public license is granted by this repository.
# Compose configuration notes

Copy `.env.example` to `.env` and set distinct database app/root, Redis,
MinIO and application secrets. Infrastructure ports bind to loopback. Production
deployments must remove their published ports, use HTTPS public origins, and set
`REFRESH_COOKIE_SECURE=true`; local HTTP development explicitly uses `false`.

`MARIADB_USER` is a dedicated schema user, never `root`. Existing MariaDB volumes
do not create a new user when environment settings change: use an administrative
connection to create the chosen user and grant privileges only on the application's
database before restarting app services. Keep the existing volume and database.
Do not run `docker compose down -v` against an installation containing real data.

Passwords supplied to MariaDB/Redis are raw. If passwords contain URL delimiters
(`@`, `:`, `/`, `%`), override `DATABASE_URL`/`REDIS_URL` in `.env` using
percent-encoded password components and internal service hosts `mariadb`/`redis`.
Quote values containing `$` in the env file with single quotes. Keep raw service
passwords and encoded URL passwords consistent. Never paste secrets into logs.

Host ports can be changed with `MARIADB_PORT`, `REDIS_PORT`, `MINIO_PORT`,
`MINIO_CONSOLE_PORT`, `API_PORT`, and `FRONTEND_PORT`. Update public URLs and CORS
when changing ports. Use unique Compose project names for disposable test stacks.


## Remediation verification and image delivery

Run `python .github/scripts/compose_smoke.py` from the root for a disposable stack. Set `SMOKE_BROWSER_TESTS=1` after installing frontend dev dependencies and Chromium (`pnpm exec playwright install chromium`) to include browser acceptance. Use the backend virtualenv interpreter with `python .github/scripts/run_integration.py` for a separate disposable MariaDB server and all integration tests. Both runners preserve existing installations and remove only their own project resources.

Product image URLs from the configured public storage host become same-origin `/storage/<bucket>/<object>` paths in the frontend. Next forwards only its configured bucket to `MINIO_INTERNAL_URL`; Docker uses `http://minio:9000`. Rebuild the frontend when the public image/API origin, internal storage origin, or bucket changes. This does not enable arbitrary private-IP fetching. Original public object URLs remain available to direct clients.

Authentication coordination stores only a random nonce in browser storage for fencing delayed login/logout messages; it contains no token or user/session identity. Tokens remain in memory. Browsers without Web Locks/BroadcastChannel or usable coordination storage support single-tab login/refresh but cannot guarantee cross-tab serialization. Logout revokes its current device refresh session; password changes revoke all device refresh sessions. Existing short-lived access tokens retain their normal expiry.

## Reproducible backend dependencies

Docker and Linux CI use hashed Python 3.12 locks. From `backend/`, install with `python -m pip install --require-hashes -r requirements-dev-lock.txt`. Native Windows development uses `requirements-dev-windows-lock.txt`, generated and checked on Python 3.13, with the same hash-verification flag. Runtime-only equivalents are `requirements-lock.txt` and `requirements-windows-lock.txt`. Run `python -m pip check` after installing.

Edit the `.in` files and regenerate with pip-tools 7.6.2 under the target platform/runtime. Linux runtime: `python -m piptools compile --generate-hashes --output-file requirements-lock.txt requirements.in`. Linux dev: use `--allow-unsafe` and `requirements-dev.in` with output `requirements-dev-lock.txt`. Windows runtime uses `requirements.in` with output `requirements-windows-lock.txt`; Windows dev uses `--allow-unsafe`, `requirements-dev-windows.in`, and output `requirements-dev-windows-lock.txt`. Keep bcrypt 4.0.1 until a separately verified upgrade.
