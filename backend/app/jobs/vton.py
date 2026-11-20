"""VTON job logic. Pure functions of (db, storage, engine) so they are testable."""

import asyncio
import logging
from datetime import timedelta
from io import BytesIO

from PIL import Image
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import ConflictError
from app.features.vton import service
from app.features.vton.model import VtonTask
from app.integrations.storage import ProductStorage
from app.integrations.vton_engine import VtonEngine, VtonEngineError

logger = logging.getLogger(__name__)

# Queued tasks older than this had their enqueue lost; the recovery cron re-sends.
REQUEUE_AFTER_SECONDS = 30


def _transition(db: Session, task_id: str, **values) -> bool:
    """Update a task only while it is still ours (processing and not erased)."""
    result = db.execute(
        update(VtonTask)
        .where(
            VtonTask.id == task_id,
            VtonTask.status == "processing",
            VtonTask.purged_at.is_(None),
        )
        .values(**values)
    )
    db.commit()
    return result.rowcount == 1


def _fail(db: Session, task_id: str, code: str) -> None:
    _transition(
        db, task_id, status="failed", error_code=code, finished_at=service.utcnow()
    )


def _retry_or_fail(
    db: Session,
    task_id: str,
    code: str,
    *,
    retryable: bool,
    waiting: bool,
    attempts: int,
    settings: Settings,
) -> str:
    if retryable and (waiting or attempts < settings.vton_max_attempts):
        logger.warning("VTON retryable failure task=%s code=%s", task_id, code)
        _transition(
            db,
            task_id,
            status="queued",
            error_code=code,
            attempts=attempts - 1 if waiting else attempts,
        )
        return "requeued"
    logger.warning("VTON failed task=%s code=%s", task_id, code)
    _fail(db, task_id, code)
    return "failed"


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
    except VtonEngineError as error:
        # A service that is still starting (first run downloads model weights) is
        # not a failed attempt: wait for it, bounded by the stale threshold.
        waiting = error.code == "engine_unavailable" and not _expired(
            created_at, settings
        )
        return _retry_or_fail(
            db,
            task_id,
            error.code,
            retryable=error.retryable,
            waiting=waiting,
            attempts=attempts,
            settings=settings,
        )
    except Exception:
        # Unknown engine crash: retry like any engine error, bounded by attempts.
        logger.exception("VTON unexpected failure task=%s", task_id)
        return _retry_or_fail(
            db,
            task_id,
            "internal_error",
            retryable=True,
            waiting=False,
            attempts=attempts,
            settings=settings,
        )

    try:
        with Image.open(BytesIO(output)) as probe:
            probe.verify()
    except Exception:
        logger.exception("VTON engine returned an unreadable image task=%s", task_id)
        _fail(db, task_id, "internal_error")
        return "failed"

    result_object = f"vton/results/{task_id}.png"
    try:
        await asyncio.to_thread(
            storage.put, result_object, BytesIO(output), "image/png"
        )
    except Exception:
        # Storage hiccups are transient: retry instead of failing for good.
        logger.exception("VTON result upload failed task=%s", task_id)
        return _retry_or_fail(
            db,
            task_id,
            "engine_error",
            retryable=True,
            waiting=False,
            attempts=attempts,
            settings=settings,
        )

    done = _transition(
        db,
        task_id,
        status="succeeded",
        result_object=result_object,
        error_code=None,
        finished_at=service.utcnow(),
    )
    if not done:
        # Erased or cancelled while the engine ran: never resurrect it.
        await service._delete_quietly(storage, result_object)
        return "skipped"
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
    """Delete photos/results older than the retention window (rows are kept).

    Tasks that never finished (stuck queued/processing) are retired and purged
    too, and a task whose deletion failed is retried on the next run.
    """
    cutoff = service.utcnow() - timedelta(hours=settings.vton_retention_hours)
    tasks = (
        db.query(VtonTask)
        .filter(VtonTask.purged_at.is_(None), VtonTask.created_at < cutoff)
        .order_by(VtonTask.created_at)
        .limit(200)
        .all()
    )
    purged = 0
    for task in tasks:
        try:
            if await service.purge_task(db, storage, task, reason="expired"):
                purged += 1
        except ConflictError:  # claimed by a worker a moment ago; next run
            continue
    return purged
