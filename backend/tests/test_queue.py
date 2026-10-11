from types import SimpleNamespace

import pytest

from app.integrations import queue as queue_module
from app.integrations.queue import ArqTaskQueue, get_task_queue, parse_redis_settings


def test_parse_redis_settings():
    settings = parse_redis_settings("redis://redis_host:6380/2")

    assert settings.host == "redis_host"
    assert settings.port == 6380
    assert settings.database == 2


@pytest.mark.asyncio
async def test_arq_queue_delegates_to_pool(monkeypatch):
    calls = []

    class Pool:
        async def enqueue_job(self, task_name, *args):
            calls.append((task_name, args))
            return object()

    async def create_pool(_settings):
        return Pool()

    monkeypatch.setattr("app.integrations.queue.create_pool", create_pool)
    queue = ArqTaskQueue("redis://redis_host:6380/2")

    await queue.enqueue("send_welcome_email_task", 42)

    assert calls == [("send_welcome_email_task", (42,))]


@pytest.mark.asyncio
async def test_arq_queue_reports_rejected_enqueue(monkeypatch):
    class Pool:
        async def enqueue_job(self, _task_name, *_args):
            return None

    async def create_pool(_settings):
        return Pool()

    monkeypatch.setattr("app.integrations.queue.create_pool", create_pool)
    queue = ArqTaskQueue("redis://localhost:6379/0")

    with pytest.raises(RuntimeError, match="did not accept"):
        await queue.enqueue("missing_task")


@pytest.mark.asyncio
async def test_unconfigured_queue_fails_on_enqueue_not_dependency_resolution(
    monkeypatch,
):
    monkeypatch.setattr(
        queue_module,
        "get_settings",
        lambda: SimpleNamespace(redis_url="memory://"),
    )
    get_task_queue.cache_clear()

    queue = get_task_queue()

    with pytest.raises(RuntimeError, match="not configured"):
        await queue.enqueue("send_welcome_email_task", 42)
    get_task_queue.cache_clear()
