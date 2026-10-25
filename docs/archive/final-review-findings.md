# Independent final review

Reviewed range: `d83b983..2940502b4ca7b20444912905e0ec1763d49d7804`.
Read the design, plan, progress Rulings, packaged diff, verification record, changed implementations and adjacent consumers/backend contracts. Product code was not changed. This artifact is written at the executor's explicit request.

## Strengths

- Shared versioned transport correctly handles PATCH, 204, application errors, validation errors, and same-session refresh exclusion. The focused slow-refresh-after-logout case is covered.
- Category options traverse pages; product partial creation retains the committed ID; checkout uses an immediate submission ref and clears the cart only after successful creation.
- Order IDs are retained, QR continuation makes no confirmation write, and dashboard charts no longer fabricate historical data. External verification limitations are stated honestly.

## Critical

None identified.

## Important — fix before merge

1. **Refresh work crosses login/session boundaries.** `frontend/lib/api.ts:57`, `frontend/lib/api.ts:66`, `frontend/lib/session.ts:6`.
   - Reproduction: keep an old refresh pending, logout, log in again, then let a request in the new session receive 401 before the old refresh settles. It joins the old global promise. The old promise rejects because its generation changed, and the new request's catch clears the new credentials. A controlled Axios-adapter probe against transpiled actual source reproduced `tokenAfterNewLoginAndOldRefresh: null`.
   - Separately, `setAccessToken` is used both for login and renewal but never advances the generation. If a login completes while an old refresh is pending without an intervening clear, the old refresh can overwrite the new login token; cached `/users/me` also retains the same key. This second ordering is established by source inspection, not a separate executed probe.
   - Fix: distinguish starting a login session from renewing its token; advance identity generation on login and scope refresh promises/cleanup to that generation. Add both ordering regressions and assert a new session cannot be overwritten or cleared by old work.

2. **Catalog failures still appear as empty catalog/options, and product delete failures are unhandled.** `frontend/app/products/page.tsx:98`, `frontend/app/products/page.tsx:213`, `frontend/app/products/page.tsx:806`, `frontend/app/store/page.tsx:35`.
   - Reproduction: fail GET `/products` while `/users/me` succeeds. ProductsPage ignores the hook error and displays “No products found.” Fail a later category-options page: both product administration and storefront discard its error and show an empty category selector. Fail DELETE `/products/{id}`: its click handler returns an uncaught rejection without an actionable error.
   - Fix: consume loading/error/retry states in these actual screens, suppress successful empty states on failure, and catch delete failures. Add component regressions; current collection tests only prove the hooks expose errors.

3. **Removing a new image preview still uploads that file; partial-save replacement can re-upload the old file.** `frontend/components/image-uploader.tsx:87`, `frontend/app/products/page.tsx:163`, `frontend/app/products/page.tsx:199`, `frontend/app/products/page.tsx:427`.
   - Reproduction: create product, choose file A, remove its preview, save. Removal calls only `onUploadSuccess("")`; the parent ignores this and retains `selectedImage=A`, which gets uploaded. After a failed initial upload, choosing B uploads B immediately because `productId` now exists, but retains A in the parent; Update then uploads A again. Cancel can also retain the file before opening another product's edit form.
   - Fix: give file selection/removal an explicit nullable callback and synchronize/reset pending file state across removal, successful replacement, partial-save transitions, and cancellation. Add regressions for remove-before-create and replace-after-partial-save. Do not present removal of an already-persisted image as successful without an actual supported delete action.

4. **Protected-page logout failures cannot reach the user.** `frontend/lib/api.ts:76`, `frontend/components/layout-client-wrapper.tsx:28`, `frontend/components/header.tsx:31`.
   - Reproduction: logout from `/dashboard` or `/store/checkout`, delay logout HTTP response, then return 503. Local credentials clear immediately, so LayoutClientWrapper hides/unmounts the page/header and redirects to login before the rejection. The catch writes `logoutError` into that unmounted header. The required server-clear failure message is lost (the same header works on a public storefront).
   - Fix: keep logout outcome in a provider/global notification or other state that survives the guard redirect; render the failure on the destination. Add an integrated layout/header test with a delayed failed logout, not only an API-level rejection test.

5. **Malformed persisted nested product data can still crash cart rendering.** `frontend/app/store/context/CartContext.tsx:30`, `frontend/app/store/components/CartDrawer.tsx:109`.
   - Reproduction: persist an otherwise valid cart product with `category: {name: {bad: true}}`, then open the drawer. `restoreCart` accepts it and React attempts to render that object as a child. Image entries and legacy `image_url` are likewise retained without validating their types. The current defensive check validates the images array itself, not its contents or other rendered nested fields.
   - Fix: normalize persisted data into a small validated cart shape, including category label and image URL types, or discard invalid entries. Add a rendered CartProvider+CartDrawer regression with malformed nested fields. This finding is source-proven; no browser run was available.

## Minor — concrete follow-ups

6. **Product page does not clamp when total reaches zero.** `frontend/app/products/page.tsx:225` requires `totalProducts > 0`. If an admin remains on page 2 while another admin removes the preceding rows, then deletes the final remaining product, the response `{items:[],total:0}` leaves page 2 selected. Clamp to `max(1, ceil(total/pageSize))` after successful responses, including zero. Categories/customers/orders already move back when empty. Add the actual page/deletion regression explicitly required by Review Focus 5.

7. **Committed COD total is never displayed.** `frontend/app/store/checkout/page.tsx:109` discards `response.total_amount`; `frontend/app/store/orders/success/page.tsx` shows IDs but no amount. With a restored price of 25 and server price of 30, the user sees the stale 25 before submission and no corrected aggregate on COD completion. Persist/display the returned committed total for the success result (or load the returned orders there) and test a stale-price checkout. This is an explicit Task 5 acceptance item. QR already uses the backend amount.

8. **Customer count is a page count under an overall label.** `frontend/app/customers/page.tsx:130` displays `users.length` as “Total Customers.” With 21 users, page 1 says 20 and page 2 says 1. Use the hook's `total`, or label it as the current page.

## Recommendations and validation

Existing evidence records 40 frontend tests and 238 backend tests; those suites were not redundantly rerun by this reviewer. The session race was executed independently using actual source and a controlled Axios adapter. Add focused component coverage for the findings: API/hook-only coverage currently misses several integration failures. Final build/format evidence was pending in the reviewed record and should be updated after fixes.

## Declined to judge

- Currency/default-price policy and cross-currency display conventions: explicitly deferred by the user and plan.
- Automatic bank confirmation/payment gateway and VTON: explicitly deferred.
- Durable server checkout idempotency after a lost successful response: separate design change explicitly recorded; same-action exclusion is implemented.
- Per-device refresh sessions and backend token invalidation policy: explicitly preserved by this milestone.
- Production hosting, real SMTP delivery, and interactive browser behavior: unavailable/outside verified release evidence; do not claim they passed.
- Adding a backend image-delete endpoint: outside the agreed existing-contract repair; the current removal UI must still accurately communicate what it does.

## Assessment

**Ready to merge: No, until Important findings are addressed.**

The contract migration is substantial and the principal happy paths are coherent, but session-boundary races, hidden failures, incorrect image intent, and malformed-cart rendering violate the agreed repair criteria. The fixes are localized and should be followed by the affected regressions and final verification gates.
