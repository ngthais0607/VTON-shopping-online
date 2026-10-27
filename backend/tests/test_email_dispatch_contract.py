from unittest.mock import AsyncMock

import pytest
from fastapi import BackgroundTasks

from app.features.orders.service import _dispatch_email


def test_email_dispatch_requires_explicit_background_tasks():
    with pytest.raises(TypeError):
        _dispatch_email(AsyncMock(), "send_order_confirmation_email_task", 1)


@pytest.mark.asyncio
async def test_email_dispatch_only_enqueues_when_background_tasks_run():
    queue = AsyncMock()
    tasks = BackgroundTasks()
    _dispatch_email(queue, "send_order_confirmation_email_task", 123, tasks)
    queue.enqueue.assert_not_awaited()
    await tasks()
    queue.enqueue.assert_awaited_once_with("send_order_confirmation_email_task", 123)
