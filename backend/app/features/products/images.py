import logging
from io import BytesIO
from pathlib import PurePosixPath
from typing import BinaryIO
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError, ResourceNotFoundError
from app.features.products import service
from app.features.products.model import ProductImage
from app.integrations.storage import ProductStorage

logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

SUPPORTED_IMAGE_FORMATS = {
    "jpeg": {
        "extensions": {".jpeg", ".jpg"},
        "content_types": {"image/jpeg"},
        "canonical_ext": ".jpg",
    },
    "png": {
        "extensions": {".png"},
        "content_types": {"image/png"},
        "canonical_ext": ".png",
    },
    "webp": {
        "extensions": {".webp"},
        "content_types": {"image/webp"},
        "canonical_ext": ".webp",
    },
}


VALID_IMAGE_KINDS = {
    "model_photo",
    "flat_lay",
    "detail",
    "size_chart",
    "catalog",
}


def sniff_image_type(data: bytes) -> str | None:
    """Detect image type from leading magic bytes.

    Returns 'jpeg', 'png', 'webp', or None.
    """
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def store_product_image(
    db: Session,
    storage: ProductStorage,
    product_id: int,
    stream: BinaryIO,
    filename: str,
    content_type: str,
    size: int | None = None,
    color_name: str | None = None,
    kind: str = "model_photo",
    is_primary: bool = False,
    sort_order: int = 0,
) -> ProductImage:
    if kind and kind not in VALID_IMAGE_KINDS:
        raise BusinessRuleError(
            f"Invalid image kind '{kind}'",
            code="invalid_image_kind",
        )

    product = service.get_product(db, product_id)

    if size is not None and size > MAX_IMAGE_SIZE_BYTES:
        raise BusinessRuleError(
            "Product image must not exceed 5MB",
            code="image_too_large",
        )

    extension = PurePosixPath(filename.replace("\\", "/")).suffix.lower()

    # Bounded read to prevent reading excessive data into RAM
    payload = stream.read(MAX_IMAGE_SIZE_BYTES + 1)

    if len(payload) == 0:
        raise BusinessRuleError(
            "Product image file cannot be empty",
            code="invalid_product_image",
        )

    if len(payload) > MAX_IMAGE_SIZE_BYTES:
        raise BusinessRuleError(
            "Product image must not exceed 5MB",
            code="image_too_large",
        )

    sniffed_type = sniff_image_type(payload[:16])
    if not sniffed_type or sniffed_type not in SUPPORTED_IMAGE_FORMATS:
        raise BusinessRuleError(
            "Product image must be a PNG, JPEG, or WebP file",
            code="invalid_product_image",
        )

    spec = SUPPORTED_IMAGE_FORMATS[sniffed_type]
    if (
        extension not in spec["extensions"]
        or content_type.lower() not in spec["content_types"]
    ):
        raise BusinessRuleError(
            "Product image must be a PNG, JPEG, or WebP file",
            code="invalid_product_image",
        )

    canonical_ext = spec["canonical_ext"]
    image_id = str(uuid4())
    object_name = f"products/{image_id}{canonical_ext}"
    public_url = storage.public_url(object_name)
    storage.put(object_name, BytesIO(payload), content_type)

    if is_primary:
        db.query(ProductImage).filter(ProductImage.product_id == product.id).update(
            {ProductImage.is_primary: False}
        )

    image = ProductImage(
        id=image_id,
        product_id=product.id,
        object_name=object_name,
        color_name=color_name,
        kind=kind or "model_photo",
        is_primary=is_primary,
        sort_order=sort_order,
    )
    image.url = public_url
    try:
        db.add(image)
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            logger.exception(
                "Failed to roll back product image metadata",
                extra={"object_name": object_name},
            )
        try:
            storage.delete(object_name)
        except Exception:
            logger.exception(
                "Failed to compensate product image upload",
                extra={"object_name": object_name},
            )
        raise

    return image


def upload_product_image(
    db: Session,
    storage: ProductStorage,
    product_id: int,
    stream: BinaryIO,
    filename: str,
    content_type: str,
    color_name: str | None = None,
    kind: str = "model_photo",
    is_primary: bool = False,
    sort_order: int = 0,
) -> ProductImage:
    return store_product_image(
        db,
        storage,
        product_id,
        stream,
        filename,
        content_type,
        color_name=color_name,
        kind=kind,
        is_primary=is_primary,
        sort_order=sort_order,
    )


def delete_product_image(
    db: Session,
    storage: ProductStorage,
    product_id: int,
    image_id: str,
) -> None:
    service.get_product(db, product_id)
    image = (
        db.query(ProductImage)
        .filter(
            ProductImage.id == image_id,
            ProductImage.product_id == product_id,
        )
        .first()
    )
    if image is None:
        raise ResourceNotFoundError(
            f"Image {image_id} was not found",
            code="image_not_found",
        )
    storage.delete(image.object_name)
    db.delete(image)
    db.commit()
