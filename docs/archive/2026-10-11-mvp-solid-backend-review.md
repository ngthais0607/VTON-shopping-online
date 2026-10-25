# MVP backend refactor: merged review record (2026-10-12)

Scope: implementation from `c440e05` through `27c4315`, followed by the final-fix commit `e537297`. The Task 10 guard corrections and Task 11 documentation were included in `e537297`; a scoped independent re-review approved the final fix wave with no remaining Critical or Important findings. The user-authorized fast-forward to `main` completed at `e537297`. This record preserves the earlier Task 11 evidence while distinguishing resolved review findings from unverified external delivery. **A backend merge is not a storefront release or live-integration certification.**

## Review outcome and remaining limitations

| Status | Finding / decision | Evidence |
| --- | --- | --- |
| Resolved in `e537297` | Original High Compose worker gap: the service now passes caller-provided `SECRET_KEY` without baking it into the image. `docker compose config` verified the resolved environment; a live worker startup was not tested. | `docker-compose.yml`, final-fix report |
| Resolved in `e537297` | Original Low queue lifecycle gap: pool creation is synchronized/lazy, queue is app-owned, and lifespan closes an opened pool. | `backend/app/integrations/queue.py`, `backend/app/main.py` |
| Unverified integration | The checked-in frontend still calls old paths/methods/shapes and has not been migrated to `/api/v1`. Do not treat it as a working client or release the storefront on this backend without migration and end-to-end tests. | `frontend/lib/api.ts`, `frontend/app/store/account/page.tsx`, backend routers |
| Unverified external delivery | Ten MariaDB-gated cases, including PATCH/checkout contention, skipped without `TEST_DATABASE_URL`. Live Redis, MinIO, SMTP, and worker startup remain unverified. Use isolated infrastructure before production claims. | Post-merge pytest result; `backend/tests/integration/`; final-fix report |

The final whole-branch review found 2 High inventory findings, 7 Important issues, and 3 Minor issues. One final fix wave addressed all of them; its scoped independent re-review found no remaining Critical or Important issue. The two resolved rows above are not open backend code findings. The frontend and external-service limitations remain separate follow-up work.

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

## Recorded rulings and their costs

The execution ledger made these explicit scope decisions; they remain part of the merge rationale:

1. **Minimal refresh-version migration:** the existing timestamp could not guarantee durable refresh replay rejection, so Task 6 added a correctness-proven `users.refresh_version` migration under the schema-change exception. Cost: migrate before code deployment and require legacy sessions/tokens to log in again.
2. **Continue during Git metadata denial:** Task 10 review and Task 11 documentation proceeded from the intact working diff while worktree index writes were unavailable. Cost: those task changes remained uncommitted until permissions allowed their inclusion in `e537297`; scratch reports were preserved.
3. **No invented currency conversion:** reject mixed-currency carts, require VND for VietQR, and use the same rounded amount for instructions and API response. Cost: non-VND bank-transfer carts are rejected until an explicit payment/conversion policy exists; homogeneous non-VND COD remains supported.
4. **Preserve existing collection/session scope:** review and user-order collections retain their existing shapes, and refresh rotation remains per user rather than per device. Cost: pagination for those collections and independent per-device sessions remain follow-up work.
5. **Limit the backend verdict:** frontend migration and live external integrations were excluded from this backend milestone because the approved scope did not include the client and test services were unavailable. Cost: the merge is neither storefront release approval nor certification of live MariaDB/Redis/MinIO/SMTP behavior.

## Historical Task 11 verification (before final fix wave)

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
| Diff whitespace | `git diff --check` → exit 0 at documentation draft stage. |

`TEST_DATABASE_URL` was absent. The external command, **not run against MariaDB**, is: `python -m pytest tests/integration/test_checkout_concurrency.py tests/integration/test_order_transition_concurrency.py tests/integration/test_user_uniqueness_concurrency.py tests/integration/test_order_fulfillment_migration.py -q -W error::sqlalchemy.exc.SAWarning -p no:cacheprovider`, after provisioning a dedicated empty test MariaDB database and setting `TEST_DATABASE_URL`. These nine skipped tests are not passes. No live Redis, MinIO, SMTP, server startup, or frontend run was claimed.

Cleanup limitation: the exact disposable `backend/task11-empty-check-20261012.db` (86,016 bytes) and `backend/.pytest-tmp/task11-full` were created for these gates. Exact-target removal was denied by the command runner, including a later verified retry. These ignored artifacts were left untouched; no broad cleanup was attempted.

## Final-fix wave and scoped re-review

- Compose now passes `SECRET_KEY` from the caller's runtime environment to `arq_worker`; no secret is baked into the image. Worker startup against live Compose dependencies remains unverified.
- Product PATCH locks and refreshes its row before inventory merge. Order transitions and expiration retain the refreshed locked product instance instead of permitting an implicit non-locking reload. Checkout hides products in soft-deleted categories. A gated MariaDB test coordinates PATCH against checkout; it has not run without `TEST_DATABASE_URL`.
- Checkout and review request lengths now match their storage columns. Checkout rejects mixed currencies before mutation and requires VND for VietQR, using one rounded adapter result for QR URL and API amount; COD remains available for a homogeneous non-VND cart. Legacy success fixtures were updated to use VND where they exercise VietQR.
- New passwords are limited to 72 UTF-8 bytes; malformed login passwords return an authentication error. Refresh cookies default to `Secure` and can be explicitly disabled for local plain HTTP; logout uses matching flags. JSON login advertises HTTP bearer authentication rather than an unsupported OAuth form flow.
- ARQ pool construction is synchronized and lazy, app-owned, and closed on lifespan shutdown. Dependency construction does not connect to Redis before a database commit. README gives evidence-based `domain.py`/`repository.py` promotion rules and instructs migration of a disposable MariaDB test database before the suite, including the migration test's `CREATE`/`DROP` privileges.
- The final-fix worktree run with SQLAlchemy `SAWarning` fatal was **227 passed, 10 skipped, 1 third-party Starlette/httpx warning**. The ten skipped cases require disposable MariaDB `TEST_DATABASE_URL`; live Redis, MinIO, and SMTP remain unverified. The independent scoped re-review approved these fixes with no remaining Critical or Important finding. This does not convert skips into passes or approve frontend compatibility.
- An exact-target retry to remove the Task 11 SQLite database and known pytest temporary paths was rejected by the command runner's policy. They remain ignored and untouched; no broad cleanup was attempted.

## Post-merge verification on `main`

The controller fast-forwarded `main` to `e537297` with user authorization, then ran checks from the main checkout using its own `backend/.venv`. Its first full pytest attempt recorded **225 passed and 2 setup errors** because the chosen pytest basetemp parent directory did not exist; no code fix was made. After creating that parent directory, the complete rerun with SQLAlchemy `SAWarning` fatal reported **227 passed, 10 skipped, 1 third-party Starlette/httpx warning in 37.05 seconds**. This is the post-merge result; the earlier 189/9 and worktree 227/10 results above remain historical evidence, not additional post-merge runs.

Post-merge Ruff format check reported **73 files already formatted**; Ruff lint, Python compile, and `git diff --check` passed. The checkout was clean before this documentation-only bookkeeping update. No live MariaDB, Redis, MinIO, SMTP, or frontend compatibility check was added during the merge. The ten gated MariaDB cases, including the new PATCH/checkout race, still require `TEST_DATABASE_URL` and an isolated migrated database; the fulfillment migration test also requires privileges to create/drop its own randomly named test database.
