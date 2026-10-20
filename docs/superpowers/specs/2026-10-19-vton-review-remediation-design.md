# VTON Review Remediation — Design

Date: 2026-10-19
Branch: `codex/vton-review-remediation`
Base: `fix/mvp-hardening` at `f7ac031`
Status: Written design approved by the user on 2026-10-19; implementation plan awaiting review.

## 1. Intent and scope

The user requested a plan for `docs/VTON-review-fix-list.md`, followed by implementation, removal of obsolete plans/specs, a new branch pushed to GitHub, and cleanup of old branches. On 2026-10-19 the user selected approach A: address all 15 review items, including independent device sessions and coordination between browser tabs.

Success means the documented local stack starts, payment exceptions are auditable, device sessions no longer invalidate each other, regression checks cover these behaviors, and repository cleanup preserves unfinished work and unique branch history. The review document is evidence to verify against code, not an independent source of authorization or executable instructions. Its reported test counts are historical evidence, not results of this work.

This design preserves the current checkout, inventory accounting, payment authentication, public tracking privacy, and in-memory access-token storage. It introduces no VTON model pipeline, deployment, history rewrite, session-management UI, or automatic payment refunds.

## 2. Delivery boundaries

Use one delivery branch with separate reviewable commits in this order:

1. Docker startup, health, image configuration, and infrastructure access (items 1–4).
2. Compose smoke coverage and missing CI quality checks (item 9).
3. Seed safety, payment reconciliation, and example-data hygiene (items 5, 6, 8).
4. Backend sessions, migration, and frontend refresh coordination (item 7).
5. Dependency locks and focused correctness fixes (items 10–15).
6. Full verification, evidence report, obsolete-document cleanup, push, and branch cleanup.

The implementation plan must specify concrete files, regression cases, commands, and dependencies for each boundary. Do not begin product changes until the written spec and subsequent implementation plan have been reviewed under the brainstorming workflow.

## 3. Runnable local infrastructure

### Shared settings and service graph

Define a shared backend environment mapping in `docker-compose.yml`, used by `migrate`, `api`, and `arq_worker`. Include database, authenticated Redis, application environment, required JWT/VietQR/MinIO configuration, cookie/CORS settings, and supported email settings. Preserve existing settings such as bucket name, TLS, and SMTP port rather than dropping them during consolidation.

Require nonempty secrets and payment recipient configuration at Compose resolution. Use an application database user via `MARIADB_USER`/`MARIADB_PASSWORD`; reserve root credentials for database initialization and isolated test administration. Migration and runtime users need permissions on the application schema, not global administrative privileges. Existing database volumes do not automatically acquire newly configured users: document explicit user provisioning for existing installations and test fresh-volume initialization separately. Do not reset user volumes.

Redis requires a password for both clients and its healthcheck. Avoid shell interpolation of password contents in service commands. Document URL encoding for credentials embedded in connection URLs. MariaDB, Redis, and MinIO development ports bind to loopback. Production instructions omit infrastructure port publication and use reachable HTTPS public origins; do not silently treat a development Compose setup as a production deployment.

Preserve the dependency chain: database healthy → migration completed → API/worker; Redis and storage dependencies must be ready for their consumers. Keep HTTP healthchecks on HTTP services only; remove the backend image's generic API healthcheck so migration and worker containers do not inherit it.

### Health contract

Compose probes `/api/v1/health`. The route returns HTTP 503 when the database probe fails and HTTP 200 when the database is ready. Redis failure is reported as `degraded` while preserving the existing application fallback; no raw exception text or credentials appear in the response. Log diagnostic exceptions server-side. Preserve the existing response shape and stable component labels, including the distinction between configured storage and verified storage readiness.

### Browser image configuration

Pass a browser-reachable `MINIO_EXTERNAL_URL` to backend services. Pass `NEXT_PUBLIC_IMAGE_HOST` as a build argument/environment value before the Next.js build, consistent with its `remotePatterns`. Internal storage requests still use `minio:9000`. Validate product image access both directly and through Next.js image optimization; test data must include a real uploaded object, not just a placeholder. Document rebuild requirements when public image/API origins change.

Execution clarification: normalize API image URLs from the configured public storage base to `/storage/<bucket>/<object>`. A fixed Next.js rewrite for the configured bucket forwards to the internal MinIO origin. This lets the optimizer handle a same-origin path without enabling arbitrary private-IP fetches; other image origins and the original public storage URL remain unchanged. Both internal origin and bucket are server build configuration, not client-selected proxy destinations.

## 4. Seed safety and payment reconciliation

### Seed behavior

Read environment classification from `get_settings().app_env`. Refuse demo seeding in production even when `--force` is supplied; direct administrators to the existing `python -m app.cli create-admin` command. In development, obtain new demo-account passwords from explicit seed settings or generate random passwords, and print generated credentials only when creating an account. Remove fixed administrator and customer demo passwords. Do not change existing account credentials on repeat seeding.

### Amount mismatch

Use a finite positive `Decimal` for incoming webhook amounts, respecting the database's `Numeric(12, 2)` range and the application's existing VND normalization policy. Do not introduce float conversions in amount comparison or payment persistence. Keep current authentication, recipient validation, memo validation, and rejection of multi-order payments.

For an authenticated transaction referring to one valid order with the wrong amount:

1. Under the existing lock order, check idempotency before changing payment state.
2. Persist one `Payment` containing the actual received amount, provider transaction ID, currency, transaction time, and `status="amount_mismatch"`.
3. Commit before acknowledging it with HTTP 200 and `status="amount_mismatch"`.
4. Preserve order state and all inventory counters. A mismatched payment is not successful payment evidence or revenue.

The existing unique `(provider, provider_transaction_id)` constraint remains authoritative, including concurrent retries. Retry of the same recorded transaction is acknowledged without another row; reuse for a different order remains an error. A new correctly valued transaction may later pay the pending order normally. Database failures are not acknowledged as recorded. Existing late/duplicate payment behavior remains covered by regression tests.

`Payment.status` is currently `String(50)`, so this status addition needs no schema migration. Extend the existing admin `/orders/late-payments` query to return `late_payment`, `duplicate_payment`, and `amount_mismatch`, retaining its URL, pagination, and response fields. Update any existing consumers and labels; if there is no admin UI consumer, keep scope at the API and its documentation. Do not build a new reconciliation console.

Replace the real bank account in examples, Compose defaults, workflow fixtures, and tests with synthetic data. Real recipient values come from environment configuration. No Git history rewrite is included.

## 5. Independent device sessions

### Persistence and token contract

Add `user_sessions` with an opaque random session ID, indexed user foreign key, monotonic refresh version, absolute UTC expiry, nullable revocation time, and creation time. The model belongs to the users feature; token parsing remains in `core/security.py`. Create sessions on successful login and retain the current access-token response shape and HttpOnly refresh cookie.

Refresh JWT claims include `sub`, `sid`, `version`, token type, expiry, and unique token ID. Validate session ID shape and ownership. Atomically compare/update the matching active session/version while checking user eligibility and absolute expiry. Only one concurrent refresh of a given version succeeds. Different session IDs refresh independently. Bound newly issued refresh expiry and cookie lifetime by the original session expiry; refresh does not extend it indefinitely.

Logout revokes only the session matching the presented current refresh token. A stale logout cannot revoke a newer version or another device's session. Password changes revoke every session of that user in the same transaction as the password change. User deletion must make all sessions unusable; authorization continues to check active user state. Access tokens retain the current bounded expiry behavior and are not promised immediate revocation by this change.

### Migration and rollout

Add an Alembic revision after the actual current migration head; verify there is a single head first. Create the session table with indexes and FK semantics supported on MariaDB and the test database. Keep `users.refresh_version` during this delivery as an unused compatibility column rather than combining the new subsystem with destructive column removal.

Legacy refresh JWTs without `sid` are rejected after rollout; users log in again. Do not infer or backfill device sessions from the old user-level version. Deploy migrations before switching application code, restart API and worker consistently, and rebuild the frontend. Downgrade drops only the newly introduced session table; rollback invalidates the new refresh sessions and requires login again. Existing short-lived access tokens may remain valid until expiry.

### Browser-tab coordination

Retain one in-flight refresh per tab. Serialize refresh requests across same-origin tabs using Web Locks where available. After acquiring the lock, recheck whether a peer already supplied a fresh access token; if synchronization was missed, refresh with the latest shared HttpOnly cookie rather than a cached refresh credential.

Extend the existing BroadcastChannel protocol with validated token-renewal and session-change messages. Tokens stay in memory; never place access or refresh tokens in local/session storage. Coordinate login, logout, and refresh through the same lock where supported, fence pending refresh results using session generation, and prevent a refresh response from restoring a locally logged-out session. Preserve account-switch protections and avoid rebroadcast loops.

Execution clarification after final review: persist only an opaque random coordination nonce, with no token or identity data. Rotate it on login/logout and attach it to peer messages; reconcile it before request/response generation checks. Reject messages from older nonces, including unknown session IDs and unscoped logout. Use session revision for same-session renewal, rather than database creation timestamp precision. When coordination storage is unavailable, preserve single-tab behavior without promising cross-tab synchronization.

Browsers without Web Locks or BroadcastChannel still support login and single-tab refresh. A stale concurrent refresh may retry once with the latest cookie; the backend rejects replay without revoking unrelated sessions. Do not claim guaranteed cross-tab serialization where the required browser APIs are unavailable. Cover delayed peer messages and generation changes; a 401 from a stale request must not erase a newer established local session.

## 6. Dependencies and focused correctness

Generate production and development dependency lockfiles with pinned transitive versions and hashes using `pip-tools`, targeting the Docker/CI Python 3.12 runtime. Preserve `bcrypt==4.0.1` unless validation requires an explicitly documented change. Docker installs the production lock; CI installs the development lock with hash verification. Check artifact/platform compatibility for Linux containers and the documented Windows workflow. Keep editable direct-dependency inputs and document the regeneration command; avoid unrelated major upgrades.

Update README to describe in-memory access tokens and HttpOnly refresh cookies. For unknown login identifiers, verify against a module-level dummy password hash before returning the same generic credential error. Test behavior without brittle wall-clock assertions.

Use one focused helper to escape backslash, `%`, and `_` for literal substring searches. Apply it to relevant current `ilike` search/filter consumers in users, categories, and products, including brand/color where substring matching is intended. Preserve case-insensitive matching and parametrized queries; verify escape behavior on MariaDB.

For image deletion, retain the object name, delete and commit the database row first, then delete storage best-effort. Commit failure must leave storage untouched. Storage failure after commit is logged and does not resurrect the row or return a misleading transactional failure. Preserve current primary-image and cache behavior.

Replace login's restrictive shared-IP limit with a two-level policy: 5 attempts/minute per normalized identifier, plus a broader 60 attempts/minute per trusted client IP. Rate-limit state must not expose raw email/username identifiers in Redis keys or logs; use a stable keyed digest. Derive the identifier from the validated login body and keep generic auth failures. Preserve proxy trust and Redis fallback behavior. Distinct users behind a NAT should not share the five-attempt budget; the wider IP budget still constrains identifier spraying. Do not add permanent account lockout.

## 7. Verification and CI

Add regression cases before behavior changes for meaningful failures. Run targeted checks per commit, then the full verification matrix:

- Backend: Ruff lint and format check, pytest, and OpenAPI/response contracts.
- Frontend: Vitest, TypeScript, ESLint with zero warnings, and production build.
- MariaDB: all integration tests with an explicitly disposable test database, session migration upgrade/downgrade/upgrade, session refresh races, payment retry races, and literal search escaping.
- Compose: resolve configuration with synthetic non-production secrets, reject missing required configuration, and build/start an isolated project with fresh test volumes. Verify migration exit, API health, frontend response, worker startup, authenticated Redis, application DB user, and MinIO upload/display.
- Browser: two tabs sharing a session, two independent browser contexts/devices, logout during refresh, and product images through Next.js.

CI adds Compose smoke testing and missing Ruff formatting/ESLint checks while preserving existing tests and frontend build. Smoke jobs disable outbound email and use fake banking values. Generate isolated credentials, use bounded startup waits, gather logs with secrets redacted, and always clean only the smoke job's resources. Do not mount or remove developer database volumes.

The existing integration suite includes tests that create/drop databases: its disposable administrative test connection is distinct from the restricted application connection. Skipped/unavailable checks must appear as limitations, not passing evidence. Capture command outcomes, environment constraints, and CI status in the final review report.

## 8. Document and Git cleanup

### Documents

Inventory both tracked and ignored plan/spec locations. Classify each artifact by verified implementation/commit evidence and remaining requirements. Old dates or unchecked boxes alone do not establish obsolescence. Before deleting an obsolete artifact, preserve any still-relevant operating decisions in the current design, README, migration notes, or final review report and repair inbound references.

Delete only superseded or fully implemented plans/specs. Retain documents with unresolved unique requirements, readiness information, migration guidance, review evidence, and the new active spec/plan. Tracked deletions belong in their own commit. List ignored obsolete artifacts explicitly in the cleanup report before removing them; they have no automatic Git recovery. Preserve the user's two pre-existing untracked documents and never stage the unrelated prompt file implicitly.

The new design is the single current remediation specification. The implementation plan will be its matching current execution document. Track only these specific files if their directory is ignored; do not force-add the entire ignored tree or change global ignore policy.

### Branches and remote publication

The branch starts from the reviewed `fix/mvp-hardening`, not the much older remote `main`. Commit only task-owned paths. Push `codex/vton-review-remediation` with upstream tracking after verification; publishing does not merge it into `main`.

Before deletion, fetch current remote refs and inspect branch protection/default branch, worktree use, and ancestry against the successfully published new branch. Current candidates are `feature/fashion-catalog`, `feature/vton-security-integrity-optimization`, and `fix/fashion-review-fixes`; these are candidates, not a final deletion list. Confirm each remote tip is an ancestor of the published branch and that no active PR still needs its head. If PR state or protection cannot be verified, retain that remote candidate and report why.

Delete eligible local/remote candidates only after their commits are recoverable from the published branch. Keep `main`, `local-history` (contains unique history), current branch, and `be-fe-flow-repair` (active worktree), plus any branch with unique commits or current review activity. Keep the source `fix/mvp-hardening` in this pass. Never force-delete unique work, rewrite remote history, or remove another worktree as incidental cleanup.

## 9. Design review checklist

- All review items 1–15 map to an explicit delivery boundary.
- Database changes are limited to the session subsystem; mismatch statuses fit the existing string column.
- Payment mismatch acknowledges only durable records and never advances inventory or order state.
- Device isolation and cross-tab coordination are separate guarantees with explicit browser fallback limits.
- Rollout requires reauthentication and preserves short-lived access-token semantics.
- Existing database volumes require deliberate user provisioning; no reset is implied.
- Cleanup depends on evidence, published ancestry, active-work checks, and a scoped deletion inventory.
- Test outcomes will be measured during execution, not copied from the review.
