from functools import lru_cache
from typing import Protocol

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import get_settings


class TaskQueue(Protocol):
    async def enqueue(self, task_name: str, *args: object) -> None: ...


class ArqTaskQueue:
    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._pool: ArqRedis | None = None

    async def enqueue(self, task_name: str, *args: object) -> None:
        if self._pool is None:
            self._pool = await create_pool(parse_redis_settings(self._redis_url))
        job = await self._pool.enqueue_job(task_name, *args)
        if job is None:
            raise RuntimeError(f"Queue did not accept task {task_name!r}")


class _UnavailableTaskQueue:
    async def enqueue(self, task_name: str, *args: object) -> None:
        raise RuntimeError("Task queue is not configured")


def parse_redis_settings(url: str) -> RedisSettings:
    return RedisSettings.from_dsn(url)


@lru_cache
def get_task_queue() -> TaskQueue:
    redis_url = get_settings().redis_url
    if redis_url == "memory://":
        return _UnavailableTaskQueue()
    return ArqTaskQueue(redis_url)
