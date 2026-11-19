# TrueLook Backend

FastAPI serves the API for the storefront and the admin dashboard. MariaDB stores products, variants, inventory, orders, and login sessions. MinIO stores images; Redis and ARQ run background jobs.

[Main README](../README.md) · [Local environment](../docs/LOCAL_ENVIRONMENT.md) · [Virtual try-on](../docs/VTON.md)

## Run with Docker

From the repository root, prepare `.env` as described in the [quickstart](../README.md#quickstart), then run:

```powershell
docker compose up --build -d --wait api arq_worker vton_worker
docker compose exec api alembic current
docker compose exec api python -m app.cli create-admin --email admin@your-domain.test --username shopadmin
```

Compose starts the dependencies and runs migrations. The admin command prompts for a password. Open [Swagger UI](http://localhost:8000/docs) to try the API, or the [health endpoint](http://localhost:8000/api/v1/health) to check MariaDB and Redis. Check MinIO and the workers separately with `docker compose ps` and the logs.

## Run the API with hot reload

From the repository root, stop the Docker API if it holds port 8000, start the infrastructure, then switch to the backend:

```powershell
docker compose stop api
docker compose up -d --wait mariadb redis minio
Set-Location backend
py -3.13 -m venv .venv
.venv/Scripts/python.exe -m pip install --require-hashes -r requirements-dev-windows-lock.txt
if (-not (Test-Path .env)) { Copy-Item ../.env.example .env }
```

On Linux, use Python 3.12, `requirements-dev-lock.txt`, and `.venv/bin/python`. The application reads `.env` from the working directory; process environment variables take precedence.

In `backend/.env`, set `DATABASE_URL` to MariaDB at `localhost:3307`, `REDIS_URL` to Redis at `localhost:6381`, and `MINIO_ENDPOINT=localhost:9000`. `DATABASE_URL` is not in `.env.example`; without it the application falls back to a local SQLite file. Use the same credentials as Compose and URL-encode special characters in connection strings. Keep the VietQR, VTON, and MinIO settings in sync between the API and the workers if you run them together.

```powershell
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

The native API only serves HTTP. To process email, VietQR order expiration, and try-on, run `docker compose up -d --wait arq_worker vton_worker` from the repository root. The workers read their configuration from the root `.env`; `REDIS_URL=memory://` is for tests or for running without a Redis queue.

## Find the code

| Path | Responsibility |
| --- | --- |
| [app/main.py](app/main.py) | Application setup, middleware, and router registration |
| [app/features/](app/features/) | Routers, schemas, and business logic by feature |
| [app/core/](app/core/) | Settings, database connection, authentication, and error handling |
| [app/integrations/](app/integrations/) | MinIO, Redis, SMTP, VietQR, and CatVTON clients |
| [app/worker.py](app/worker.py) · [app/vton_worker.py](app/vton_worker.py) | Order and email queue, and the dedicated try-on queue |
| [alembic/versions/](alembic/versions/) | Migration history |

When changing checkout, keep the `variant_id` contract, the server-side price and stock recalculation, and the order-item snapshots taken at order time. Read the [payment setup](../docs/PAYMENT_SETUP.md) before changing the VietQR flow.

## Tests

From `backend/`, use a dedicated test shell so the variables below do not affect a running API:

```powershell
$env:REDIS_URL = 'memory://'
$env:EMAILS_ENABLED = 'false'
.venv/Scripts/python.exe -m pytest tests --ignore=tests/integration -q
.venv/Scripts/python.exe -m ruff check app tests
.venv/Scripts/python.exe -m ruff format --check app tests
```

Unit tests use SQLite; keep `test.db` dedicated to the test suite. To check migrations and concurrent operations on MariaDB, run `backend/.venv/Scripts/python.exe .github/scripts/run_integration.py` from the repository root. The script needs Docker and creates its own disposable database. Do not point `TEST_DATABASE_URL` at the main database.
