import asyncio
from typing import Protocol
from urllib.parse import unquote

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from fastapi import Request


class TaskQueue(Protocol):
    async def enqueue(self, task_name: str, *args: object) -> None: ...


class ArqTaskQueue:
    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._pool: ArqRedis | None = None
        self._pool_lock = asyncio.Lock()

    async def enqueue(self, task_name: str, *args: object) -> None:
        if self._pool is None:
            async with self._pool_lock:
                if self._pool is None:
                    self._pool = await create_pool(
                        parse_redis_settings(self._redis_url)
                    )
        job = await self._pool.enqueue_job(task_name, *args)
        if job is None:
            raise RuntimeError(f"Queue did not accept task {task_name!r}")

    async def aclose(self) -> None:
        if self._pool is not None:
            await self._pool.aclose()
            self._pool = None


class _UnavailableTaskQueue:
    async def enqueue(self, task_name: str, *args: object) -> None:
        raise RuntimeError("Task queue is not configured")


def parse_redis_settings(url: str) -> RedisSettings:
    settings = RedisSettings.from_dsn(url)
    # ARQ's parser leaves URL credentials encoded; Redis expects the raw values.
    if settings.username is not None:
        settings.username = unquote(settings.username)
    if settings.password is not None:
        settings.password = unquote(settings.password)
    return settings


def create_task_queue(redis_url: str) -> TaskQueue:
    if redis_url == "memory://":
        return _UnavailableTaskQueue()
    return ArqTaskQueue(redis_url)


def get_task_queue(request: Request) -> TaskQueue:
    return request.app.state.task_queue
