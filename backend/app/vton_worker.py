"""Dedicated ARQ worker for try-on inference (separate queue and container).

Long inference must never share a worker with order e-mails or expiry; run with:
    arq app.vton_worker.WorkerSettings
"""

import logging

from arq.cron import cron

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.features import models_registry  # noqa: F401
from app.integrations.queue import parse_redis_settings
from app.integrations.storage import MinioProductStorage
from app.integrations.vton_engine import create_vton_engine
from app.jobs import vton as vton_jobs

logger = logging.getLogger(__name__)


async def startup(ctx: dict) -> None:
    settings = get_settings()
    ctx["settings"] = settings
    ctx["storage"] = MinioProductStorage(settings)
    ctx["engine"] = create_vton_engine(settings)
    logger.info("VTON worker ready engine=%s", settings.vton_engine)


async def process_vton_task(ctx: dict, task_id: str) -> str:
    db = SessionLocal()
    try:
        return await vton_jobs.process_vton_task(
            db, ctx["storage"], ctx["engine"], ctx["settings"], task_id
        )
    except Exception:
        db.rollback()
        logger.exception("VTON task job crashed task=%s", task_id)
        raise
    finally:
        db.close()


async def cron_recover_vton_tasks(ctx: dict) -> None:
    settings = ctx["settings"]
    db = SessionLocal()
    try:
        task_ids = vton_jobs.recover_vton_tasks(db, settings)
    finally:
        db.close()
    for task_id in task_ids:
        # job_id dedupes: a job still queued/running is not enqueued twice.
        await ctx["redis"].enqueue_job(
            "process_vton_task",
            task_id,
            _queue_name=settings.vton_queue_name,
            _job_id=task_id,
        )
    if task_ids:
        logger.info("VTON recovery re-enqueued count=%s", len(task_ids))


async def cron_purge_vton_data(ctx: dict) -> None:
    db = SessionLocal()
    try:
        purged = await vton_jobs.purge_expired_vton_data(
            db, ctx["storage"], ctx["settings"]
        )
        if purged:
            logger.info("VTON retention purged count=%s", purged)
    except Exception:
        db.rollback()
        logger.exception("VTON retention purge failed")
        raise
    finally:
        db.close()


def get_redis_settings():
    url = get_settings().redis_url
    return parse_redis_settings(
        "redis://localhost:6379/0" if url == "memory://" else url
    )


class WorkerSettings:
    on_startup = startup
    functions = [process_vton_task]
    cron_jobs = [
        cron(cron_recover_vton_tasks, second={0, 30}),
        cron(cron_purge_vton_data, minute={7}),
    ]
    redis_settings = get_redis_settings()
    queue_name = get_settings().vton_queue_name
    max_jobs = 1
    max_tries = 1
    # Results are not retained so a recovered task can reuse its job_id.
    keep_result = 0
    job_timeout = get_settings().vton_service_timeout_seconds + 60
