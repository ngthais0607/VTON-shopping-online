import logging
from pathlib import PurePosixPath
from typing import BinaryIO
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError
from app.features.products import service
from app.features.products.model import ProductImage
from app.integrations.storage import ProductStorage

logger = logging.getLogger(__name__)

SUPPORTED_IMAGE_TYPES = {
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def store_product_image(
    db: Session,
    storage: ProductStorage,
    product_id: int,
    stream: BinaryIO,
    filename: str,
    content_type: str,
) -> ProductImage:
    product = service.get_product(db, product_id)
    extension = PurePosixPath(filename.replace("\\", "/")).suffix.lower()
    if SUPPORTED_IMAGE_TYPES.get(extension) != content_type.lower():
        raise BusinessRuleError(
            "Product image must be a PNG, JPEG, or WebP file",
            code="invalid_product_image",
        )

    image_id = str(uuid4())
    object_name = f"products/{image_id}{extension}"
    public_url = storage.public_url(object_name)
    storage.put(object_name, stream, content_type)

    image = ProductImage(
        id=image_id,
        product_id=product.id,
        object_name=object_name,
    )
    image.url = public_url
    try:
        db.add(image)
        db.commit()
    except Exception:
        db.rollback()
        try:
            storage.delete(object_name)
        except Exception:
            logger.exception(
                "Failed to compensate product image upload",
                extra={"object_name": object_name},
            )
        raise

    return image
