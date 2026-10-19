# VTON review remediation report

Date: 2026-10-19. Branch: `codex/vton-review-remediation`.
Base: `fix/mvp-hardening` at `f7ac031`.
Status: implementation verification in progress; publication and cleanup not yet complete.

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
| Initial Compose runtime smoke | Failed on runtime dependency path; retained as RED evidence |
| Corrected Compose smoke | Passed migration/API/frontend/worker/app-user/Redis-auth checks; owned resources removed |
| First MariaDB run | 21 passed, 8 failed; failures investigated rather than skipped |
| Second MariaDB run | 26 passed, 3 failed; prompted current-read fix and fixture corrections |
| Final MariaDB integration | 29 passed, including session races, current reads, payment retries and literal searches |
| Final backend from clean Windows hashed-lock environment | 560 passed, 29 external tests skipped; external tests passed separately above |
| Linux 3.12 and Windows 3.13 locked development installs | Both installed with --require-hashes; pip check: no broken requirements |
| Final Ruff / TypeScript / ESLint | Passed; Ruff checked app/tests/scripts and 149 formatted files |
| Final session-sync test rerun | 2 passed |
| Encoded DB credential regression | Failed before Alembic percent escaping, then passed |
| Final production builds / browser smoke | Running; final measured outcomes will replace this row |

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
