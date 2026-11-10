"""Simulate the bank telling us a VietQR transfer arrived (local demos only).

Run from the backend directory with the API already running:

    python -m scripts.simulate_vietqr_payment 12            # pay order 12 in full
    python -m scripts.simulate_vietqr_payment 12 --amount 1  # wrong amount -> mismatch

It reads the order total from the database, then calls the real
POST /api/v1/orders/vietqr-webhook endpoint with VIETQR_WEBHOOK_SECRET, so the
normal checks run (amount, duplicate transaction, inventory locks). Nothing is
bypassed. VIETQR_WEBHOOK_SECRET must be set in the API's environment as well.

Refuses to run when APP_ENV=production or when the API is not on localhost.
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid
from urllib.parse import urlparse

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.features.orders.model import Order
from app.features.orders.service import to_vnd_amount

LOCAL_HOSTS = {"localhost", "127.0.0.1", "[::1]", "::1"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("order_id", type=int)
    parser.add_argument("--amount", type=int, help="override the transferred VND")
    parser.add_argument("--api", default="http://localhost:8000")
    args = parser.parse_args()

    settings = get_settings()
    if getattr(settings, "app_env", "") == "production":
        print("Refusing to run in production.", file=sys.stderr)
        return 1
    if urlparse(args.api).hostname not in LOCAL_HOSTS:
        print("Refusing to call a non-local API.", file=sys.stderr)
        return 1
    if not settings.vietqr_webhook_secret:
        print("VIETQR_WEBHOOK_SECRET is not set.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        order = db.get(Order, args.order_id)
        if order is None:
            print(f"Order {args.order_id} not found.", file=sys.stderr)
            return 1
        amount = (
            args.amount
            if args.amount is not None
            else to_vnd_amount(order.total_amount)
        )

    payload = {
        "transaction_id": f"SIM-{uuid.uuid4().hex[:12]}",
        "amount": amount,
        "content": f"TL{args.order_id}",
        "account_number": settings.vietqr_account_no,
    }
    request = urllib.request.Request(
        f"{args.api.rstrip('/')}/api/v1/orders/vietqr-webhook",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Secret": settings.vietqr_webhook_secret,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            print(response.status, response.read().decode())
    except urllib.error.HTTPError as exc:
        print(exc.code, exc.read().decode(), file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"API not reachable: {exc.reason}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
