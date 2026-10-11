# Cleanup and Code Review Report

Date: 2026-10-11  
Branch: `safe-mvp-remediation`  
Review baseline: `16f1ccc`

## Outcome

The reviewed MVP scope has no open Critical or High findings. The cleanup removed 55 tracked frontend files and 27 unused direct dependencies, unified the inventory calculation, enforced backend inventory invariants, made user writes deterministic under queue and known uniqueness failures, and restored reliable backend test isolation.

## Fixed findings

### High — inconsistent inventory availability

Frontend screens previously disagreed about whether sold units reduced available stock. `frontend/lib/inventory.ts` now owns the presentation rule `max(0, stock - reserved - sold)` and is used by product administration, dashboard, featured products, and quick view. `backend/app/features/products/schema.py` rejects negative quantities, non-positive prices, and allocations greater than total stock. Seed data now satisfies the same invariant.

Evidence: three frontend invariant tests and thirteen backend create/update boundary tests pass.

### High — committed registration reported failure when email queueing failed

Registration commits the user before enqueueing the welcome email. A queue outage previously escaped as a server error even though the account already existed. `backend/app/features/users/router.py` now treats enqueueing as best effort after the commit and logs the failure without changing the successful HTTP result.

Evidence: the regression test receives HTTP 201 and reads the committed user after a forced queue exception.

### Medium — admin uniqueness collisions leaked database errors

Admin user updates now check another active record for matching username or email before mutating the target and return the documented HTTP 400 response. Regression tests cover both fields and verify that both records remain unchanged.

### Medium — backend tests leaked commits between cases

The SQLite test engine now uses explicit transactions plus per-session savepoints. Endpoint commits remain enclosed by the fixture's outer rollback, so parametrized tests are isolated and SQLAlchemy transaction warnings are treated as errors.

### Medium — stale frontend surface and dependency graph

Removed 44 unused UI modules plus the unused theme provider, three hooks, mock data module, obsolete debounce test, and five placeholder assets. Removed 27 corresponding direct packages from `package.json` and the lockfile. Exact import scans found no deleted-module or deleted-asset references; each of the 13 retained UI modules has at least one live consumer.

### Low — mechanical quality issues

Removed one duplicate `httpx` requirement and proven-unused imports in category, product, and order routers. React effect callbacks now have stable dependencies, and the blog uses the Next image component.

## Verification evidence

- Frontend tests: 4 files, 10 tests passed.
- Frontend lint: passed with `--max-warnings=0`.
- Frontend typecheck: passed with `tsc --noEmit`.
- Frontend production build: passed; 26 routes emitted.
- Backend tests: 75 passed, 4 skipped.
- Backend SQLAlchemy warning gate: passed with `SAWarning` promoted to an error.
- Backend compilation: `compileall` passed for `app` and `tests`.
- Alembic: an empty temporary SQLite database upgraded from base through `6ea70e2e94f1` to `c91f8a4e2b10 (head)` and was removed afterward.
- Repository integrity: `git diff --check` passed.
- Dead-reference scan: zero exact imports of deleted UI modules, zero references to deleted miscellaneous modules/assets, and zero removed packages left as direct dependencies.

## External verification not executed

The four MariaDB concurrency/migration tests were collected but skipped because `TEST_DATABASE_URL` is not configured. Docker could not supply a substitute because the local Docker daemon is unavailable. These checks are not reported as passing.

## Remaining findings and risks

- Low: FastAPI's test client emits one third-party `StarletteDeprecationWarning` about the current `httpx` integration. It does not affect application behavior; dependency migration should be handled separately.
- Low: the admin uniqueness pre-check improves deterministic responses for normal collisions, while the database unique constraint remains the final concurrent-write guard. A rare race can still surface as a generic server error; translate vendor-specific unique-constraint failures in a separate database error-handling pass if the API requires a guaranteed 400 under simultaneous writes.
- Verification gap: MariaDB locking, transition concurrency, and fulfillment migration behavior still require a reachable disposable MariaDB database.

## Cleanup boundary

Virtual environments, installed package stores, active worktrees, current planning artifacts, and the current remediation history were preserved. Generated build/test artifacts are removed after the final validation rather than committed.
