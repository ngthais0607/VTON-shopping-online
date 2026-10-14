import logging

import pytest

from app.features.orders.service import _enqueue_best_effort


class FailingQueue:
    async def enqueue(self, task_name: str, *args: object) -> None:
        raise ConnectionError("Redis connection dropped during enqueue")


@pytest.mark.asyncio
async def test_enqueue_best_effort_logs_structured_error_on_failure(caplog):
    queue = FailingQueue()
    order_id = 12345
    task_name = "send_payment_received_email_task"

    with caplog.at_level(logging.ERROR):
        # Should not raise exception
        await _enqueue_best_effort(queue, task_name, order_id)

    # Verify structured logging occurred
    records = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(records) == 1
    record = records[0]

    assert record.order_id == order_id
    assert record.task_name == task_name
    assert "Redis connection dropped" in record.error
    assert (
        f"Failed to enqueue email task {task_name} for order {order_id}"
        in record.message
    )
