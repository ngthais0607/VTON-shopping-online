from types import SimpleNamespace

import pytest

from app.core.rate_limiter import limiter
from app.features.users.model import User
from app.integrations import queue as queue_module
from app.integrations.queue import ArqTaskQueue, get_task_queue, parse_redis_settings


def test_parse_redis_settings():
    settings = parse_redis_settings("redis://redis_host:6380/2")

    assert settings.host == "redis_host"
    assert settings.port == 6380
    assert settings.database == 2


def test_parse_redis_settings_preserves_credentials_and_tls():
    credentials = parse_redis_settings("redis://worker:secret@redis.internal:6380/2")
    tls = parse_redis_settings("rediss://redis.internal:6380/3")

    assert (credentials.username, credentials.password) == ("worker", "secret")
    assert (credentials.host, credentials.port, credentials.database) == (
        "redis.internal",
        6380,
        2,
    )
    assert (tls.host, tls.port, tls.database, tls.ssl) == (
        "redis.internal",
        6380,
        3,
        True,
    )


@pytest.mark.parametrize(
    "redis_url",
    [
        "redis://host:not-a-port/0",
        "redis://worker:secret@redis.internal:6380/2",
        "rediss://redis.internal:6380/3",
    ],
    ids=["malformed", "credentials", "tls"],
)
def test_task_queue_dependency_defers_url_parsing(monkeypatch, redis_url):
    monkeypatch.setattr(
        queue_module,
        "get_settings",
        lambda: SimpleNamespace(redis_url=redis_url),
    )
    get_task_queue.cache_clear()

    assert get_task_queue() is not None
    get_task_queue.cache_clear()


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


def test_malformed_queue_url_does_not_fail_registration_before_commit(
    client, db_session, caplog
):
    limiter.reset()
    client.app.dependency_overrides[get_task_queue] = lambda: ArqTaskQueue(
        "redis://host:not-a-port/0"
    )

    response = client.post(
        "/api/v1/users/register",
        json={
            "username": "malformed_queue",
            "email": "malformed-queue@example.com",
            "password": "StrongPassword123!",
        },
    )

    assert response.status_code == 201
    assert (
        db_session.query(User)
        .filter(User.email == "malformed-queue@example.com")
        .count()
        == 1
    )
    assert "Failed to enqueue welcome email" in caplog.text
