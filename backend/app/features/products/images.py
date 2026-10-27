import logging
from io import BytesIO
from pathlib import PurePosixPath
from typing import BinaryIO
from uuid import uuid4

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError, ResourceNotFoundError
from app.features.products import service
from app.features.products.model import ProductImage
from app.integrations.storage import ProductStorage

logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_DIMENSION = 8192
MAX_IMAGE_PIXELS = 16_000_000

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


def validate_image_content(payload: bytes) -> None:
    """Verify file structure and decode a bounded, static catalog image."""
    try:
        with Image.open(BytesIO(payload), formats=("PNG", "JPEG", "WEBP")) as image:
            width, height = image.size
            if (
                width > MAX_IMAGE_DIMENSION
                or height > MAX_IMAGE_DIMENSION
                or width * height > MAX_IMAGE_PIXELS
            ):
                raise BusinessRuleError(
                    "Product image must be at most 8192 pixels per side and 16 megapixels",
                    code="image_dimensions_exceeded",
                )
            if getattr(image, "n_frames", 1) != 1:
                raise BusinessRuleError(
                    "Product image must be a static image",
                    code="invalid_product_image",
                )
            # libjpeg can decode a JPEG missing its mandatory end-of-image marker.
            if image.format == "JPEG" and not payload.endswith(b"\xff\xd9"):
                raise BusinessRuleError(
                    "Product JPEG is truncated",
                    code="invalid_product_image",
                )
            image.verify()
        # verify() checks structure; load() also detects corrupt/truncated pixel data.
        with Image.open(BytesIO(payload), formats=("PNG", "JPEG", "WEBP")) as image:
            image.load()
    except Image.DecompressionBombError as error:
        raise BusinessRuleError(
            "Product image dimensions exceed the allowed limit",
            code="image_dimensions_exceeded",
        ) from error
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as error:
        raise BusinessRuleError(
            "Product image is corrupt or cannot be decoded",
            code="invalid_product_image",
        ) from error


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

    product = service.get_product(db, product_id, is_admin=True)

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

    validate_image_content(payload)

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
    service.get_product(db, product_id, is_admin=True)
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
    object_name = image.object_name
    db.delete(image)
    db.commit()
    try:
        storage.delete(object_name)
    except Exception:
        logger.exception(
            "Image object cleanup failed after metadata deletion: %s", object_name
        )
