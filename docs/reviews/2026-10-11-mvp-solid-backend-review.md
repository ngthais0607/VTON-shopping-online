# MVP backend refactor: pre-integration review (2026-10-12)

Scope reviewed: `c440e05` through `27c4315`, plus the two uncommitted Task 10 architecture/OpenAPI test corrections and this Task 11 documentation. This is the Task 11 pre-integration review, **not final approval or a merge decision**. A later final-fix wave addressed several findings below; the controller still owns scoped re-review and merge. The Task 10 test edits belong to that task and were not staged or committed during Task 11.

## Result and severity-ranked concerns

| Severity | Finding / required action | Evidence |
| --- | --- | --- |
| High (deployment) | The checked-in `arq_worker` Compose service supplies `DATABASE_URL` and `REDIS_URL` but not required `SECRET_KEY`. A clean image has no configured `.env`; `WorkerSettings` imports settings during module loading. Supply the secret to this service (and verify the deployment configuration) before advertising `docker compose up -d arq_worker` as working. | `docker-compose.yml` (`arq_worker.environment`), `backend/Dockerfile`, `backend/app/core/config.py`, `backend/app/worker.py` |
| High (integration readiness) | The current frontend has not been migrated to `/api/v1`, `PATCH /users/me`, and changed response shapes. It cannot be treated as a verified client for this backend. Keep frontend release separate until migrated and tested. | `frontend/lib/api.ts`, `frontend/app/store/checkout/page.tsx`, `frontend/app/store/account/page.tsx`, backend routers |
| Medium (external confidence) | MariaDB checkout/transition/uniqueness/fulfillment integration cases, plus live Redis, MinIO, and SMTP behavior, have not been run against services in this Task 11 environment. Run them on isolated disposable infrastructure before production deployment. | No `TEST_DATABASE_URL`; 9 pytest skips; mocked adapter tests only |
| Low (lifecycle) | The cached `ArqTaskQueue` opens a Redis pool on first enqueue but has no explicit shutdown hook. Triage pool closure in the final review; no behavior change was made in docs scope. | `backend/app/integrations/queue.py`, `backend/app/main.py` |

No Critical issue was established by this documentation pass. The High entries above are release gates, not claims that the backend unit suite failed. They were not changed because Task 11 scope is README/review documentation; the controller owns final remediation/acceptance.

## Architecture and scope review

- `core/` holds typed immutable settings, DB lifecycle, token helpers, rate limiting, shared page/error contracts. Category, product, user, order, and dashboard routers delegate to their own services. Order domain rules are separate from persistence. Jobs wrap service calls; email, queue, storage, and VietQR adapters isolate external mechanics. This is useful separation for the MVP without generic repository/DI/CQRS/event-bus scaffolding.
- The architecture tests reject router-level SQLAlchemy `.query()`/`.commit()`, entity construction, manually built response dictionaries, direct vendor SDK imports, and core/integration imports of feature routers. After Task 10's test correction, registered routes (including OpenAPI-hidden routes) are checked for `/api/v1`, and absolute/relative `ImportFrom` aliases are covered. OpenAPI tests require the shared `ErrorResponse` reference on advertised statuses.
- Write services commit after their database state changes; order checkout and transitions lock products/orders in consistent order per Task 7's focused review. Queued notifications are best effort after commit; image upload uses best-effort compensation on DB failure. This is not an atomic SQL/object-store/queue transaction. The live InnoDB contention behavior still needs the external gate.
- Authorization is enforced at routers: public catalog reads and registration, owner/admin order reads, admin-only lifecycle/catalog/customer/dashboard writes. Public registration has no role field. The common application error body is `{code,message,details}`; framework 422 validation remains FastAPI-shaped. The API and README use the same `Page` fields and method names.
- Module sizes remain MVP-sized slices apart from the intentionally central order service and demo seeder. The seeder retains multiple commits and `create_all` behavior; it is not a migration substitute or safe dry-run tool. New settings, service, domain, and adapter names reflect their responsibilities; no speculative abstraction was added.

## Changed modules and compatibility breaks

The implementation range adds `core/config.py`, `core/errors.py`, and `core/schemas.py`; extracts category/product/user/order/dashboard services and typed schemas; separates product reviews/images and order domain rules; adds email/queue/storage/VietQR adapters and job modules; and updates app creation, worker, seed imports, tests, and dev tooling. The `8f4c2d1a7b90` Alembic revision adds non-null `users.refresh_version` with a zero backfill. Legacy feature `schema.py` modules, `core/email.py`, `core/queue.py`, `integrations/minio_client.py`, `integrations/paddle_client.py`, and `jobs/order_jobs.py` were deleted after consumer migration; Task 10 also removed `save_to_db` and the final `order_to_json` mapper.

Breaking changes requiring consumer migration:

- Every application route is now under `/api/v1` (root and FastAPI docs excepted). User/product/category edits use `PATCH`, not legacy `PUT`; deletes return empty `204`. Collection reads use paged objects rather than bare arrays where applicable.
- Product image upload now returns typed `{id,url}` without `object_name`. Dashboard recent-order/low-stock results are narrow summary DTOs. Order creation is the authenticated cart checkout route, with owner/admin tracking and admin-only transitions; no VietQR webhook exists.
- Application errors have `{code,message,details}` rather than legacy `detail` strings, except framework validation responses. Access and refresh JWT subjects are immutable numeric user IDs. Refresh JWTs include a durable integer version; old email-subject tokens and refresh tokens lacking `version` require login again.
- Refresh rotation is per **user**, not per device/session. A successful refresh makes another browser's older refresh token stale. This is the deliberate simpler replay-safe MVP tradeoff; account-level logout only clears the caller's cookie, and existing access tokens remain valid until expiry.

**Deployment order:** back up and migrate the database to `8f4c2d1a7b90` before deploying application/worker code that reads `users.refresh_version`. Do not run `seed.py` against an existing production database. Migrate the frontend separately against `/api/v1` and the new schemas before any end-to-end claim.

## Verification performed for Task 11

All commands below ran from `backend/` with a task-local `SECRET_KEY`; no real DB was seeded and no production service was contacted.

| Gate | Command / result |
| --- | --- |
| Server and worker module import | `python -c "from app.main import app; from app.worker import WorkerSettings; ..."` → `server_import=ok`, `worker_import=ok`, 3 worker functions, 39 registered routes. Import does not execute the MinIO lifespan. |
| Ruff formatting | `ruff format --check app tests` → 71 files already formatted. |
| Ruff lint | `ruff check app tests` → All checks passed. |
| Syntax compilation | `python -m compileall -q app tests` → exit 0. |
| Backend suite | `python -m pytest -q -W error::sqlalchemy.exc.SAWarning -p no:cacheprovider --basetemp .pytest-tmp/task11-full` → **189 passed, 9 skipped, 1 warning** in 41.45 seconds. The warning is a third-party Starlette/httpx deprecation; no SQLAlchemy SAWarning was emitted. |
| Empty DB migration | With `DATABASE_URL=sqlite:///./task11-empty-check-20261012.db`: `alembic upgrade head`, `alembic current` → `8f4c2d1a7b90 (head)`; a read-only SQLite check confirmed `refresh_version` exists. This proves the fresh SQLite path only, not MariaDB migration. |
| Seed safety | Inspected `app/seed.py`: no CLI parser, help, or dry-run; `python -m app.seed` immediately writes data. Deliberately **not run**. |
| Diff whitespace | `git diff --check` → exit 0 at documentation draft stage. Run again at final handoff. |

`TEST_DATABASE_URL` was absent. The external command, **not run against MariaDB**, is: `python -m pytest tests/integration/test_checkout_concurrency.py tests/integration/test_order_transition_concurrency.py tests/integration/test_user_uniqueness_concurrency.py tests/integration/test_order_fulfillment_migration.py -q -W error::sqlalchemy.exc.SAWarning -p no:cacheprovider`, after provisioning a dedicated empty test MariaDB database and setting `TEST_DATABASE_URL`. These nine skipped tests are not passes. No live Redis, MinIO, SMTP, server startup, or frontend run was claimed.

Cleanup limitation: the exact disposable `backend/task11-empty-check-20261012.db` (86,016 bytes) and `backend/.pytest-tmp/task11-full` were created for these gates. A sandbox policy denied `Remove-Item` even for those exact paths; they remain ignored/untracked and must be removed by the controller or an authorized environment after confirming the paths. No other database or cache was touched.

## Final-fix wave addendum (pending controller re-review)

- Compose now passes `SECRET_KEY` from the caller's runtime environment to `arq_worker`; no secret is baked into the image. Worker startup against live Compose dependencies remains unverified.
- Product PATCH locks and refreshes its row before inventory merge. Order transitions and expiration retain the refreshed locked product instance instead of permitting an implicit non-locking reload. Checkout hides products in soft-deleted categories. A gated MariaDB test coordinates PATCH against checkout; it has not run without `TEST_DATABASE_URL`.
- Checkout and review request lengths now match their storage columns. Checkout rejects mixed currencies before mutation and requires VND for VietQR, using one rounded adapter result for QR URL and API amount; COD remains available for a homogeneous non-VND cart. Legacy success fixtures were updated to use VND where they exercise VietQR.
- New passwords are limited to 72 UTF-8 bytes; malformed login passwords return an authentication error. Refresh cookies default to `Secure` and can be explicitly disabled for local plain HTTP; logout uses matching flags. JSON login advertises HTTP bearer authentication rather than an unsupported OAuth form flow.
- ARQ pool construction is synchronized and lazy, app-owned, and closed on lifespan shutdown. Dependency construction does not connect to Redis before a database commit. README gives evidence-based `domain.py`/`repository.py` promotion rules and instructs migration of a disposable MariaDB test database before the suite, including the migration test's `CREATE`/`DROP` privileges.
- The local full backend run with SQLAlchemy `SAWarning` fatal was **227 passed, 10 skipped, 1 third-party Starlette/httpx warning**. The ten skipped cases require disposable MariaDB `TEST_DATABASE_URL`; live Redis, MinIO, and SMTP remain unverified. This addendum does not convert skips into passes or approve frontend compatibility.
- An exact-target retry to remove the Task 11 SQLite database and known pytest temporary paths was rejected by the command runner's policy. They remain ignored and untouched; no broad cleanup was attempted.
