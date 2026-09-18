import os
import logging
from arq import create_pool
from arq.connections import RedisSettings, ArqRedis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_pool: ArqRedis | None = None


def parse_redis_settings(url: str) -> RedisSettings:
    clean_url = url.replace("redis://", "")
    if "/" in clean_url:
        host_port, database = clean_url.split("/", 1)
        db = int(database) if database else 0
    else:
        host_port = clean_url
        db = 0

    if ":" in host_port:
        host, port = host_port.split(":", 1)
        port = int(port)
    else:
        host = host_port
        port = 6379

    return RedisSettings(host=host, port=port, database=db)


async def get_redis_pool() -> ArqRedis:
    global _redis_pool
    if _redis_pool is None:
        redis_settings = parse_redis_settings(REDIS_URL)
        _redis_pool = await create_pool(redis_settings)
    return _redis_pool


async def enqueue_task(task_name: str, *args, **kwargs):
    try:
        pool = await get_redis_pool()
        job = await pool.enqueue_job(task_name, *args, **kwargs)
        logger.info(f"Enqueued job '{task_name}' with ID: {job.job_id}")
        return job
    except Exception as e:
        logger.error(f"Failed to enqueue task '{task_name}': {str(e)}")
        return None
