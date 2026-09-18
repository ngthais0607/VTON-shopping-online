from dotenv import load_dotenv
import os
import httpx


load_dotenv()

PADDLE_API_KEY = os.getenv("PADDLE_API_KEY")
PADDLE_API_BASE_URL = os.getenv("PADDLE_API_BASE_URL", "https://sandbox-api.paddle.com")    


def create_paddle_transaction(
        price_id :str,
        quantity: int,
        order_id: int
):
    if not PADDLE_API_KEY:
        raise ValueError("PADDLE_API_KEY is not configured")

    url = f"{PADDLE_API_BASE_URL}/transactions"

    payload = {
        "items": [
            {
                "price_id": price_id,
                "quantity": quantity
            }
        ],
    "collection_mode" : "automatic",
    "custom_data": {
        "order_id": order_id
    }
    }

    headers = {
        "Authorization": f"Bearer {PADDLE_API_KEY}",
        "Content-Type": "application/json"
    }

    response = httpx.post(url, json=payload, headers=headers,timeout = 30)
    response.raise_for_status()
    return response.json()["data"]