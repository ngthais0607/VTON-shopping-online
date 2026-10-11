from functools import lru_cache
from typing import Protocol

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import get_settings


class TaskQueue(Protocol):
    async def enqueue(self, task_name: str, *args: object) -> None: ...


class ArqTaskQueue:
    def __init__(self, redis_url: str) -> None:
        self._redis_settings = parse_redis_settings(redis_url)
        self._pool: ArqRedis | None = None

    async def enqueue(self, task_name: str, *args: object) -> None:
        if self._pool is None:
            self._pool = await create_pool(self._redis_settings)
        job = await self._pool.enqueue_job(task_name, *args)
        if job is None:
            raise RuntimeError(f"Queue did not accept task {task_name!r}")


class _UnavailableTaskQueue:
    async def enqueue(self, task_name: str, *args: object) -> None:
        raise RuntimeError("Task queue is not configured")


def parse_redis_settings(url: str) -> RedisSettings:
    clean_url = url.removeprefix("redis://")
    host_port, _, database = clean_url.partition("/")
    host, separator, port = host_port.partition(":")
    return RedisSettings(
        host=host,
        port=int(port) if separator else 6379,
        database=int(database) if database else 0,
    )


@lru_cache
def get_task_queue() -> TaskQueue:
    redis_url = get_settings().redis_url
    if redis_url == "memory://":
        return _UnavailableTaskQueue()
    return ArqTaskQueue(redis_url)
