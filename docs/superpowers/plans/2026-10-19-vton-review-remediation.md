# VTON Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Resolve all 15 verified review findings, prove the application works, remove obsolete plans/specs, push a new GitHub branch, and delete eligible old branches without losing work.

**Architecture:** Preserve the existing feature modules and inventory/payment contracts. Consolidate Compose configuration, persist payment exceptions through the existing Payment model, and introduce device sessions with a separate migration and session service. Deliver dependent commits on one branch, followed by measured verification and evidence-based cleanup.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy/Alembic, MariaDB, Redis/ARQ, MinIO, Next.js/React/TypeScript, pnpm, pytest, Vitest, Docker Compose, GitHub Actions; pip-tools for hashed dependency locks and Playwright for browser verification.

**Spec:** `docs/superpowers/specs/2026-10-19-vton-review-remediation-design.md` (approved 2026-10-19).

**Status:** Approved Native execution; implementation, whole-branch review/fix pass, and all local acceptance gates completed on 2026-10-20. Publication and audited branch cleanup completed; see final remediation report and cleanup inventory.

## Global Constraints

- Branch: `codex/vton-review-remediation`; base: `fix/mvp-hardening` at `f7ac031`. Preserve the current checkout.
- Address items 1–15; introduce no VTON pipeline, deployment, session-management UI, or automatic refunds.
- Tokens stay in memory; never place access or refresh tokens in local/session storage.
- Only one concurrent refresh of a given version succeeds. Different session IDs refresh independently.
- A mismatched payment is not successful payment evidence or revenue.
- Access tokens retain the current bounded expiry behavior and are not promised immediate revocation by this change.
- Legacy refresh JWTs without `sid` are rejected after rollout; users log in again.
- Login limits: 5 attempts/minute per normalized identifier and 60 attempts/minute per trusted client IP.
- Target the Docker/CI Python 3.12 runtime; preserve `bcrypt==4.0.1` unless validation requires an explicitly documented change.
- Do not reset user volumes. Keep disposable administrative test connections distinct from application credentials.
- Keep `main`, `local-history`, current branch, `be-fe-flow-repair`, and `fix/mvp-hardening`, plus branches with unique commits or active review work.
- Preserve both pre-existing untracked user documents. Never stage `docs/reviews/PROMPT_fix_all_except_vton.md` implicitly.
- Track only the new active spec/plan within ignored directories; do not force-add the entire ignored tree.
- No force push, history rewrite, implicit merge to main, or incidental removal of worktrees.

## Review Focus

1. Existing MariaDB volumes do not create new users from changed environment variables: Task 1 must document explicit provisioning and test a fresh restricted connection.
2. Broadcast messages and HTTP responses can arrive after logout/account switch: Task 8 must reject obsolete generations and prevent cookie/session restoration where locking is supported.
3. A bank retry can reuse a transaction ID with changed memo or amount: Task 5 must preserve original evidence and reject association with a different order.
4. Credential characters such as `$`, `@`, `:`, `/`, and spaces can break shells or URLs: Tasks 1–2 must distinguish raw service passwords from encoded URL credentials and avoid command substitution.
5. Branches can advance after an earlier ancestry check: Task 15 must fetch immediately before cleanup, recheck published ancestry, and condition remote deletion on the verified tip.

## File boundaries and execution conventions

Compose owns the service graph; `health/router.py` owns HTTP readiness; `orders/service.py` keeps existing order locking; new `users/session_model.py` and `users/sessions.py` own session persistence and lifecycle; `core/security.py` owns token claims. Frontend `session.ts` owns memory/channel state, new `session-lock.ts` owns Web Locks, and `api.ts` owns network orchestration. New `core/search.py` owns literal SQL substring patterns.

New operational artifacts: `.github/scripts/compose_smoke.py`, `docs/reviews/2026-10-19-vton-review-remediation-report.md`, and `docs/reviews/2026-10-19-vton-cleanup-inventory.md`. Keep operational decisions in README/migration notes rather than deleting them with old plans.

Commands below assume `backend` or `frontend` as stated. `python` means the backend virtualenv interpreter (`.venv\Scripts\python.exe` on Windows, `.venv/bin/python` on Linux). Use `python -m pytest` and `python -m ruff` from that environment. Check required tooling before installation; use bundled runtime paths if needed. Backend tests create/drop `test.db` in their working directory: use the isolated execution checkout chosen under the worktree skill, never an existing application database.

At execution start, use `superpowers:using-git-worktrees` to inspect existing attachments and isolation requirements; preserve this approved branch and documentation commits if moving execution into a managed worktree. Record the actual execution path in the report. Run meaningful regression tests before each behavior change. For docs-only cleanup use link/content checks instead of artificial tests. Every task ends in an explicit-path commit; never `git add .`.

## Task 1: Make Compose startup and health truthful (items 1, 2, 4)

**Files:** Modify `docker-compose.yml`, `.env.example`, `backend/Dockerfile`, `backend/app/features/health/router.py`, `README.md`, `docs/MIGRATION_NOTES.md`. Test `backend/tests/test_health_and_ops.py`; create `backend/tests/test_compose_contract.py`.

**Interfaces:** Keep `health_check` on `/api/v1/health` and `HealthResponse` fields. Compose produces complete settings for `migrate`, `api`, and `arq_worker`, restricted app DB credentials, and authenticated Redis connections.

- [x] Add `test_database_failure_is_503_without_exception_details` (`status_code == 503`, database label `unhealthy`, injected secret absent from JSON), `test_redis_failure_is_200_degraded` (`200`, Redis label `degraded`), and log assertions. Run these via `python -m pytest tests/test_health_and_ops.py -q`; observe the current incorrect response behavior.
- [x] Add subprocess Compose contract tests using a temporary env file, an explicit project directory, and `docker compose config --format json`. Assert every backend service has required values, URLs identify app user/authenticated Redis, infrastructure bindings use `127.0.0.1`, the health URL is correct, and missing required values fail. Skip only with an explicit Docker CLI unavailability reason.
- [x] Implement shared env mapping preserving every supported storage/email/cookie setting; require recipient, secrets, and DB/Redis passwords. Use explicit encoded connection URL overrides when raw credentials contain reserved URL characters; document raw versus encoded values. Pass Redis password as an argv element, not interpolated shell code; healthcheck reads its password from environment without exposing it in logs.
- [x] Remove backend image HTTP healthcheck, use Compose's API probe, set HTTP 503 on database failure, and log exceptions without including their text in public labels. Keep Redis degraded fallback. Remove fixed `container_name` values so isolated Compose projects can coexist. Make host ports configurable with existing defaults for API/frontend/infrastructure.
- [x] Document new-volume initialization and explicit app-user provisioning on existing volumes without resetting data; document production port removal/HTTPS and local cookie configuration. Rerun both test files; expect pass. Validate authenticated Redis with a raw password containing spaces/`$` and database URLs with encoded delimiters in Task 2's disposable stack.
- [x] Commit task-owned paths: `fix(ops): make compose configuration and readiness reliable`.

## Task 2: Fix public images and add isolated Compose smoke (items 3, 9)

**Files:** Modify `docker-compose.yml`, `frontend/Dockerfile`, `frontend/next.config.mjs` only if needed, `.github/workflows/ci.yml`, `.env.example`; create `.github/scripts/compose_smoke.py`. Extend `backend/tests/test_compose_contract.py`.

**Interfaces:** `MINIO_EXTERNAL_URL` is browser reachable; `NEXT_PUBLIC_IMAGE_HOST` is set before build. Smoke script runs as `python .github/scripts/compose_smoke.py` from the root, owns one unique project, and exits nonzero on failure.

- [x] Add Compose contract assertions: image hostname matches public URL; frontend build args contain `NEXT_PUBLIC_IMAGE_HOST`; worker/migration inherit no HTTP healthcheck. Run the focused test; expect missing build configuration to fail.
- [x] Pass both public origins at build time and all required backend env settings; preserve bucket/TLS options. Verify the chosen image origin is reachable from both browser and frontend container: container `localhost` is not the host's MinIO. Test the Next.js optimizer's local-IP policy rather than assuming an allowlisted hostname is sufficient. If the approved Compose/public-origin design cannot satisfy this, revise that part of the spec before adding a new proxy or broadening network access. Smoke script creates a temporary env file with random synthetic secrets, email disabled and fake bank values; invokes Compose with an explicit env file/project; never prints resolved secrets.
- [x] Script checks port availability, chooses documented dedicated local ports via Compose variables, builds and starts with bounded waits, verifies migration exit 0, API 200, frontend HTTP success, restricted `CURRENT_USER()`, Redis unauthenticated rejection/authenticated success, and a live worker process. It must fail on an image that exits immediately. Use argv lists for every subprocess call.
- [x] On failure collect redacted logs. In `finally`, remove only that project's containers/networks/volumes with the same explicit env/project arguments; retain user resources. Run locally with a generated Redis password containing spaces/`$` and URL-encoded database credentials. Do not report a missing Docker daemon as passing.
- [x] Add CI smoke job with a bounded job timeout and script invocation. Add backend `python -m ruff format --check app tests` and frontend `pnpm exec eslint . --max-warnings=0`; preserve build/tests/migrations. Run contract tests and smoke; expect all services ready and project resources cleaned.
- [x] Commit: `ci: verify compose startup and public image configuration`.

## Task 3: Remove embedded real bank values (item 8)

**Files:** Modify `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml`, `backend/tests/conftest.py`, and exact fixture/document paths returned by `rg -l '0382912048'` excluding the source review. Preserve the user-provided review text.

**Interfaces:** Examples and fixtures use `0000000000`; runtime requires explicit recipient configuration.

- [x] Inventory exact matches, replace application-owned example/fixture values, and retain recipient-validation tests with matching synthetic configuration. Do not rewrite Git history or user review documents.
- [x] Run `python -m pytest tests/test_webhook_account.py tests/test_vietqr_adapter.py -q` from backend. Scan runtime/config/test files; expect no old account value. Commit explicit changed files: `chore: use synthetic bank details in examples and fixtures`.

## Task 4: Make demo seeding safe (item 5)

**Files:** Modify `backend/app/seed.py`, `backend/app/core/config.py`, `.env.example`, `backend/tests/test_seed_safety.py`, `backend/tests/test_seed_fashion.py`, `README.md`.

**Interfaces:** Preserve `seed_database(db=None, force: bool = False)`; add optional `seed_admin_password`/`seed_customer_password` settings. Production always refuses demo seed and names `python -m app.cli create-admin` as the alternative.

- [x] Replace the current test approving forced production seeding. Test settings loaded from a temporary `.env` with no `APP_ENV` in `os.environ`; both `force` values must raise before database mutation. Add configured/generated password cases, output-once assertions, and repeated-seed password-hash preservation. Run seed test files; verify failures against current behavior.
- [x] Implement settings-based guard and cryptographically random passwords when absent. Print generated credentials only for newly created accounts; remove both fixed passwords. Retain fashion cleanup and inventory invariants.
- [x] Rerun seed tests plus `tests/test_admin_cli.py`; expect pass. Commit: `fix(seed): refuse production demos and remove fixed passwords`.

## Task 5: Persist mismatched payments idempotently (item 6)

**Files:** Modify `backend/app/features/orders/schemas.py`, `backend/app/features/orders/service.py`, `backend/tests/test_vietqr_webhook.py`, `backend/tests/test_payment_recording.py`, `backend/tests/test_openapi_contract.py`, `backend/tests/integration/test_vietqr_webhook_concurrency.py`; update API wording in `backend/app/features/orders/router.py`.

**Interfaces:** `VietQRWebhookPayload.amount: Decimal`, finite positive with `max_digits=12`, `decimal_places=2`; retain `VietQRWebhookResponse`. `list_late_payments` keeps pagination/fields and includes `late_payment`, `duplicate_payment`, `amount_mismatch`.

- [x] Add `test_mismatch_is_durable_before_200`: response status `amount_mismatch`, one row with actual amount, order/inventory unchanged, no revenue. Add retry/same-ID changed amount tests asserting original evidence remains one row, different-order reuse rejection, later correct new transaction success, invalid auth/recipient/multi-order rejection, and DB commit failure not acknowledged. Reject NaN/infinity/overflow/excess precision with 422; preserve existing HALF_UP VND comparison expectations. Run webhook/payment/VND tests and observe new failures.
- [x] Implement mismatch branch after idempotency checks under current locks. Commit the exception payment through the same uniqueness-conflict handling contract as normal payments. Do not change status/revenue selectors to treat exception payments as paid; avoid float conversion before compare/persist. Update admin filter and schema contract tests.
- [x] Run `python -m pytest tests/test_vietqr_webhook.py tests/test_payment_recording.py tests/test_vnd_rounding.py tests/test_webhook_account.py tests/test_openapi_contract.py -q`; expect pass. Extend MariaDB race test to submit the same mismatch twice and assert exactly one durable record and unchanged inventory; run against disposable DB under Task 14.
- [x] Commit: `fix(payments): persist amount mismatches for reconciliation`.

## Task 6: Introduce session persistence and migration (item 7 foundation)

**Files:** Create `backend/app/features/users/session_model.py`, `backend/alembic/versions/f8a1b2c3d4e5_add_user_sessions.py`, `backend/tests/test_user_sessions_migration.py`; modify `backend/alembic/env.py`, `backend/tests/conftest.py`, and the actual model-registration point in `backend/app/main.py` if required.

**Interfaces:** Export `UserSession` with `id: String(32)` UUID hex PK, `user_id` indexed FK, `refresh_version` BigInteger default 0, UTC `expires_at`, nullable `revoked_at`, and `created_at`. Migration revision `f8a1b2c3d4e5` follows verified current head `e6f7a8b9c0d1` (recheck before writing).

- [x] Add migration tests using temporary databases and existing subprocess conventions: upgrade from old head preserves users and `users.refresh_version`, creates no inferred sessions, verifies table/index/FK definitions, downgrade drops only sessions, re-upgrade succeeds. Run the new file; expect missing revision/model failures.
- [x] Implement model/registration and migration; use current UTC serialization/database conventions. Verify exactly one Alembic head. Register model before `Base.metadata.create_all` in tests.
- [x] Run `python -m pytest tests/test_user_sessions_migration.py tests/test_user_refresh_migration.py -q` and `python -m alembic heads`; expect tests pass and one head. Add MariaDB roundtrip coverage using existing disposable migration-test conventions; run in Task 14. Commit: `feat(auth): add persistent device session schema`.

## Task 7: Rotate and revoke sessions independently (item 7 backend)

**Files:** Create `backend/app/features/users/sessions.py`, `backend/tests/test_device_sessions.py`, `backend/tests/integration/test_device_session_concurrency.py`; modify `backend/app/core/security.py`, `backend/app/features/users/service.py`, `backend/app/features/users/schemas.py`, `backend/app/features/users/router.py`, `backend/tests/test_logout_revocation.py`, `backend/tests/test_cookie_security.py`, and existing refresh tests located by `rg -l 'refresh_version|refresh_token' backend/tests`.

**Interfaces:** `RefreshTokenClaims(subject: str, session_id: str, version: int)`; `sessions.create_session(db: Session, user_id: int) -> UserSession`; `sessions.rotate_session(db: Session, claims: RefreshTokenClaims) -> UserSession`; `sessions.revoke_session(db: Session, claims: RefreshTokenClaims) -> None`; `sessions.revoke_user_sessions(db: Session, user_id: int) -> None`. Helpers flush/update within caller transaction and never commit. Retain public user-service signatures; add internal `TokenPair.refresh_expires_at: datetime` without changing `TokenResponse`.

- [x] Add service tests: two logins yield distinct `sid`, both refresh independently; replay/expired/revoked/wrong-owner/legacy tokens fail; stale logout preserves new version; logout preserves other device; password change revokes all in one transaction; deletion invalidates sessions. Force password transaction failure and assert neither password nor revocations commit. Assert token absolute expiry never grows and refresh-cookie max-age is bounded by remaining lifetime. Run focused files; observe current user-level behavior fails.
- [x] Implement strict 32-character hex `sid` validation and a positive user subject. Session creation uses UUID hex; rotation uses atomic version/active/expiry checks and verifies user eligibility in the transaction. Revoke with matching sid/user/version; missing/invalid logout remains idempotent. Caller commits only after successful lifecycle operation.
- [x] Replace `_token_pair(user_id, refresh_version)` with `_token_pair(user_id: int, session: UserSession) -> TokenPair`; refresh JWT uses session absolute expiry, cookie setter consumes `refresh_expires_at` and clamps remaining seconds at zero. Password changes revoke all; prevent races by locking the active user row before password verification, session creation/rotation, and password change using consistent user→session order. Reload user state under the lock so a previously verified old password cannot create a post-change session. Retain compatibility column without reading it for new sessions.
- [x] Add MariaDB concurrent tests with independent DB sessions/barriers: one winner per sid/version; two sid rotations both succeed; password change racing login/refresh cannot leave a session minted from pre-change credentials active after the change. Run focused auth tests and cookie tests; run database races in Task 14. Commit: `feat(auth): rotate refresh tokens per device session`.

## Task 8: Coordinate login, refresh, and logout across tabs (item 7 frontend)

**Files:** Create `frontend/lib/session-lock.ts`, `frontend/tests/session-lock.test.ts`; modify `frontend/lib/session.ts`, `frontend/lib/api.ts`, `frontend/components/auth/auth-container.tsx`, `frontend/tests/session.test.tsx`, `frontend/tests/api-client.test.ts`, `frontend/tests/auth-flows.test.tsx`, `frontend/tests/checkout-session.test.tsx`.

**Interfaces:** `withSessionLock<T>(work: () => Promise<T>): Promise<T>` uses Web Lock `truelook-refresh` or direct fallback. Preserve `refreshSession(): Promise<string>` and `logoutSession(): Promise<void>`; add `loginSession(identifier: string, password: string): Promise<void>` to centralize credential exchange and token installation. Session-channel events are validated discriminated messages for session change, token renewal, and logout, containing an opaque session epoch and monotonic refresh revision.

- [x] Add tests with two isolated module instances and fake lock/channel: simultaneous refresh sends one request when peer token arrives; missed notification uses latest cookie; local single flight remains; logout during delayed refresh cannot restore memory; delayed old-epoch renewal and stale 401 cannot overwrite/clear a new account. Verify no rebroadcast loops and no auth writes to browser storage. Run `pnpm test -- tests/session-lock.test.ts tests/session.test.tsx tests/api-client.test.ts tests/auth-flows.test.tsx`; observe missing protocol/orchestration failures.
- [x] Implement lock wrapper and validated channel protocol. Serialize network login/logout/refresh; capture generation before waiting and verify after lock and response. After acquiring a lock recheck peer renewal revision. On logout clear local memory immediately; clear it again after serialized server logout so a lock predecessor cannot resurrect it. On successful account switch publish a new epoch; ignore renewal events from earlier epochs and request fresh state for unknown epochs rather than accepting an uncorrelated token.
- [x] Keep renewal within a session from advancing local account generation; account changes/logout advance it. Release in-flight state in `finally`. Without lock APIs allow one stale-refresh retry using shared cookie; never loop and never persist tokens. Replace auth component's raw login call with `loginSession`; retain form/navigation behavior.
- [x] Rerun focused frontend tests, `tests/checkout-session.test.tsx`, `tests/auth-storage-lint.test.ts`, and `pnpm exec tsc --noEmit`; expect pass. Real cross-tab cookie ordering is verified in Task 13. Commit: `fix(auth): coordinate browser tab session mutations`.

## Task 9: Lock backend dependencies with hashes (item 10)

**Files:** Create `backend/requirements.in`, `backend/requirements-dev.in`, `backend/requirements-lock.txt`, `backend/requirements-dev-lock.txt`; modify existing `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/Dockerfile`, `.github/workflows/ci.yml`, `README.md`.

**Interfaces:** `.in` files are editable inputs; runtime lock includes exact transitive versions/hashes; dev lock adds test/tool dependencies. Legacy `.txt` entrypoints reference the matching lock. Docker/CI install with `--require-hashes`.

- [x] Capture installed versions and existing successful runtime before resolving. Generate locks using Python 3.12 and `python -m piptools compile --generate-hashes --output-file requirements-lock.txt requirements.in`, then equivalent dev command. Constrain resolution to captured direct versions where available; do not opportunistically upgrade major versions. Pin the regeneration tool version in dev input and record it in README.
- [x] Test clean Python 3.12 installations with `python -m pip install --require-hashes -r requirements-lock.txt` and the dev equivalent, followed by `python -m pip check`; validate Linux container and Windows wheel/marker compatibility. Hash failure is a real failure. Resolve platform-specific markers explicitly rather than deleting hash verification.
- [x] Wire Docker/CI to locks and update cache dependency paths. Run backend imports, lint, unit suite, and Compose rebuild; expect successful installs and no dependency conflicts. Commit: `build: lock backend runtime and test dependencies`.

## Task 10: Equalize unknown-user password verification and NAT limits (items 12, 15)

**Files:** Modify `backend/app/features/users/service.py`, `backend/app/features/users/router.py`, `backend/app/core/rate_limiter.py`, `backend/tests/test_users.py`, `backend/tests/test_auth_rate_limits.py`, `backend/tests/test_rate_limiter_resilience.py`, `backend/tests/test_rate_limiter_proxy.py`; create `backend/app/features/users/login_limits.py`.

**Interfaces:** `enforce_login_limits(request: Request, command: LoginCommand) -> None` runs on the validated body before credential verification. Use a stable HMAC-SHA256 identifier digest keyed by app secret and normalized `strip().casefold()` identifier. Keep explicit SlowAPI `60/minute` IP route limit and registration/refresh limits; identifier budget is `5/minute` through existing limiter storage/fallback rather than a second independent Redis implementation.

- [x] Add a spy test that `verify_password` runs exactly once for missing and present users using a module-level `_DUMMY_HASH`, with the same 401 body. Avoid timing thresholds. Add five wrong-password requests/identifier then 429 on sixth; other identifier behind same IP still succeeds/fails normally, 61 distinct-identifier requests hit IP 429. Test case/space normalization of budget and no raw identifier in persisted key. Run focused user/rate tests; expect current behavior to fail.
- [x] Implement dummy hash path without changing account lookup semantics. Add validated-body identifier limiter at endpoint entry, including successful/failed attempts, sharing fallback policy with current limiter. Retain broad IP decorator for metadata/routing tests. Do not read async request bodies from a synchronous key callback.
- [x] Rerun four rate/proxy/resilience files and user tests; assert storage outage retains documented bounded local fallback, identifier and IP keys are separated, and header spoofing cannot bypass trusted IP resolution. Commit: `fix(auth): protect login without sharing a tiny NAT budget`.

## Task 11: Escape literal SQL substring searches (item 13)

**Files:** Create `backend/app/core/search.py`, `backend/tests/test_literal_search.py`, `backend/tests/integration/test_literal_search.py`; modify `backend/app/features/users/service.py`, `backend/app/features/categories/service.py`, `backend/app/features/products/service.py`.

**Interfaces:** `literal_contains_pattern(value: str) -> str` escapes `\`, `%`, `_` then wraps with `%`. Consumers call `.ilike(pattern, escape="\\")` with parameters.

- [x] Parameterize inputs `%`, `_`, `\`, mixed strings and Unicode. Assert `literal_contains_pattern("a_b%") == "%a\\_b\\%%"`; actual repository queries must match only records containing those literal characters while retaining case-insensitivity. Run new unit tests; expect missing helper/current wildcard behavior failures.
- [x] Implement helper and use it in user/category/product search, brand, and color substring filters. Preserve pagination, stock filters, and query loading. Run new tests plus existing categories/products/users tests; run MariaDB variants in Task 14, including default SQL escaping behavior. Commit: `fix(search): treat wildcard characters as literal input`.

## Task 12: Commit image metadata deletion before object cleanup (item 14)

**Files:** Modify `backend/app/features/products/images.py`, `backend/tests/test_product_images.py`.

**Interfaces:** Preserve `delete_product_image(db: Session, storage: ProductStorage, product_id: int, image_id: str) -> None` and HTTP behavior for existing/missing images.

- [x] Add `test_image_delete_commit_failure_preserves_object` with `storage.deleted == []`, `test_object_cleanup_failure_does_not_restore_row` asserting successful response and missing row plus logged object identifier, and success-order assertions. Run image tests; expect current storage-first behavior fails.
- [x] Capture object name, delete row, commit; only then attempt storage deletion with logged best-effort exception handling. Keep authorization/not-found and primary-image/cache behavior. Rerun image/access-control tests; expect pass. Commit: `fix(images): delete metadata before best-effort storage cleanup`.

## Task 13: Add real browser coverage and align operating docs (items 3, 7, 11)

**Files:** Create `frontend/playwright.config.ts`, `frontend/e2e/session-and-images.spec.ts`; modify `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/vitest.config.ts`, `README.md`, `docs/MIGRATION_NOTES.md`; extend `.github/scripts/compose_smoke.py` and smoke CI job.

**Interfaces:** `pnpm test:e2e` runs only `frontend/e2e` against explicit `E2E_BASE_URL`/`E2E_API_URL`; Vitest excludes `e2e/**` while retaining default exclusions. Add `@playwright/test` as a dev-only dependency and CI browser installation. Fixtures own users/products/images within the disposable stack.

- [x] Add browser scenarios using two pages in one context and a second independent context: simultaneous refresh continues authenticated requests; logout in one tab clears peer session without logging out other device; password change prevents refresh on both devices; delayed refresh/account switch preserves correct identity. Assert authenticated identity through `/users/me`, not merely visible UI text.
- [x] Add authenticated fixture setup via existing `python -m app.cli create-admin --email <fixture-email> --username <fixture-name>` in the disposable API container. Supply generated password/confirmation through subprocess stdin with Compose `exec -T`; the current getpass fallback must complete without echoing credentials, otherwise use a fixture-only in-container Python wrapper around `create_admin` with mocked password prompts. Do not add a production password argv flag, seed production, or print credentials. Create product and upload a tiny PNG to real MinIO via existing endpoints. Browser loads its direct URL and Next.js `/_next/image` URL with HTTP 200 and nonzero natural width. Never rely on placeholder success.
- [x] Run the test against the pre-fix reference if available to establish the race/image failure; otherwise retain unit red evidence from Tasks 2/8 and record that browser tests were introduced after those fixes. Run against the fixed disposable stack; expect all browser cases pass. Smoke script provisions/cleans test fixtures and invokes browser tests before its final teardown.
- [x] Update README: access tokens in memory, HttpOnly refresh cookies, local versus production config, hashed dependency regeneration, image host rebuild, seed passwords, session re-login rollout and absolute expiry, Redis/browser fallback limitations. Migration notes cover existing DB user provisioning and downgrade session loss. Commit: `test: verify device sessions and images in real browsers`.

## Task 14: Complete regression and remove only obsolete documents

**Files:** Create `docs/reviews/2026-10-19-vton-review-remediation-report.md`, `docs/reviews/2026-10-19-vton-cleanup-inventory.md`; delete only explicit obsolete paths from the inventory; repair links in README/docs as needed. Update this plan's checkboxes with measured outcomes.

**Interfaces:** Report maps review items 1–15 to commits/tests; inventory maps every discovered plan/spec to keep/delete, evidence, remaining requirements, and reference handling. Keep current plan/spec and both original user documents.

- [x] In backend run `python -m ruff check app tests`, `python -m ruff format --check app tests`, `python -m pytest -q`. In frontend run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm exec eslint . --max-warnings=0`, `pnpm build`. Fix any regressions with targeted tests before repeating affected gates.
- [x] Run all integration tests with disposable MariaDB `TEST_DATABASE_URL`, not a developer DB. Include session migration roundtrip/races, mismatch races and search escaping. Integration runner must not trust `tests/conftest.py`'s SQLite `DATABASE_URL` override; explicitly supply the disposable URL to migration subprocesses and inspect effective connections. Run Alembic upgrade/downgrade/upgrade only on owned disposable databases; expect one head and no unexplained skips.
- [x] Run the isolated Compose/browser smoke end-to-end after final code/dependency changes; record exact commands, versions, counts, skips and limitations. Inspect secret redaction and resource cleanup. Record each check unavailable due to environment separately; do not claim all acceptance gates passed if any are unavailable.
- [x] Inventory `docs/plans`, `docs/specs`, `docs/superpowers/plans`, `docs/superpowers/specs` including ignored files. Use implemented code/tests and commit history per file; retain unresolved VTON/readiness requirements. Check duplicate documents by content and preserve the canonical version. Move live operating decisions before deletion. Explicitly list ignored deletions in report before removing them.
- [x] Verify each resolved absolute deletion path is under the intended docs roots and is a named inventory entry. Remove individual files with PowerShell `Remove-Item -LiteralPath`; do not recursively delete directories or infer obsolescence from age. Repair incoming links; verify the new design/plan and preserved review documents exist. Check `git diff --check` and final changed-path inventory.
- [x] Commit docs cleanup/report separately: `docs: record remediation evidence and remove superseded plans`. A fresh whole-branch review must resolve actionable findings before publication under the selected execution skill; rerun only checks affected by review fixes.

## Task 15: Publish the new branch and prune eligible old branches

**Files:** Update `docs/reviews/2026-10-19-vton-cleanup-inventory.md` with the branch audit; no application file changes.

**Interfaces:** Remote is `https://github.com/ngthais0607/VTON-shopping-online.git`; publish current branch with upstream, no merge to `main`. Candidate old branches: `feature/fashion-catalog`, `feature/vton-security-integrity-optimization`, `fix/fashion-review-fixes`.

- [x] Verify `git status --short`, commit list, and changed paths; ensure only preserved original untracked documents remain. Fetch origin and inspect default/protected branches, active worktrees, and open PRs using authenticated GitHub tools/API when available. Do not install/configure an unrelated account or expose credentials; retain remote candidates whose PR/protection state cannot be verified.
- [x] Push `git push -u origin codex/vton-review-remediation`; verify remote tip matches local HEAD with `git ls-remote`. This is the recovery anchor before any branch deletion. If publication fails, stop cleanup and report the specific blocker.
- [x] Fetch again immediately before cleanup. Record candidate tip OIDs, assert `git merge-base --is-ancestor <tip> origin/codex/vton-review-remediation` returns 0, and confirm no candidate is default/protected, attached to a worktree, or needed by an open PR. Retain any branch that advanced with unique work.
- [x] For each eligible remote candidate, delete only with an expected-tip lease using `git push --force-with-lease=refs/heads/<candidate>:<verified-oid> origin :refs/heads/<candidate>`. This lease guards a deletion; it is not authorization to overwrite history. If rejected because a tip changed, refetch and reassess; never bypass the lease/protection. Delete corresponding local branches with `git branch -d` only after published ancestry and local ancestry are verified. Never use `-D`.
- [x] Verify published branch, remaining local/remote branch lists, and preserved worktrees; append exact deleted/retained names and reasons to inventory. Commit report update and push it; verify remote HEAD again. Report implementation/tests, GitHub branch link, document deletions, branch deletions, and any retained blockers. No PR is required by the user's request; if a PR is separately requested and created, attach its URL to this chat.

## Coverage and approval handoff

| Review items | Tasks |
|---|---|
| 1–4 | 1–2, 13–14 |
| 5 | 4 |
| 6 | 5, 14 |
| 7 | 6–8, 13–14 |
| 8 | 3 |
| 9 | 2, 13 |
| 10 | 9 |
| 11 | 13 |
| 12, 15 | 10 |
| 13 | 11 |
| 14 | 12 |
| Document cleanup / GitHub / branches | 14–15 |

Self-review: all spec sections have owners; five Review Focus conditions have explicit checks; session/token signatures remain consistent across tasks; runtime installation and cleanup are scoped. Before execution the user reviews this plan and chooses Native or Subagent-driven execution. Recommendation: Native for the shared Compose/auth interfaces and one cohesive delivery branch, with a fresh whole-branch review before publication.
