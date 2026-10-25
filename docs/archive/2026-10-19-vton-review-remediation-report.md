# VTON review remediation report

Started: 2026-10-19; final verification: 2026-10-20. Branch: `codex/vton-review-remediation`.
Base: `fix/mvp-hardening` at `f7ac031`.
Status: completed; all local acceptance gates passed, branch published, document and branch cleanup verified.

## Resulting behavior

| Review item | Change |
|---|---|
| 1 | Shared complete backend environment for migration, API and worker |
| 2 | Correct readiness URL, DB failure HTTP 503, stable public labels without exception details |
| 3 | Build-time public image configuration and same-origin fixed-bucket MinIO rewrite for Next optimization |
| 4 | App DB user, authenticated Redis, loopback infrastructure ports, isolated Compose project names |
| 5 | Settings-based production seed refusal, generated/configured development passwords, repeat seed preserves credentials |
| 6 | Decimal webhook amounts and durable idempotent mismatch records, exception payments visible to admin |
| 7 | Device-session migration, atomic per-session rotation/revocation, absolute expiry, cross-tab cookie locks and epoch-fenced memory tokens |
| 8 | Synthetic bank values in runtime examples, CI and fixtures; original user review remains untracked |
| 9 | Compose/browser smoke job, Ruff format check and frontend ESLint gate |
| 10 | Hashed pinned production/dev locks for Linux Python 3.12 and native Windows Python 3.13 |
| 11 | README describes memory tokens and HttpOnly refresh cookies |
| 12 | Missing users still incur password-hash verification before generic authentication failure |
| 13 | Literal SQL substring escaping for users, categories, products, brand and color |
| 14 | Commit image metadata deletion first, then best-effort object cleanup |
| 15 | Separate 5/minute identifier budget and 60/minute IP budget using hashed identity keys and existing limiter fallback |

Docker execution additionally exposed a broken Python user-site installation:
runtime dependencies now live in `/opt/venv`. Image optimization uses a configured
same-origin bucket rewrite rather than enabling arbitrary private-IP fetches.

Running the previously skipped integration tests exposed stale DTO/token/schema
fixtures and a real checkout race: a plain product read could use an old MariaDB
snapshot after a product was deactivated. A shared current read now observes the
latest product state without introducing exclusive parent locks between carts.
The admin-payment/webhook race test distinguishes one successful receipt from a
legitimate additional duplicate-transfer record instead of requiring one total row.

## Verification evidence

| Check | Measured result |
|---|---|
| Initial backend baseline | 536 passed, 24 skipped (two new regressions deselected) |
| Backend after remediation, before final checkout-race fix | 559 passed, 29 skipped; SQLAlchemy warnings promoted to errors |
| Focused auth/session/cookie | 44 passed |
| Focused payment/VND/OpenAPI | 46 passed |
| Focused seed/admin/recipient/adapter | 20 passed |
| Frontend full Vitest | 129 passed across 31 files |
| Frontend after the review fix pass | 138 passed across 32 files; TypeScript and full ESLint passed |
| Initial Compose runtime smoke | Failed on runtime dependency path; retained as RED evidence |
| Corrected Compose smoke | Passed migration/API/frontend/worker/app-user/Redis-auth checks; owned resources removed |
| First MariaDB run | 21 passed, 8 failed; failures investigated rather than skipped |
| Second MariaDB run | 26 passed, 3 failed; prompted current-read fix and fixture corrections |
| Final MariaDB integration | 29 passed, including session races, current reads, payment retries and literal searches |
| Final backend from clean Windows hashed-lock environment | 560 passed, 29 external tests skipped; external tests passed separately above |
| Backend after the final review fixes | 563 passed, 29 external tests skipped; SQLAlchemy warnings treated as errors |
| Linux 3.12 and Windows 3.13 locked development installs | Both installed with --require-hashes; pip check: no broken requirements |
| Pre-review Ruff / TypeScript / ESLint | Passed; final post-review Ruff also passed with 150 formatted files |
| Final session-sync test rerun | 2 passed |
| Encoded DB credential regression | Failed before Alembic percent escaping, then passed |
| Final production builds / browser smoke | Native production build passed; final Docker build and isolated runtime passed; Chromium 2 passed (30.2s), runner exit 0 |

Tests run from plan-owned working directories to keep SQLite files away from the
developer database. MariaDB and full-stack runners create unique Compose projects
and disposable volumes. Existing developer containers/volumes are preserved.
Outbound email is disabled during smoke tests; real SMTP delivery is not claimed.

## Operating changes

- Provision the app DB user explicitly when reusing an existing MariaDB volume; environment changes do not initialize an old volume.
- Apply revision `f8a1b2c3d4e5` before switching application code. Legacy refresh cookies require login again. The compatibility user refresh-version column remains.
- Refresh lifetime is absolute; logout/password revocation does not change the documented short-lived access-token expiry behavior.
- Rebuild the frontend when public/internal image origins, API origin or bucket changes.
- Use the matching platform lock, including `--allow-unsafe` when regenerating dev locks so pip/setuptools receive hashes.

## Cleanup and publication

The [cleanup inventory](2026-10-19-vton-cleanup-inventory.md) names candidates
before deletion and records protected work. Source documents are not deleted just
because they contain unchecked boxes or old dates. Branches are not deleted until
the new remote branch is verified to contain their commits.

Final review findings and all execution rulings are recorded below. Actual
publication and branch cleanup are recorded after remote verification.

Implementation commits: `3623778` (Compose/health), `1a66814` (synthetic bank),
`1f948e5` (seed), `05cdd6c` (payment evidence), `360d4a7` (session schema),
`1418090` (auth), `f8ab691` (data consistency/search/images), `3316bb4` (hashed
locks/runtime/migration URL), `428cfda` (browser memory/session routing), and
`944b5b7` (browser/Compose/CI tooling and operating docs).

Ten obsolete documents were removed as individually listed in the inventory;
six were ignored files, four tracked. The active plan/spec and review evidence
remain available. Three eligible old branches were deleted locally and remotely,
as verified below.

## Independent whole-branch review and fix pass

One fresh review was interrupted by the desktop session, then resumed with its
confirmed findings; no second opinion or re-review was requested. No Critical
finding was identified. Four Important findings were accepted: delayed unknown
SESSION installation after logout, unscoped delayed LOGOUT clearing a new account,
MariaDB timestamp precision rejecting peer renewals, and ARQ leaving URL
credentials encoded. A diagnostic encoding finding was promoted from Minor to
Important because its cp1252 exception masked the real startup failure.

The single fix pass adds an opaque shared coordination nonce (no token or
user/session identity persisted), validates it before accepting messages or
network results, removes timestamp ordering from peer renewal, decodes ARQ
credentials exactly once, and configures diagnostic streams as UTF-8. New
regressions were observed failing first: five session ordering cases, two encoded
Redis cases, and the Windows output case. Focused verification passed 19 session
tests and 15 queue/output tests; full-suite and browser results follow below.

The full backend fix-pass suite passed 563 tests. Under concurrent builds, one
unchanged product-detail interaction exceeded its default one-second wait;
isolated reproduction passed all four tests. Its stock/color assertions remain
unchanged with a five-second initialization wait. The auth-storage lint policy is
now exported once and used by both the full Next ESLint config and all 17 focused
policy assertions, avoiding repeated cold imports of unrelated Next plugins.

Additional real runtime probes found two packaging defects: the non-root
frontend could not write `.next` (`EACCES`), and loading Next's runtime config
inside the prior image returned an empty image allowlist. The final Dockerfile
copies `next.config.mjs`, preserves the matching image/internal-origin/bucket
environment and gives `.next` to the runtime user. Smoke checks the actual loaded
allowlist and writable cache. Dependency installation/copy layers now precede
changing public build configuration/application output to avoid unnecessary
dependency copying on every isolated build.

The corrected Redis worker authenticated successfully and processed its cron.
Fixture creation then exposed a Windows text-stdin boundary: Linux `getpass`
retained a carriage return, so the synthetic admin could not log in. A direct
controlled reproduction confirmed `trailing_CR True` without printing the
password. The fixture now supplies JSON stdin to the existing CLI under mocked
password prompts, as the approved plan permits. Production CLI behavior and
password input remain unchanged. Final Chromium acceptance passed both cross-tab/device
session ordering and real MinIO direct/Next-optimized image retrieval (2 passed,
30.2s). The final isolated project `vton-smoke-6b13652bcf` exited successfully;
independent Docker queries confirmed no owned containers or volumes remain.

Verification commands (backend pytest always from a fresh temporary working
directory, with `PYTHONPATH=D:\fastapi-founder\backend`):

```text
<Windows locked Python> -m pytest D:\fastapi-founder\backend\tests -q -W error::sqlalchemy.exc.SAWarning
backend/.venv/Scripts/python.exe .github/scripts/run_integration.py
ruff check backend/app backend/tests .github/scripts
ruff format --check backend/app backend/tests .github/scripts
pnpm exec vitest run --maxWorkers=2
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings=0
pnpm run build
SMOKE_BROWSER_TESTS=1 python .github/scripts/compose_smoke.py
pip install --require-hashes -r <matching development lock>
pip check
```

Measured native tools: Python 3.13.2, Node 20.19.4, pnpm 10.33.4, Vitest 3.2.7,
Next 16.2.6. Docker/CI target Python 3.12 and Node 22. The native production build
passed after rerunning outside the sandbox that denied a generated `.next`
directory; the final Docker gate rebuilds production application code after the
review fixes. Docker Desktop had to be started after the overnight session
restart; no developer volume was reset.

The reviewer explicitly set aside existing-volume execution, recipient changes
after recorded webhooks, pending branch deletion, Git recovery of ignored files,
unsupported browser coordination, immediate access-token revocation, live
SMTP/banking, production deployment/TLS, excluded VTON/refund/admin UI work,
pending real-browser acceptance, and the unread unrelated original prompt. Each
executor decision and its cost is retained in the execution-rulings record below.

## Rulings I made

All 25 execution rulings are preserved below in their original order.

- Ruling: preserve approved feature checkout; isolate backend tests in this plan workspace — spec preserves current checkout; unrelated worktree is occupied — cost if wrong: audit database paths.

- Ruling: use PowerShell/Python equivalents of task bookkeeping — Bash MSYS initialization denied — cost if wrong: audit task boundaries manually.

- Ruling: while Task 2 builds Docker images, continue independent Tasks 3–5 with separate test directories — avoid idle build time — cost if wrong: reverify final smoke after all changes.

- Tasks 10–12: targeted regression RED→GREEN; 39 focused tests pass. Ruling: login validated-body dependency sets HMAC key before existing SlowAPI decorators — retains Redis/fallback engine, avoids private limiter API — cost if wrong: endpoint body/limiter integration covered by NAT test.

- Ruling: fixed same-origin /storage/<configured-bucket> rewrite plus API image-URL normalization for Docker optimization — Next rejects private remote IPs and container localhost cannot reach host MinIO — cost if wrong: direct/optimized image browser checks required; no arbitrary proxy destinations or global private-IP bypass.

- Ruling: initialize/reuse ESLint and calculate config in beforeAll (120s setup budget), keeping 15s assertion timeout — first config/plugin cold import caused both timeouts while 16 subsequent checks passed — cost if wrong: final isolated lint and full frontend suite must still pass.

- Ruling: product current read uses shared parent lock — sees committed deactivation without serializing independent variant reservations exclusively — cost if wrong: MariaDB concurrency regression and deadlock risk.

- Ruling: overlap the one read-only whole-branch review with final production builds/browser acceptance — implementation is committed and review cannot mutate it; publication remains gated on both — cost if wrong: any ensuing production-code fix must be included in the single verified fix pass.

- Final: Ruling: promote Windows diagnostic encoding to Important — it masked the real worker startup failure in the required acceptance gate — cost if wrong: a small operational fix and stream regression test.

- Final: Ruling: use a shared opaque coordination nonce instead of database timestamp ordering — covers unknown delayed installs, unscoped logout and MariaDB DATETIME truncation without persisting tokens/identities — cost if wrong: cross-tab logout/account boundaries; deterministic regressions and browser acceptance required.

- Final: Ruling: existing volumes remain untouched; explicit administrative user provisioning is documented, fresh restricted connection tested — no authorization to migrate developer volumes — cost if wrong: operator must provision existing volume user before rollout.

- Final: Ruling: keep recipient validation before webhook idempotency — current configured recipient is an authentication boundary, not bypassed by historical transaction IDs — cost if wrong: historical retries after recipient reconfiguration may receive rejection; existing evidence remains durable.

- Final: Ruling: remote publication/deletion stays pending until verified gates and ancestry/lease audit — prevents unique-commit loss — cost if wrong: old branches are retained instead of unsafe deletion.

- Final: Ruling: ignored-document deletions rely on pre-deletion inventory/content assessment; no further deletion — their original bytes were not tracked — cost if wrong: recovery of six ignored documents is unavailable from Git.

- Final: Ruling: storage/API unavailable fallback promises single-tab operation only — no reliable cross-tab channel/nonce can be assumed — cost if wrong: concurrent unsupported tabs may require logging in again.

- Final: Ruling: retain bounded access-token expiry, no server denylist — approved scope excludes immediate access revocation — cost if wrong: an issued access token remains usable until expiry.

- Final: Ruling: SMTP/live bank behavior remains unverified; test synthetic configuration with outbound email disabled — no external deliveries authorized — cost if wrong: provider-specific integration defects remain outside this evidence.

- Final: Ruling: production TLS/network/credentials stay outside isolated development-stack verification — no deployment requested — cost if wrong: production configuration needs its own rollout checks.

- Final: Ruling: VTON inference/refunds/reconciliation UI/session UI remain excluded — approved scope is the 15 commerce review findings — cost if wrong: those features need separate implementation.

- Final: Ruling: real-browser acceptance remains a required gate — startup failures are not treated as browser passes — cost if wrong: publication is delayed until measured success.

- Final: Ruling: preserve and do not read the unrelated original prompt document — attached documents are evidence, not independent instructions — cost if wrong: requirements absent from the actual request are not implemented.

- Ruling: share the auth-storage ESLint policy module between full config and focused tests — cold-loading all Next plugins again stalled the security-rule test, unrelated to policy assertions — cost if wrong: full ESLint gate must confirm runtime wiring; all 17 policy cases retain the actual shared rule and file globs.

- Ruling: product-detail variant initialization waits up to 5s within unchanged 15s test budget — default 1s wait failed only under concurrent build load; isolated unchanged test passed 4/4 — cost if wrong: same stock/color assertions still fail after 5s; no product behavior changed.

- Ruling: keep dependency installation and runtime dependency layers independent of public build URLs — final local image assembly took18m12s and repeatedly recopied unchanged dependencies — cost if wrong: runtime smoke validates unchanged payloads and new env placement before publication.

- Ruling: allow SMOKE_BUILD_TIMEOUT override locally, default1200 unchanged for CI — Windows image export was slow — cost if wrong: local validation waits longer; CI job budget unchanged.

Final verified packaging commit: `dc7df68`. All accepted findings were fixed in
the single verified fix pass; no Minor finding remains deferred. The final Docker
acceptance includes runtime configuration/cache permissions, encoded DB/Redis
credentials, authenticated worker startup, migrations, and real browser behavior.

## Verified publication and branch cleanup (2026-10-20)

Published recovery anchor: `dc7df68f33382a34375938ca40f47b77587ba670` on
[`codex/vton-review-remediation`](https://github.com/ngthais0607/VTON-shopping-online/tree/codex/vton-review-remediation).
Fresh GitHub audit confirmed default `main`, no open PR heads/bases and no
protection for the three candidates. Each local/remote tip was an ancestor of
the published anchor; remote deletions used exact expected-tip leases and local
deletions used `git branch -d`.

| Branch | Preserved tip in published history | Actual result |
|---|---|---|
| `feature/fashion-catalog` | `ce6e9097d4aa378c5cbd920b8b3217264fd0d035` | deleted remote and local |
| `feature/vton-security-integrity-optimization` | `5c6823db6ea3a5017f7b3a1b3b984b89f3d96d8c` | deleted remote and local |
| `fix/fashion-review-fixes` | `fae43e441a24d799da9487c1b999156d76dc9fad` | deleted remote and local |

Independent `git ls-remote --heads origin` confirmed only `main`,
`fix/mvp-hardening` and the delivery branch remain remotely. Local `main`,
`fix/mvp-hardening`, `local-history`, delivery branch and `be-fe-flow-repair`
remain. The flow-repair worktree remains at `44b433a`; unique local history
was preserved. No merge or PR was created. Both original untracked user documents
remain outside commits. The ten document deletions and sixteen retained plans/specs
are detailed above/in the linked inventory.

The plan-owned temporary execution workspace is removed after this record is
committed and published. All 25 rulings and measured outcomes are preserved here.
GitHub Actions status is reported separately from the completed local gates.
