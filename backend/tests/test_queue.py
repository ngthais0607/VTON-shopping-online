import asyncio
from types import SimpleNamespace
from urllib.parse import quote

import pytest

from app.core.config import get_settings
from app.core.rate_limiter import limiter
from app.features.users.model import User
from app.integrations import queue as queue_module
from app.integrations.queue import (
    ArqTaskQueue,
    create_task_queue,
    get_task_queue,
    parse_redis_settings,
)


def test_worker_uses_queue_parser_for_credentials_and_tls(monkeypatch):
    from app import worker

    monkeypatch.setattr(
        worker,
        "get_settings",
        lambda: SimpleNamespace(
            redis_url="rediss://worker:secret@redis.internal:6380/3"
        ),
    )

    settings = worker.get_redis_settings()

    assert (settings.username, settings.password) == ("worker", "secret")
    assert (settings.host, settings.port, settings.database, settings.ssl) == (
        "redis.internal",
        6380,
        3,
        True,
    )


def test_parse_redis_settings():
    settings = parse_redis_settings("redis://redis_host:6380/2")

    assert settings.host == "redis_host"
    assert settings.port == 6380
    assert settings.database == 2


@pytest.mark.parametrize("password", ["space $ @:/ +", "literal%20percent"])
def test_queue_url_decodes_credentials_exactly_once(password):
    user = "worker@tenant"
    settings = parse_redis_settings(
        f"rediss://{quote(user, safe='')}:{quote(password, safe='')}@redis:6380/3"
    )
    assert settings.username == user
    assert settings.password == password
    assert settings.ssl and settings.database == 3


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
    assert create_task_queue(redis_url) is not None


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
    queue = create_task_queue("memory://")

    with pytest.raises(RuntimeError, match="not configured"):
        await queue.enqueue("send_welcome_email_task", 42)


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


@pytest.mark.asyncio
async def test_concurrent_enqueues_share_one_lazy_pool_and_close_it(monkeypatch):
    created = 0
    released = asyncio.Event()

    class Pool:
        closed = False

        async def enqueue_job(self, *_args):
            return object()

        async def aclose(self):
            self.closed = True

    pool = Pool()

    async def create_pool(_settings):
        nonlocal created
        created += 1
        await released.wait()
        return pool

    monkeypatch.setattr(queue_module, "create_pool", create_pool)
    queue = ArqTaskQueue("redis://localhost:6379/0")
    tasks = [asyncio.create_task(queue.enqueue("task", index)) for index in range(2)]
    await asyncio.sleep(0)
    released.set()
    await asyncio.gather(*tasks)
    await queue.aclose()

    assert created == 1
    assert pool.closed


def test_queue_dependency_is_owned_by_app_not_global_cache(monkeypatch):
    from app.main import create_app

    settings = get_settings().model_copy(
        update={"redis_url": "redis://localhost:6379/0"}
    )
    first = create_app(settings)
    second = create_app(settings)
    assert get_task_queue(SimpleNamespace(app=first)) is first.state.task_queue
    assert first.state.task_queue is not second.state.task_queue
