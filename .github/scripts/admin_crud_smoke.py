"""Verify disposable admin catalog CRUD and MinIO images on the local demo."""

import base64
import json
import secrets
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAK0lEQVR4nO3OIQEAAAwEoetfeovxBoGnq1tKQEBAQEBAQEBAQEBAQEBgHXhUDfhqRFDd3gAAAABJRU5ErkJggg=="
)


def main():
    settings = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            settings[key.strip()] = value.strip().strip("\"'")
    origin = settings.get("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8000")
    assert origin.startswith(("http://localhost:", "http://127.0.0.1:")), (
        "Local demo only"
    )
    origin = origin.replace("localhost", "127.0.0.1").rstrip("/")
    token = None

    def call(path, data=None, method=None, multipart=False):
        headers = {}
        if token:
            headers["Authorization"] = "Bearer " + token
        if multipart:
            boundary = "admin-" + secrets.token_hex(8)
            payload = (
                (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="is_primary"\r\n\r\ntrue\r\n'
                    f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="admin-demo.png"\r\nContent-Type: image/png\r\n\r\n'
                ).encode()
                + PNG
                + f"\r\n--{boundary}--\r\n".encode()
            )
            headers["Content-Type"] = "multipart/form-data; boundary=" + boundary
        else:
            payload = json.dumps(data).encode() if data is not None else None
            headers["Content-Type"] = "application/json"
        request = Request(
            origin + "/api/v1" + path,
            data=payload,
            headers=headers,
            method=method or ("POST" if payload else "GET"),
        )
        with urlopen(request, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else None

    token = call(
        "/users/login",
        {
            "identifier": "admin@example.com",
            "password": settings["SEED_ADMIN_PASSWORD"],
        },
    )["access_token"]
    categories = call("/categories?limit=100")["items"]
    parent = next(c for c in categories if c["slug"] == "ao" and c["parent_id"] is None)
    category_id = product_id = None
    image_ids = []
    errors = []
    suffix = secrets.token_hex(4)
    try:
        category = call(
            "/categories", {"name": "Demo áo " + suffix, "parent_id": parent["id"]}
        )
        category_id = category["id"]
        call(f"/categories/{category_id}", {"description": "Admin CRUD check"}, "PATCH")
        product = call(
            "/products",
            {
                "name": "Admin demo shirt " + suffix,
                "price": 250000,
                "currency": "VND",
                "category_id": category_id,
                "is_active": False,
                "gender": "unisex",
                "material": "Cotton",
            },
        )
        product_id = product["id"]
        call(
            f"/products/{product_id}", {"name": "Updated demo shirt " + suffix}, "PATCH"
        )
        call(
            f"/products/{product_id}/variants/bulk",
            {
                "sizes": ["M", "L"],
                "colors": [{"name": "White", "hex": "#FFFFFF"}],
                "default_stock": 5,
            },
        )
        for _ in range(2):
            image = call(f"/products/{product_id}/images", multipart=True)
            image_ids.append(image["id"])
            with urlopen(
                image["url"].replace("localhost", "127.0.0.1"), timeout=15
            ) as response:
                assert response.read() == PNG
        detail = call(f"/products/{product_id}")
        if detail["images"][0]["id"] != image_ids[-1]:
            errors.append("Latest primary image is not first in product response")
        assert sum(i["is_primary"] for i in detail["images"]) == 1
        call(f"/products/{product_id}", {"is_active": True}, "PATCH")
        assert call(f"/products/by-slug/{product['slug']}")["is_active"]
        call(f"/products/{product_id}/images/{image_ids[0]}", method="DELETE")
        image_ids.pop(0)
        assert len(call(f"/products/{product_id}")["images"]) == 1
        print(
            json.dumps(
                {
                    "category_crud": "pass",
                    "product_create_edit_variants_activate": "pass",
                    "image_upload_read_delete": "pass",
                    "errors": errors,
                }
            ),
            flush=True,
        )
    finally:
        if product_id:
            for image_id in image_ids:
                call(f"/products/{product_id}/images/{image_id}", method="DELETE")
            call(f"/products/{product_id}", method="DELETE")
        if category_id:
            call(f"/categories/{category_id}", method="DELETE")
        print("Disposable products, images and category cleaned up.", flush=True)
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
