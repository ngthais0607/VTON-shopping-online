# Evidence-First Repository Cleanup and Code Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove proven dead artifacts, source, assets, dependencies, and historical Superpowers material, then fix confirmed frontend and backend correctness issues without changing intended product behavior.

**Architecture:** Work on the existing `safe-mvp-remediation` worktree in small commits. Use repository entry points and import/configuration evidence to prune unreachable code, centralize the stock-availability invariant, validate inventory inputs at the API boundary, and make non-critical email enqueueing and test transactions reliable.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, Alembic, Pytest, Next.js 16, React 19, TypeScript, Vitest, ESLint, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-11-evidence-first-cleanup-review-design.md`

## Global Constraints

- Work only from the `safe-mvp-remediation` branch and preserve its authentication, order-lifecycle, payment, and inventory-concurrency guarantees.
- Do not delete `backend/.venv`, `frontend/node_modules`, the active `.worktrees` directory, migrations, runtime templates, or the current remediation documents.
- Remove source, assets, or packages only after checking alias imports, relative imports, re-exports, tests, configuration, framework conventions, and runtime string references.
- Public routes, response shapes, and intended UI behavior remain unchanged unless a regression test proves the old behavior incorrect.
- Critical and High findings receive tests and fixes; Medium findings are fixed only when local and low-risk; stylistic Low findings are reported.
- MariaDB-only tests are reported as skipped when the service is unavailable and are never described as passing unless they actually run.

## Review Focus

- A product whose `sold_quantity` is non-zero must show the same non-negative available quantity in admin and storefront views; Task 3 pins this with helper tests.
- Product writes containing negative quantities, zero/negative prices, or `reserved + sold > stock` must fail with HTTP 422; Task 4 pins each boundary.
- A welcome-email queue outage after registration must not turn a committed registration into an HTTP 500; Task 5 pins the failure path.
- Updating one user to another user's username or email must return HTTP 400 rather than leak a database integrity error; Task 5 pins both collisions.
- Endpoint commits during tests must not break per-test rollback or emit SQLAlchemy transaction warnings; Task 6 runs the suite with `SAWarning` promoted to an error.

---

### Task 1: Remove Regenerable and Historical Workspace Artifacts

**Files:**
- Delete locally: `backend/**/__pycache__/`, `backend/.pytest_cache/`, `backend/pytest-cache-files-*`, `backend/test.db`, `backend/server.log`, `frontend/.next/`, `frontend/tsconfig.tsbuildinfo`
- Delete locally: `.superpowers/sdd/` in both the repository root and selected worktree when present
- Delete locally: repository-root `docs/superpowers/{plans,specs}/` documents dated before `2026-10-10`
- Delete locally: `docs/superpowers/plans/2026-10-10-safe-mvp-remediation.md`
- Preserve: the remediation design, amendment, implementation plan, errata, this design, and this plan

**Interfaces:**
- Consumes: the approved cleanup classification from the spec.
- Produces: a workspace where default test discovery is not obstructed by stale generated directories.

- [ ] **Step 1: Resolve and record every deletion target**

Use `Resolve-Path`/`Get-Item` and verify that every target is inside `D:\fastapi-founder` and is in the explicit lists above. Confirm both active worktrees with `git worktree list` before deletion.

- [ ] **Step 2: Delete only the verified targets**

Use native PowerShell `Remove-Item -LiteralPath` for each resolved file or directory; do not use cross-shell path piping, broad globs, or remove either `.venv`, `node_modules`, or `.worktrees`.

- [ ] **Step 3: Verify preserved documentation and environments**

Run: `Test-Path backend/.venv; Test-Path frontend/node_modules; git worktree list; Get-ChildItem docs/superpowers -Recurse -File`

Expected: both environments and both worktrees exist; only the current remediation set and cleanup design/plan remain.

- [ ] **Step 4: Verify backend test discovery no longer sees stale cache directories**

Run from `backend`: `.\.venv\Scripts\python.exe -m pytest tests -q -p no:cacheprovider`

Expected: `59 passed, 4 skipped` or a larger passing count after later tasks.

### Task 2: Remove the Unreachable Frontend UI and Dependency Cluster

**Files:**
- Delete: `frontend/components/theme-provider.tsx`
- Delete: `frontend/hooks/use-debounce.ts`, `frontend/hooks/use-mobile.ts`, `frontend/hooks/use-toast.ts`
- Delete: `frontend/lib/mock-data.ts`, `frontend/tests/use-debounce.test.ts`
- Delete: every file under `frontend/components/ui/` except `alert-dialog.tsx`, `avatar.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`, `select.tsx`, `skeleton.tsx`, `slider.tsx`, `table.tsx`, and `tabs.tsx`
- Delete: `frontend/public/placeholder.jpg`, `frontend/public/placeholder.svg`, `frontend/public/placeholder-logo.png`, `frontend/public/placeholder-logo.svg`, `frontend/public/placeholder-user.jpg`
- Modify: `frontend/package.json`, `frontend/pnpm-lock.yaml`

**Interfaces:**
- Consumes: current Next.js route files, shared components, tests, and configuration as the reachable entry-point set.
- Produces: the same application routes with only reachable shared modules and their required packages.

- [ ] **Step 1: Re-run exact reference checks before deletion**

Check every candidate name across `app`, `components`, `hooks`, `lib`, `tests`, root config files, CSS, and `public` path literals. Stop and retain any candidate with a consumer outside the dead cluster.

- [ ] **Step 2: Delete the proven unreachable source, test, and asset files**

Delete exactly the candidates in the Files block that remain unreachable. Re-run `rg` for their module aliases and public filenames; expected output is empty.

- [ ] **Step 3: Remove packages whose only consumers were deleted**

Run from `frontend`:

`pnpm.cmd remove @radix-ui/react-accordion @radix-ui/react-aspect-ratio @radix-ui/react-checkbox @radix-ui/react-collapsible @radix-ui/react-context-menu @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-menubar @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-switch @radix-ui/react-toast @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip cmdk embla-carousel-react input-otp next-themes react-day-picker react-resizable-panels vaul autoprefixer`

Expected: `package.json` and `pnpm-lock.yaml` update without removing packages used by the 13 retained UI modules or build/test configuration.

- [ ] **Step 4: Run the frontend safety gates**

Run: `pnpm.cmd test; pnpm.cmd exec tsc --noEmit; pnpm.cmd build`

Expected: all remaining tests pass, typecheck passes, and all 26 application routes build.

- [ ] **Step 5: Commit the dead-code removal**

Commit: `refactor: remove unused frontend modules and dependencies`

### Task 3: Centralize Available Inventory and Clear Frontend Warnings

**Files:**
- Create: `frontend/lib/inventory.ts`
- Create: `frontend/tests/inventory.test.ts`
- Modify: `frontend/app/products/page.tsx`
- Modify: `frontend/app/dashboard/page.tsx`
- Modify: `frontend/app/store/components/FeaturedProducts.tsx`
- Modify: `frontend/app/store/components/QuickViewModal.tsx`
- Modify: `frontend/app/store/account/page.tsx`
- Modify: `frontend/app/store/orders/page.tsx`
- Modify: `frontend/app/store/blog/page.tsx`

**Interfaces:**
- Consumes: `Product` from `frontend/lib/types.ts`.
- Produces: `getAvailableStock(product: Pick<Product, "stock_quantity" | "reserved_quantity" | "sold_quantity">): number`, clamped to zero.

- [ ] **Step 1: Write the failing inventory helper tests**

Add tests asserting `10 - 2 - 3 === 5`, `10 - 2 - 0 === 8`, and malformed legacy data `5 - 2 - 8` clamps to `0`.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm.cmd test -- tests/inventory.test.ts`

Expected: FAIL because `@/lib/inventory` does not exist.

- [ ] **Step 3: Implement and adopt `getAvailableStock`**

Create the pure helper and replace all inline availability calculations in the four listed product/dashboard/storefront files. Do not change raw stock, reserved, or sold display fields.

- [ ] **Step 4: Stabilize effect dependencies**

Use `useCallback` for `fetchUserOrders`/`fetchProfile`, `fetchReviews`, and `loadData`, with their actual dependencies, and make each effect depend on its stable callback. Preserve manual refresh and post-review refresh behavior.

- [ ] **Step 5: Replace the blog `<img>` with `next/image`**

Use `Image` with `fill`, the existing container as the positioning boundary, and a responsive `sizes` value matching the one-column/mobile and three-column/desktop grid.

- [ ] **Step 6: Run focused and full frontend checks**

Run: `pnpm.cmd test -- tests/inventory.test.ts; pnpm.cmd lint -- --max-warnings=0; pnpm.cmd exec tsc --noEmit; pnpm.cmd test; pnpm.cmd build`

Expected: helper tests pass; ESLint reports zero warnings; all tests, typecheck, and build pass.

- [ ] **Step 7: Commit the frontend correctness fixes**

Commit: `fix: align frontend inventory and effect logic`

### Task 4: Enforce Product Inventory Invariants at the API Boundary

**Files:**
- Modify: `backend/app/features/products/schema.py`
- Modify: `backend/app/seed.py`
- Modify: `backend/tests/test_products.py`

**Interfaces:**
- Consumes: the existing `ProductCreate` and `ProductUpdate` request models.
- Produces: both models validate `price > 0`, all three quantities `>= 0`, and `reserved_quantity + sold_quantity <= stock_quantity`.

- [ ] **Step 1: Add failing API validation tests**

Add parameterized tests proving create and update return 422 for a zero/negative price, each negative quantity, and combined reserved/sold quantities above stock. Add a boundary case where `reserved + sold == stock` succeeds.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_products.py -k "inventory_validation" -v -p no:cacheprovider`

Expected: the invalid payloads are currently accepted or reach persistence, so the new assertions fail.

- [ ] **Step 3: Add Pydantic field and model validation**

Use `Field(gt=0)` for price, `Field(ge=0)` for quantities, and one shared validated base model or validator so create and update cannot drift. Raise a Pydantic validation error when `reserved + sold > stock`.

- [ ] **Step 4: Make seed inventory obey the same invariant**

Generate sold and reserved counts first, then make total stock at least their sum plus the intended available amount. Preserve deterministic field meanings used by checkout and dashboard calculations.

- [ ] **Step 5: Run product and order regression suites**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_products.py tests/test_orders.py tests/test_worker.py -q -p no:cacheprovider`

Expected: all tests pass.

- [ ] **Step 6: Commit the backend validation**

Commit: `fix: enforce product inventory invariants`

### Task 5: Make User Writes Deterministic Under External and Uniqueness Failures

**Files:**
- Modify: `backend/app/features/users/router.py`
- Modify: `backend/tests/test_users.py`

**Interfaces:**
- Consumes: existing registration and admin user-update endpoints.
- Produces: best-effort welcome-email enqueueing and an HTTP 400 uniqueness response for username/email collisions.

- [ ] **Step 1: Add a failing registration queue test**

Patch `app.features.users.router.enqueue_task` to raise, register a new user, and assert HTTP 201 plus a persisted user record.

- [ ] **Step 2: Add failing admin update collision tests**

Create two active users, update one to the other's username and then email, and assert HTTP 400 with `Username or email already exists` while both records remain unchanged.

- [ ] **Step 3: Run the focused tests and verify failure**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_users.py -k "queue_failure or update_collision" -v -p no:cacheprovider`

Expected: registration returns 500 and/or the update leaks an integrity error before the fix.

- [ ] **Step 4: Implement minimal failure handling**

Add a module logger, catch/log enqueue failures only after the committed registration, and query for username/email collisions excluding the target user before mutating an admin-updated user.

- [ ] **Step 5: Run user and security regressions**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_users.py -q -p no:cacheprovider`

Expected: all user tests pass, including refresh-token and deleted-user authorization cases.

- [ ] **Step 6: Commit the user-flow fixes**

Commit: `fix: harden user write failure handling`

### Task 6: Restore Reliable Backend Quality Gates and Remove Mechanical Duplication

**Files:**
- Modify: `backend/pytest.ini`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/app/features/orders/router.py`
- Modify: `backend/app/features/products/router.py`
- Modify: `backend/app/features/categories/router.py`

**Interfaces:**
- Consumes: the existing SQLAlchemy `Session` fixture and current test layout.
- Produces: default pytest discovery limited to `tests`, rollback-safe test sessions, and no duplicate requirement or proven unused imports.

- [ ] **Step 1: Make default collection ignore environments and transient cache directories**

Set `testpaths = tests` and `norecursedirs = .venv .pytest_cache pytest-cache-files-*` while retaining the existing `integration` marker.

- [ ] **Step 2: Make the database fixture preserve an outer rollback boundary**

Bind `TestingSessionLocal` with `join_transaction_mode="create_savepoint"`; close the session and roll back the outer transaction only when active. Keep dependency overrides isolated and cleared after each client.

- [ ] **Step 3: Verify transaction warnings are fatal and absent**

Run: `.\.venv\Scripts\python.exe -m pytest tests -q -W error::sqlalchemy.exc.SAWarning`

Expected: 59 or more tests pass, four MariaDB tests skip when unavailable, and no SQLAlchemy warning is raised.

- [ ] **Step 4: Remove mechanical duplication**

Remove the second `httpx` line from `requirements.txt` and only imports proven unused by repository search from the three listed routers. Do not remove model-registration imports in `app/main.py`.

- [ ] **Step 5: Run backend compile and unit gates**

Run: `.\.venv\Scripts\python.exe -m compileall -q app tests; .\.venv\Scripts\python.exe -m pytest tests -q`

Expected: compilation and tests pass; only the third-party Starlette/httpx deprecation warning may remain and must be reported.

- [ ] **Step 6: Commit backend gate cleanup**

Commit: `test: stabilize backend quality gates`

### Task 7: Validate Migrations, External Concurrency, and the Complete Diff

**Files:**
- Create: `docs/reviews/2026-10-11-cleanup-code-review.md`
- Modify only if a gate exposes an in-scope regression: the owning source/test files from Tasks 2–6

**Interfaces:**
- Consumes: all task commits and the approved spec.
- Produces: final evidence and a severity-ranked review report.

- [ ] **Step 1: Run all frontend gates from a clean generated state**

Run from `frontend`: `pnpm.cmd test; pnpm.cmd lint -- --max-warnings=0; pnpm.cmd exec tsc --noEmit; pnpm.cmd build`

Expected: all commands pass and all application routes are emitted.

- [ ] **Step 2: Run all backend unit gates**

Run from `backend`: `.\.venv\Scripts\python.exe -m pytest tests -q -W error::sqlalchemy.exc.SAWarning`

Expected: all unit tests pass; integration tests either run or report their explicit service-based skip reason.

- [ ] **Step 3: Upgrade an empty SQLite database to Alembic head**

Point `DATABASE_URL` at a new temporary SQLite file inside the worktree, run `.\.venv\Scripts\alembic.exe upgrade head`, inspect `alembic current`, then remove only that verified temporary file.

Expected: the reported revision is `head` with no migration error.

- [ ] **Step 4: Run MariaDB integration tests when the configured service is reachable**

Use the repository's test database configuration and run `tests/integration/test_checkout_concurrency.py`, `test_order_transition_concurrency.py`, and `test_order_fulfillment_migration.py`. If the service is unavailable, record the exact skip/blocker without claiming a pass.

- [ ] **Step 5: Re-run dead-reference and dependency checks**

Verify deleted aliases, filenames, public assets, and removed package names have no live consumer. Confirm every remaining `components/ui` file has a route/shared-component consumer or is required by a retained component.

- [ ] **Step 6: Review repository state and write the report**

Run: `git status --short; git diff --check; git log --oneline --decorate -12`

Document deleted artifacts/modules/packages, fixed findings with severity and file references, every command result, skipped external checks, the third-party deprecation warning if present, and remaining Low/out-of-scope findings.

- [ ] **Step 7: Commit the final report**

Commit: `docs: report cleanup and code review results`
