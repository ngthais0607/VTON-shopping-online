"""Pre-generate try-on results for demo pairs so the demo works offline.

Run while online (with the API engine configured), from the backend directory:

    python -m scripts.prewarm_vton --person demo/men.jpg --product-id 3 [--product-id 4]

The person photo goes through the same normalisation as an upload, and the
result is stored under the content hash. When a shopper later uploads the same
photo for the same product image, the worker serves it from storage in ms.
"""

import argparse
import asyncio
import sys
from io import BytesIO
from pathlib import Path

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.features import models_registry  # noqa: F401
from app.features.vton import service
from app.integrations.storage import MinioProductStorage
from app.integrations.vton_engine import CachedVtonEngine, create_vton_engine


async def main(person_path: Path, product_ids: list[int]) -> int:
    settings = get_settings()
    storage = MinioProductStorage(settings)
    storage.ensure_bucket()
    engine = CachedVtonEngine(create_vton_engine(settings), storage, write=True)
    person = service._prepare_person_photo(
        BytesIO(person_path.read_bytes()), person_path.name, _content_type(person_path)
    )
    failures = 0
    with SessionLocal() as db:
        for product_id in product_ids:
            _, cloth_type, garment, reason = service._eligibility_for(
                db, settings, product_id, None
            )
            if garment is None or cloth_type is None:
                print(f"product {product_id}: skipped ({reason})")
                failures += 1
                continue
            garment_bytes = storage.get(garment.object_name)
            await engine.run(person, garment_bytes, cloth_type)
            print(f"product {product_id}: cached")
    return 1 if failures else 0


def _content_type(path: Path) -> str:
    return {".png": "image/png", ".webp": "image/webp"}.get(
        path.suffix.lower(), "image/jpeg"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--person", type=Path, required=True)
    parser.add_argument("--product-id", type=int, action="append", required=True)
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.person, args.product_id)))
