# VTON review remediation report

Started: 2026-10-19; final verification: 2026-10-20. Branch: `codex/vton-review-remediation`.
Base: `fix/mvp-hardening` at `f7ac031`.
Status: implementation and all local acceptance gates passed; publication and branch cleanup in progress.

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

Final review findings, execution rulings and actual cleanup/publication results
will be recorded here before the task workspace is removed.

Implementation commits: `3623778` (Compose/health), `1a66814` (synthetic bank),
`1f948e5` (seed), `05cdd6c` (payment evidence), `360d4a7` (session schema),
`1418090` (auth), `f8ab691` (data consistency/search/images), `3316bb4` (hashed
locks/runtime/migration URL), `428cfda` (browser memory/session routing), and
`944b5b7` (browser/Compose/CI tooling and operating docs).

Ten obsolete documents were removed as individually listed in the inventory;
six were ignored files, four tracked. The active plan/spec and review evidence
remain available. No branch has yet been deleted.

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
