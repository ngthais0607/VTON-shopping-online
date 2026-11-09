"""VTON job logic. Pure functions of (db, storage, engine) so they are testable."""

import asyncio
import logging
from datetime import timedelta
from io import BytesIO

from PIL import Image
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.features.vton import service
from app.features.vton.model import VtonTask
from app.integrations.storage import ProductStorage
from app.integrations.vton_engine import VtonEngine, VtonEngineError

logger = logging.getLogger(__name__)

# Queued tasks older than this had their enqueue lost; the recovery cron re-sends.
REQUEUE_AFTER_SECONDS = 30


def _fail(db: Session, task_id: str, code: str) -> None:
    db.query(VtonTask).filter(VtonTask.id == task_id).update(
        {
            VtonTask.status: "failed",
            VtonTask.error_code: code,
            VtonTask.finished_at: service.utcnow(),
        }
    )
    db.commit()


def _claim(db: Session, task_id: str) -> VtonTask | None:
    """Atomically move queued -> processing so duplicate jobs cannot both run."""
    result = db.execute(
        update(VtonTask)
        .where(VtonTask.id == task_id, VtonTask.status == "queued")
        .values(
            status="processing",
            started_at=service.utcnow(),
            attempts=VtonTask.attempts + 1,
            error_code=None,
        )
    )
    db.commit()
    if result.rowcount != 1:
        return None
    db.expire_all()
    return db.get(VtonTask, task_id)


def _expired(created_at, settings: Settings) -> bool:
    age = service.utcnow() - created_at
    return age > timedelta(minutes=settings.vton_stale_processing_minutes)


async def process_vton_task(
    db: Session,
    storage: ProductStorage,
    engine: VtonEngine,
    settings: Settings,
    task_id: str,
) -> str:
    """Run one task. Returns succeeded | failed | requeued | skipped."""
    task = _claim(db, task_id)
    if task is None:
        return "skipped"
    person_object, garment_object = task.person_object, task.garment_object
    cloth_type, attempts = task.cloth_type, task.attempts
    created_at = task.created_at

    if not person_object:
        _fail(db, task_id, "person_image_missing")
        return "failed"
    try:
        person = await asyncio.to_thread(storage.get, person_object)
    except Exception:
        logger.exception("VTON person photo unreadable task=%s", task_id)
        _fail(db, task_id, "person_image_missing")
        return "failed"
    try:
        garment = await asyncio.to_thread(storage.get, garment_object)
    except Exception:
        logger.exception("VTON garment unreadable task=%s", task_id)
        _fail(db, task_id, "garment_unavailable")
        return "failed"

    try:
        output = await engine.run(person, garment, cloth_type)
        with Image.open(BytesIO(output)) as probe:
            probe.verify()
        result_object = f"vton/results/{task_id}.png"
        await asyncio.to_thread(
            storage.put, result_object, BytesIO(output), "image/png"
        )
    except VtonEngineError as error:
        # A service that is still starting (first run downloads model weights) is
        # not a failed attempt: wait for it, bounded by the stale threshold.
        waiting = error.code == "engine_unavailable" and not _expired(
            created_at, settings
        )
        if error.retryable and (waiting or attempts < settings.vton_max_attempts):
            logger.warning(
                "VTON retryable failure task=%s code=%s", task_id, error.code
            )
            db.query(VtonTask).filter(VtonTask.id == task_id).update(
                {
                    VtonTask.status: "queued",
                    VtonTask.error_code: error.code,
                    VtonTask.attempts: attempts - 1 if waiting else attempts,
                }
            )
            db.commit()
            return "requeued"
        logger.warning("VTON failed task=%s code=%s", task_id, error.code)
        _fail(db, task_id, error.code)
        return "failed"
    except Exception:
        logger.exception("VTON unexpected failure task=%s", task_id)
        _fail(db, task_id, "internal_error")
        return "failed"

    db.query(VtonTask).filter(VtonTask.id == task_id).update(
        {
            VtonTask.status: "succeeded",
            VtonTask.result_object: result_object,
            VtonTask.error_code: None,
            VtonTask.finished_at: service.utcnow(),
        }
    )
    db.commit()
    return "succeeded"


def recover_vton_tasks(db: Session, settings: Settings) -> list[str]:
    """Fail tasks stuck in processing and return ids that need (re-)enqueueing."""
    now = service.utcnow()
    stale = now - timedelta(minutes=settings.vton_stale_processing_minutes)
    for task in (
        db.query(VtonTask)
        .filter(VtonTask.status == "processing", VtonTask.started_at < stale)
        .all()
    ):
        if task.attempts >= settings.vton_max_attempts:
            task.status = "failed"
            task.error_code = "engine_timeout"
            task.finished_at = now
        else:
            task.status = "queued"
    db.commit()

    cutoff = now - timedelta(seconds=REQUEUE_AFTER_SECONDS)
    return [
        row[0]
        for row in db.query(VtonTask.id)
        .filter(
            VtonTask.status == "queued",
            VtonTask.purged_at.is_(None),
            VtonTask.created_at < cutoff,
        )
        .all()
    ]


async def purge_expired_vton_data(
    db: Session, storage: ProductStorage, settings: Settings
) -> int:
    """Delete photos/results older than the retention window (rows are kept)."""
    cutoff = service.utcnow() - timedelta(hours=settings.vton_retention_hours)
    tasks = (
        db.query(VtonTask)
        .filter(
            VtonTask.purged_at.is_(None),
            VtonTask.created_at < cutoff,
            VtonTask.status.in_(("succeeded", "failed")),
        )
        .limit(200)
        .all()
    )
    for task in tasks:
        await service.purge_task(db, storage, task)
    return len(tasks)
