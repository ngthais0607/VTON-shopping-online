# Payment configuration

Agreed on 2026-10-23:

- Receiving bank: VietinBank (`ICB`, BIN `970415`). The receiving account and
  beneficiary name are stored in the ignored `backend/.env`, not in examples.
- New products default to VND in the admin form.
- VietQR orders expire after 30 minutes. Configure `ORDER_EXPIRE_MINUTES=30`
  for both the API and worker; Compose now passes this setting to both.
- COD remains available. Shipping is free; checkout totals contain merchandise only.
- Existing product prices and currencies have not been converted or migrated.

Restart the API and worker after changing environment settings. Rebuild/restart
the frontend to apply the admin changes. The ARQ worker and Redis must run for
scheduled expiration and reservation release.

## Automatic confirmation: connection still required

The application currently generates a VietQR image and accepts its own payment
webhook contract. It does not yet have a SePay or Casso adapter. Bank details and
a webhook secret alone do not activate automatic bank notifications.

Recommended next integration: SePay. The account owner must first create an
account at https://my.sepay.vn and connect VietinBank using the provider's flow:
https://docs.sepay.vn/ket-noi-vietinbank.html

Enter identity details and complete bank verification only in the official
connection flow. Do not put banking passwords, identity documents or OTPs in
repository files or chat.

The official VietinBank personal-account guide requires transfer descriptions
to start with `SEVQR`. Before enabling this provider, implement and verify:

1. QR memos compatible with `SEVQR`, retaining unambiguous order matching.
2. A provider-specific adapter for incoming transfer events, including its
   authentication scheme, receiving account, direction, amount and transaction ID.
3. Compatibility with duplicate, mismatched and late-payment reconciliation.
4. A public HTTPS webhook address reachable by the provider.
5. A real small incoming transfer proving that exactly the matching order is paid.

SePay's native JSON and authentication are different from the existing
`POST /api/v1/orders/vietqr-webhook` contract (`X-Webhook-Secret`,
`transaction_id`, `amount`, `content`). Do not connect native SePay events
directly to that endpoint without an adapter.

Webhook documentation: https://docs.sepay.vn/tich-hop-webhooks.html

Until that integration is completed and verified, payment confirmation remains
manual through the admin order status action. Do not advertise automatic
confirmation as active.
