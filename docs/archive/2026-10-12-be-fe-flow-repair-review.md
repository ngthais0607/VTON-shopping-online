# BE–FE flow repair verification

Date: 2026-10-12
Branch: `be-fe-flow-repair`
Baseline: `d83b983`
Review status: independent whole-branch review completed; the Important findings were repaired and verified in one fix pass. No second review was requested.

## Delivered scope

The frontend now uses `/api/v1`, current login/profile/password contracts, paged catalog/admin collections and narrow dashboard DTOs. It handles application and validation errors, refresh concurrency and logout cleanup. Product image creation/upload/retry uses persisted IDs and server URLs. Cart restoration rejects invalid state, checkout prevents overlapping submits and preserves failed carts, and multi-item orders retain individual tracking links. QR navigation does not claim payment confirmation. Synthetic dashboard analytics were removed. Currency policy and VTON were deferred.

## Verification evidence

- Frontend Vitest: 16 files, 52 tests passed, including transport, session-boundary races, logout after protected-layout unmount, login validation/form submission, collection failures, image removal/replacement/retry, malformed nested cart data, cart/checkout, committed order totals, dates and dashboard failure states.
- Frontend TypeScript and ESLint with zero allowed warnings: passed.
- Frontend production build: final post-review build passed for 26 routes.
- Backend pytest with SQLAlchemy warnings as errors: 238 passed, including all ten MariaDB-gated integration cases and a new cross-route customer/admin flow. No skipped test in this configured run.
- Backend Ruff format check (74 files), lint and compilation: passed after formatting `tests/conftest.py`.
- `git diff --check`: passed.
- Live HTTP against the actual FastAPI process, isolated migrated MariaDB demo database, separate MinIO bucket and dedicated Redis container: registration/login; paged product sort; product PATCH; image upload and public read; multi-item COD; owner isolation and admin-only status change; paid tracking; VietQR instructions; Redis jobs executed by an ARQ burst worker; expiration entry point; profile PATCH; refresh and cookie logout; reviews; password PATCH/204 and refresh invalidation; category DELETE/204. All assertions passed.

Test and demo database names and the bucket include generated suffixes. Test credentials and environment settings are local, ignored artifacts; no real user data or production database was used. SMTP was disabled for the demo run. The native Windows ARQ burst probe used `handle_signals=False` and closed its Redis connection directly; ARQ's standard Unix-signal shutdown is not certified on Windows. The deployment worker remains the Docker-based service.

## Remaining verification limits

The available computer-use surface reported no browser providers; both `iab` and `chrome` creation returned “Browser is not available.” Component tests, production compilation and live HTTP are evidence of separate layers, not an interactive browser end-to-end pass. Browser navigation/rendering with the running services and real SMTP delivery still need verification before a pilot release.

Same-action duplicate clicks are prevented in the client. A server-committed checkout whose response is lost can still be duplicated if the customer retries; durable backend idempotency is a separate design change. Existing per-user refresh rotation and backend access-token expiration semantics are preserved. No automatic bank confirmation, currency-policy change or VTON functionality was introduced.

## Implementation decisions

- Work in an isolated existing ignored worktree, preserving the original `main` checkout until integration is authorized.
- Recreate development dependencies locally because the original virtual environment/package binaries were unavailable; retain original stores. Add the missing `pytest-asyncio` development dependency.
- Shared headers own logout so all storefront/admin entry points perform the same cleanup and report server-clear failures.
- Add a users collection hook using the same paging interface. Selector options fetch all category pages; CSV explicitly exports the current page.
- Retain selected image files through an optional uploader callback; after product creation the form keeps the persisted ID for safe upload retry.
- Use one SWR dashboard key for invalidation, and a tested date-display helper for nullable/invalid timestamps.
- Run pytest in a dedicated local scratch directory because the system temporary pytest directory was inaccessible. Isolate MinIO DTO test settings from developer `.env` values while keeping endpoint-derived URL settings tests valid.
- Use `127.0.0.1` for the IPv4-only Redis test binding after reproducing `localhost` IPv6 timeouts. This is local test configuration, not a queue abstraction rewrite.

These decisions preserve the approved scope. Choosing a different paging/session/image approach later requires updating the associated hooks, consumers and regression fixtures together.

## Final review disposition

The [independent findings](final-review-findings.md) describe the pre-fix revision and preserve the reviewer's original verdict. Five Important findings were accepted: login generations/refresh isolation; visible catalog/options/delete failures; pending image intent; logout errors surviving protected-page redirects; and malformed nested cart data. Each affected behavior has a reproducing regression that failed before its repair and passed afterwards. The storefront error regression additionally confirms the final screen behavior.

Two findings originally labeled Minor were promoted to Important by user-visible effect: an invalid empty product page violates the requested final-page recovery, and a missing committed COD total leaves the customer without the authoritative charged amount. Both were reproduced and repaired. The success page reloads every authorized returned order and sums persisted amounts by currency, rather than trusting query-string prices. The zero-total page test waits for the search debounce before pagination so a timer cannot mask the defect.

One Minor remains deferred: the customers overview labels the current page's length as “Total Customers”; the paginated collection itself uses the correct backend total. It does not block account or order operations, but the overview label/count should be corrected in a follow-up.

Review exclusions stand: currency/payment/VTON changes remain deferred; durable checkout idempotency and per-device token policy require separate designs; hosting, SMTP and browser behavior need release checks. No image-delete endpoint was added: the uploader disables removal of persisted images and explains that replacement is available. The cost is that saved images cannot yet be deleted from this screen.

Local demo MariaDB/MinIO resources and the separate Redis container remain available for subsequent manual verification. Their generated names are recorded locally in `backend/.be-fe-verification-infrastructure.json`; the ignored demo environment targets these isolated resources. No API or frontend development server is left running by this verification session. Start them with the documented commands and matching ports/origins. The throwaway test database remains isolated from the demo database.
