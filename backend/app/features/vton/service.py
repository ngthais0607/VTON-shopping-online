import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import PurePosixPath
from typing import BinaryIO
from uuid import uuid4

from PIL import Image, ImageOps
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    ResourceNotFoundError,
    ServiceUnavailableError,
    TooManyRequestsError,
)
from app.features.products import images as product_images
from app.features.products import service as product_service
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User
from app.features.vton.mapping import cloth_type_for_category, pick_garment_image
from app.features.vton.model import VtonTask
from app.features.vton.schemas import VtonEligibilityResponse, VtonQuotaResponse
from app.integrations.queue import TaskQueue
from app.integrations.storage import ProductStorage

logger = logging.getLogger(__name__)

TASK_JOB_NAME = "process_vton_task"
ACTIVE_STATUSES = ("queued", "processing")
MIN_PERSON_SIDE = 256
MAX_PERSON_BYTES = product_images.MAX_IMAGE_SIZE_BYTES
# Person photos and results are private: never cached by browsers or proxies.
PRIVATE_IMAGE_HEADERS = {"Cache-Control": "private, no-store"}


@dataclass(frozen=True)
class ImagePayload:
    content: bytes
    media_type: str


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _require_enabled(settings: Settings) -> None:
    if not settings.vton_enabled:
        raise ServiceUnavailableError(
            "Virtual try-on is currently disabled", code="vton_disabled"
        )


# --- eligibility -----------------------------------------------------------


def _eligibility_for(
    db: Session, settings: Settings, product_id: int, color: str | None
):
    product = product_service.get_product(db, product_id)
    cloth_type = cloth_type_for_category(product.category)
    name = (product.name or "").lower()
    if cloth_type == "overall" and "skirt" in name and "dress" not in name:
        cloth_type = "lower"
    if cloth_type is None:
        return product, None, None, "category_unsupported"
    garment = pick_garment_image(product.images, color)
    if garment is None:
        return product, cloth_type, None, "garment_image_missing"
    return product, cloth_type, garment, None


def get_eligibility(
    db: Session, settings: Settings, product_id: int, color: str | None = None
) -> VtonEligibilityResponse:
    if not settings.vton_enabled:
        return VtonEligibilityResponse(
            eligible=False,
            reason="vton_disabled",
            engine=settings.vton_engine,
            daily_quota=settings.vton_daily_quota,
        )
    _, cloth_type, garment, reason = _eligibility_for(db, settings, product_id, color)
    return VtonEligibilityResponse(
        eligible=garment is not None,
        cloth_type=cloth_type,
        reason=reason,
        engine=settings.vton_engine,
        daily_quota=settings.vton_daily_quota,
    )


# --- quota -----------------------------------------------------------------


def get_quota(db: Session, settings: Settings, user: User) -> VtonQuotaResponse:
    since = utcnow() - timedelta(hours=24)
    used = (
        db.query(VtonTask)
        .filter(VtonTask.user_id == user.id, VtonTask.created_at >= since)
        .count()
    )
    return VtonQuotaResponse(
        limit=settings.vton_daily_quota,
        used=used,
        remaining=max(0, settings.vton_daily_quota - used),
        retention_hours=settings.vton_retention_hours,
    )


# --- person photo ----------------------------------------------------------


def _prepare_person_photo(stream: BinaryIO, filename: str, content_type: str) -> bytes:
    """Validate, strip metadata (EXIF/GPS) and re-encode the uploaded photo."""
    payload = stream.read(MAX_PERSON_BYTES + 1)
    if not payload:
        raise BusinessRuleError("Photo cannot be empty", code="invalid_person_image")
    if len(payload) > MAX_PERSON_BYTES:
        raise BusinessRuleError("Photo must not exceed 5MB", code="image_too_large")

    sniffed = product_images.sniff_image_type(payload[:16])
    spec = product_images.SUPPORTED_IMAGE_FORMATS.get(sniffed or "")
    extension = PurePosixPath(filename.replace("\\", "/")).suffix.lower()
    if (
        spec is None
        or extension not in spec["extensions"]
        or content_type.lower() not in spec["content_types"]
    ):
        raise BusinessRuleError(
            "Photo must be a PNG, JPEG, or WebP file", code="invalid_person_image"
        )
    product_images.validate_image_content(payload, label="Photo")

    with Image.open(BytesIO(payload)) as raw:
        oriented = ImageOps.exif_transpose(raw).convert("RGB")
    width, height = oriented.size
    if min(width, height) < MIN_PERSON_SIDE:
        raise BusinessRuleError(
            f"Photo must be at least {MIN_PERSON_SIDE} pixels on each side",
            code="person_image_too_small",
        )
    if height < width:
        raise BusinessRuleError(
            "Use a portrait photo (taller than wide) showing your full upper body",
            code="person_image_not_portrait",
        )
    out = BytesIO()
    oriented.save(out, format="JPEG", quality=92)
    return out.getvalue()


# --- task lifecycle --------------------------------------------------------


def _find_by_idempotency_key(db: Session, user: User, key: str) -> VtonTask | None:
    return (
        db.query(VtonTask)
        .filter(VtonTask.user_id == user.id, VtonTask.idempotency_key == key)
        .first()
    )


async def create_task(
    db: Session,
    storage: ProductStorage,
    queue: TaskQueue,
    settings: Settings,
    user: User,
    *,
    product_id: int,
    variant_id: int | None,
    stream: BinaryIO,
    filename: str,
    content_type: str,
    consent: bool,
    idempotency_key: str | None,
) -> VtonTask:
    _require_enabled(settings)
    if not consent:
        raise BusinessRuleError(
            "You must consent to processing your photo", code="consent_required"
        )
    if idempotency_key:
        existing = _find_by_idempotency_key(db, user, idempotency_key)
        if existing is not None:
            return existing

    color_name: str | None = None
    if variant_id is not None:
        variant = (
            db.query(ProductVariant)
            .filter(
                ProductVariant.id == variant_id,
                ProductVariant.product_id == product_id,
                ProductVariant.is_active.is_(True),
            )
            .first()
        )
        if variant is None:
            raise ResourceNotFoundError(
                "Variant not found for this product", code="variant_not_found"
            )
        color_name = variant.color_name

    _, cloth_type, garment, reason = _eligibility_for(
        db, settings, product_id, color_name
    )
    if garment is None or cloth_type is None:
        raise BusinessRuleError(
            "This product does not support virtual try-on",
            code="vton_unsupported_product",
            details={"reason": reason},
        )

    stale_before = utcnow() - timedelta(minutes=settings.vton_stale_processing_minutes)
    active = (
        db.query(VtonTask)
        .filter(
            VtonTask.user_id == user.id,
            VtonTask.status.in_(ACTIVE_STATUSES),
            VtonTask.created_at >= stale_before,
        )
        .first()
    )
    if active is not None:
        raise ConflictError(
            "A try-on is already in progress", code="vton_task_in_progress"
        )
    if get_quota(db, settings, user).remaining <= 0:
        raise TooManyRequestsError(
            "Daily try-on limit reached", code="vton_quota_exceeded"
        )

    person_bytes = _prepare_person_photo(stream, filename, content_type)
    task_id = str(uuid4())
    person_object = f"vton/people/{task_id}.jpg"
    await asyncio.to_thread(
        storage.put, person_object, BytesIO(person_bytes), "image/jpeg"
    )

    now = utcnow()
    task = VtonTask(
        id=task_id,
        user_id=user.id,
        product_id=product_id,
        variant_id=variant_id,
        cloth_type=cloth_type,
        status="queued",
        engine=settings.vton_engine,
        person_object=person_object,
        garment_object=garment.object_name,
        idempotency_key=idempotency_key or None,
        consent_at=now,
        created_at=now,
    )
    try:
        db.add(task)
        db.commit()
    except IntegrityError:
        db.rollback()
        await _delete_quietly(storage, person_object)
        if idempotency_key:
            existing = _find_by_idempotency_key(db, user, idempotency_key)
            if existing is not None:
                return existing
        raise
    except Exception:
        db.rollback()
        await _delete_quietly(storage, person_object)
        raise

    try:
        await queue.enqueue(
            TASK_JOB_NAME,
            task.id,
            queue_name=settings.vton_queue_name,
            job_id=task.id,
        )
    except Exception:
        # The row is durable; the recovery cron re-enqueues stale queued tasks.
        logger.exception(
            "Could not enqueue VTON task; recovery will retry id=%s", task.id
        )
    return task


async def _delete_quietly(storage: ProductStorage, object_name: str | None) -> None:
    if not object_name:
        return
    try:
        await asyncio.to_thread(storage.delete, object_name)
    except Exception:
        logger.exception("VTON object cleanup failed object=%s", object_name)


def get_task(db: Session, user: User, task_id: str) -> VtonTask:
    task = (
        db.query(VtonTask)
        .filter(
            VtonTask.id == task_id,
            VtonTask.user_id == user.id,
            VtonTask.purged_at.is_(None),
        )
        .first()
    )
    if task is None:
        raise ResourceNotFoundError("Try-on task not found", code="vton_task_not_found")
    return task


def list_tasks(
    db: Session, user: User, limit: int, offset: int
) -> tuple[list[VtonTask], int]:
    query = db.query(VtonTask).filter(
        VtonTask.user_id == user.id, VtonTask.purged_at.is_(None)
    )
    total = query.count()
    items = (
        query.order_by(VtonTask.created_at.desc(), VtonTask.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return items, total


async def read_task_image(
    storage: ProductStorage, task: VtonTask, which: str
) -> ImagePayload:
    if which == "result":
        object_name, media_type = task.result_object, "image/png"
    else:
        object_name, media_type = task.person_object, "image/jpeg"
    if not object_name:
        raise ResourceNotFoundError("Image not available", code="vton_image_not_found")
    try:
        content = await asyncio.to_thread(storage.get, object_name)
    except Exception as error:
        logger.exception("VTON image read failed object=%s", object_name)
        raise ResourceNotFoundError(
            "Image not available", code="vton_image_not_found"
        ) from error
    return ImagePayload(content=content, media_type=media_type)


async def delete_task_images(
    db: Session, storage: ProductStorage, user: User, task_id: str
) -> None:
    """Erase the user's photo and result now; the row stays for quota accounting."""
    task = get_task(db, user, task_id)
    if task.status == "processing":
        raise ConflictError(
            "Try-on is processing; try again shortly", code="vton_task_in_progress"
        )
    await purge_task(db, storage, task)


async def purge_task(db: Session, storage: ProductStorage, task: VtonTask) -> None:
    person, result = task.person_object, task.result_object
    task.person_object = None
    task.result_object = None
    task.purged_at = utcnow()
    if task.status in ACTIVE_STATUSES:
        task.status = "failed"
        task.error_code = task.error_code or "cancelled"
        task.finished_at = task.purged_at
    db.commit()
    await _delete_quietly(storage, person)
    await _delete_quietly(storage, result)
