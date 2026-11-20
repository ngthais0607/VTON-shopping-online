# ruff: noqa: F811, F401
"""Adversarial VTON 2D tests.

Every test asserts the behaviour a careful system SHOULD have. A failing test
therefore marks a latent bug (see docs / fix plan), not a broken test.
"""

import asyncio
import threading
from datetime import timedelta
from io import BytesIO

import pytest
from PIL import Image

from app.core.config import get_settings
from app.features.vton import service
from app.features.vton.model import VtonTask
from app.integrations.vton_engine import (
    CachedVtonEngine,
    MockVtonEngine,
    VtonEngineError,
    cache_key,
)
from app.jobs import vton as vton_jobs
from tests.test_vton import (  # noqa: F401  (fixtures re-exported for pytest)
    _post,
    _reset_limiter,
    _run_job,
    garment_png,
    png_bytes,
    queue,
    tee,
)


def _make_task(db, user, tee, task_id, **kw):
    now = service.utcnow()
    values = dict(
        id=task_id,
        user_id=user.id,
        product_id=tee.product.id,
        cloth_type="upper",
        status="queued",
        engine="mock",
        garment_object=tee.garment,
        consent_at=now,
        created_at=now,
    )
    values.update(kw)
    db.add(VtonTask(**values))
    db.commit()


# --- 1. race: two concurrent creates both pass the active/quota check ---------


def test_active_task_check_is_atomic_under_interleaving(
    client, db_session, mock_user_auth, queue, tee, monkeypatch
):
    """Simulate a second request slipping in between the SELECT and the INSERT."""
    first = _post(client, tee)
    assert first.status_code == 202
    # Second request arrives while the first is still queued -> must be 409.
    second = _post(client, tee)
    assert second.status_code == 409

    # Now emulate the race: the active-task SELECT sees nothing (as it would for
    # two requests running in parallel before either commits).
    real_query = db_session.query

    class Blind:
        def __init__(self, inner):
            self.inner = inner

        def filter(self, *a, **k):
            return self

        def first(self):
            return None

        def __getattr__(self, name):
            return getattr(self.inner, name)

    def fake_query(model, *a, **k):
        if model is VtonTask and not a:
            return Blind(real_query(model))
        return real_query(model, *a, **k)

    monkeypatch.setattr(db_session, "query", fake_query)
    third = _post(client, tee)
    monkeypatch.setattr(db_session, "query", real_query)
    db_session.expire_all()
    active = (
        db_session.query(VtonTask)
        .filter(VtonTask.status.in_(("queued", "processing")))
        .count()
    )
    # Desired: the DB itself prevents two active tasks per user.
    assert third.status_code == 409 or active == 1, (
        f"two active tasks exist for one user (third={third.status_code}, active={active})"
    )


# --- 2. idempotency key reused for a different product/photo ------------------


def test_idempotency_key_reused_for_other_product_is_not_silently_replayed(
    client, db_session, mock_user_auth, queue, tee
):
    first = _post(client, tee, headers={"Idempotency-Key": "k-1"})
    assert first.status_code == 202
    # Same key, different payload (other variant id that does not exist).
    tee.variant.id  # noqa: B018
    other = client.post(
        "/api/v1/vton/tasks",
        data={"product_id": "999999", "consent": "true"},
        files={"person_image": ("me.png", png_bytes(), "image/png")},
        headers={"Idempotency-Key": "k-1"},
    )
    # Desired: a conflicting payload must not be answered with the old task as
    # if it succeeded (HTTP 202 with another product's task).
    assert not (
        other.status_code == 202 and other.json()["id"] == first.json()["id"]
    ), "key reuse with a different product silently returned the old task"


# --- 3. purge leaves orphan objects when storage.delete fails -----------------


def test_purge_keeps_row_retryable_when_storage_delete_fails(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    task_id = _post(client, tee).json()["id"]
    _run_job(db_session, product_storage, task_id)
    task = db_session.get(VtonTask, task_id)
    person, result = task.person_object, task.result_object
    task.created_at = service.utcnow() - timedelta(
        hours=get_settings().vton_retention_hours + 1
    )
    db_session.commit()

    def boom(_name):
        raise ConnectionError("minio down")

    product_storage.delete = boom
    asyncio.run(
        vton_jobs.purge_expired_vton_data(db_session, product_storage, get_settings())
    )
    db_session.expire_all()
    task = db_session.get(VtonTask, task_id)
    # Desired: if objects could not be deleted, the pointers must survive so the
    # next purge run can retry. Today they are nulled and the photo is orphaned
    # forever in MinIO (privacy/retention violation).
    assert task.person_object == person and task.result_object == result, (
        "object names were nulled although deletion failed -> orphaned private photo"
    )


# --- 4. queued/processing tasks are never purged -------------------------------


def test_old_queued_task_photo_is_eventually_purged(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    task_id = _post(client, tee).json()["id"]
    task = db_session.get(VtonTask, task_id)
    person = task.person_object
    task.created_at = service.utcnow() - timedelta(
        hours=get_settings().vton_retention_hours + 5
    )
    db_session.commit()
    asyncio.run(
        vton_jobs.purge_expired_vton_data(db_session, product_storage, get_settings())
    )
    assert person in product_storage.deleted, (
        "a task stuck in 'queued' past the retention window keeps the user's photo forever"
    )


# --- 5. transient result-storage failure ---------------------------------------


def test_result_upload_failure_is_retried_not_permanent(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    task_id = _post(client, tee).json()["id"]
    real_put = product_storage.put

    def flaky_put(name, stream, ctype):
        if name.startswith("vton/results/"):
            raise ConnectionError("minio blip")
        return real_put(name, stream, ctype)

    product_storage.put = flaky_put
    outcome = _run_job(db_session, product_storage, task_id)
    db_session.expire_all()
    task = db_session.get(VtonTask, task_id)
    assert outcome == "requeued", (
        f"a transient storage error permanently failed the task: {task.error_code}"
    )


# --- 6. non-Runtime engine exceptions -------------------------------------------


@pytest.mark.parametrize("exc", [ValueError("x"), KeyError("k"), TimeoutError("t")])
def test_unexpected_engine_exception_is_retried_once(
    client, db_session, mock_user_auth, queue, product_storage, tee, exc
):
    class Raises:
        name = "x"

        async def run(self, *_):
            raise exc

    task_id = _post(client, tee).json()["id"]
    outcome = _run_job(db_session, product_storage, task_id, Raises())
    assert outcome == "requeued", (
        f"{type(exc).__name__} from an engine is treated as permanent 'internal_error'"
    )


def test_engine_returning_garbage_bytes_fails_cleanly(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    class Garbage:
        name = "x"

        async def run(self, *_):
            return b"not an image"

    task_id = _post(client, tee).json()["id"]
    assert _run_job(db_session, product_storage, task_id, Garbage()) == "failed"
    db_session.expire_all()
    task = db_session.get(VtonTask, task_id)
    assert task.status == "failed" and task.result_object is None


# --- 7. cache key ignores the engine ---------------------------------------------


def test_cache_key_depends_on_engine_name():
    keys = []

    class Store:
        def get(self, key):
            keys.append(key)
            raise KeyError(key)

    class Named:
        def __init__(self, name):
            self.name = name

        async def run(self, *_):
            return b""

    person, garment = png_bytes(), garment_png()
    for name in ("mock", "fashn"):
        asyncio.run(
            CachedVtonEngine(Named(name), Store()).run(person, garment, "upper")
        )
    assert keys[0] != keys[1], (
        "same cache key for mock and fashn: a mock result can be served as a real one"
    )


# --- 8. hung engine keeps the registry lock ----------------------------------------


def test_registry_lock_wait_is_bounded():
    import inspect

    from app.features.vton_lab import service as lab

    code = inspect.getsource(lab.EngineRegistry.run)
    assert "timeout" in code, (
        "EngineRegistry.run waits on the global lock with no timeout: one hung "
        "generate() blocks every later request"
    )


# --- 9. body-size cap -----------------------------------------------------------------


def test_oversized_upload_is_rejected_without_buffering_everything(
    client, db_session, mock_user_auth, queue, tee
):
    big = b"\x89PNG\r\n\x1a\n" + b"0" * (30 * 1024 * 1024)
    response = _post(client, tee, payload=big)
    # 413/400/422 are all acceptable; 500 / hang / success are not.
    assert response.status_code in (400, 413, 422)
    if response.status_code == 400:
        assert response.json()["code"] == "image_too_large"


# --- 10. photo validation edge cases --------------------------------------------------


@pytest.mark.parametrize(
    "payload,filename,ctype",
    [
        (b"", "me.png", "image/png"),
        (png_bytes(), "me.png.exe", "image/png"),
        (png_bytes(), "me.png", "image/jpeg"),
        (png_bytes(), "ME.PNG", "IMAGE/PNG"),
        (png_bytes(size=(255, 900)), "me.png", "image/png"),
        (png_bytes(size=(900, 300)), "me.png", "image/png"),
        (b"GIF89a" + b"0" * 100, "me.gif", "image/gif"),
    ],
)
def test_bad_person_photos_never_500(
    client, db_session, mock_user_auth, queue, tee, payload, filename, ctype
):
    response = _post(
        client, tee, payload=payload, filename=filename, content_type=ctype
    )
    assert response.status_code < 500, response.text


def test_truncated_jpeg_is_rejected(client, db_session, mock_user_auth, queue, tee):
    out = BytesIO()
    Image.new("RGB", (400, 600), (10, 200, 30)).save(out, format="JPEG")
    data = out.getvalue()[:-40]
    response = _post(
        client, tee, payload=data, filename="me.jpg", content_type="image/jpeg"
    )
    assert response.status_code == 400


def test_decompression_bomb_dimensions_rejected(
    client, db_session, mock_user_auth, queue, tee
):
    out = BytesIO()
    Image.new("1", (9000, 9000)).save(out, format="PNG")
    response = _post(client, tee, payload=out.getvalue())
    assert response.status_code == 400
    assert response.json()["code"] == "image_dimensions_exceeded"


# --- 11. state machine --------------------------------------------------------------------


def test_duplicate_job_delivery_runs_engine_once(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    calls = []

    class Counting:
        name = "x"

        async def run(self, person, garment, cloth_type):
            calls.append(1)
            return await MockVtonEngine().run(person, garment, cloth_type)

    task_id = _post(client, tee).json()["id"]
    assert _run_job(db_session, product_storage, task_id, Counting()) == "succeeded"
    assert _run_job(db_session, product_storage, task_id, Counting()) == "skipped"
    assert len(calls) == 1


def test_delete_while_queued_cancels_and_job_is_skipped(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    task_id = _post(client, tee).json()["id"]
    assert client.delete(f"/api/v1/vton/tasks/{task_id}").status_code == 204
    assert _run_job(db_session, product_storage, task_id) == "skipped"
    db_session.expire_all()
    task = db_session.get(VtonTask, task_id)
    assert task.status == "failed" and task.result_object is None


def test_cancelled_task_does_not_block_new_one(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    task_id = _post(client, tee).json()["id"]
    client.delete(f"/api/v1/vton/tasks/{task_id}")
    assert _post(client, tee).status_code == 202


def test_late_success_does_not_overwrite_a_cancelled_task(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    """User deletes while the engine is running (race window after status check)."""

    class SlowThenDelete:
        name = "x"

        async def run(self, person, garment, cloth_type):
            out = await MockVtonEngine().run(person, garment, cloth_type)
            # purge happens here, in the middle of processing
            task = db_session.get(VtonTask, task_id)
            task.person_object = None
            task.purged_at = service.utcnow()
            task.status = "failed"
            task.error_code = "cancelled"
            db_session.commit()
            return out

    task_id = _post(client, tee).json()["id"]
    _run_job(db_session, product_storage, task_id, SlowThenDelete())
    db_session.expire_all()
    task = db_session.get(VtonTask, task_id)
    assert not (task.status == "succeeded" and task.purged_at is not None), (
        "worker resurrected a purged task as 'succeeded' and stored a result "
        "object after the user erased it"
    )


def test_quota_counts_only_window_and_blocks_at_limit(
    client, db_session, mock_user_auth, queue, tee
):
    settings = get_settings()
    for i in range(settings.vton_daily_quota):
        _make_task(db_session, mock_user_auth, tee, f"done-{i}", status="succeeded")
    response = _post(client, tee)
    assert response.status_code == 429
    assert response.json()["code"] == "vton_quota_exceeded"


def test_quota_is_not_charged_when_photo_is_rejected(
    client, db_session, mock_user_auth, queue, tee
):
    before = client.get("/api/v1/vton/quota").json()["used"]
    assert _post(client, tee, payload=b"junk").status_code == 400
    assert client.get("/api/v1/vton/quota").json()["used"] == before


def test_other_users_task_is_invisible(client, db_session, mock_user_auth, queue, tee):
    from app.features.users.model import User

    other = User(
        id=456,
        username="other",
        email="o@test.com",
        password_hash="x",
        role="customer",
        first_name="O",
        last_name="T",
    )
    db_session.add(other)
    db_session.commit()
    _make_task(db_session, other, tee, "theirs")
    assert client.get("/api/v1/vton/tasks/theirs").status_code == 404
    assert client.get("/api/v1/vton/tasks/theirs/person").status_code == 404
    assert client.delete("/api/v1/vton/tasks/theirs").status_code == 404


def test_path_traversal_task_id_is_404(client, db_session, mock_user_auth):
    assert client.get("/api/v1/vton/tasks/..%2F..%2Fetc").status_code in (404, 422)


# --- 12. cached engine --------------------------------------------------------------------


def test_cache_storage_failure_falls_back_to_compute(product_storage):
    class Down:
        def get(self, _):
            raise ConnectionError("down")

    engine = CachedVtonEngine(MockVtonEngine(), Down())
    out = asyncio.run(engine.run(png_bytes(), garment_png(), "upper"))
    assert Image.open(BytesIO(out)).size == (768, 1024)


# --- 13. mock engine on hostile garments ----------------------------------------------------


def test_mock_engine_rejects_blank_garment():
    blank = BytesIO()
    Image.new("RGB", (300, 300), (255, 255, 255)).save(blank, format="PNG")
    with pytest.raises(VtonEngineError) as info:
        asyncio.run(MockVtonEngine().run(png_bytes(), blank.getvalue(), "upper"))
    assert info.value.code == "invalid_input" and not info.value.retryable


def test_mock_engine_full_frame_garment_is_not_treated_as_empty():
    """A garment photographed on a coloured background that fills the frame."""
    img = Image.new("RGB", (300, 300), (30, 30, 200))
    out = BytesIO()
    img.save(out, format="PNG")
    try:
        asyncio.run(MockVtonEngine().run(png_bytes(), out.getvalue(), "upper"))
    except VtonEngineError as error:
        pytest.fail(
            f"solid-colour garment photo rejected as '{error.code}' "
            "(floodfill from corner erases it)"
        )


def test_mock_engine_garment_with_transparent_background():
    img = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
    for x in range(60, 240):
        for y in range(40, 260):
            img.putpixel((x, y), (200, 20, 20, 255))
    out = BytesIO()
    img.save(out, format="PNG")
    result = asyncio.run(MockVtonEngine().run(png_bytes(), out.getvalue(), "upper"))
    assert Image.open(BytesIO(result)).size == (768, 1024)


def test_mock_engine_garbage_input_is_permanent_invalid_input():
    with pytest.raises(VtonEngineError) as info:
        asyncio.run(MockVtonEngine().run(b"zzz", garment_png(), "upper"))
    assert info.value.code == "invalid_input" and not info.value.retryable


def test_mock_engine_handles_concurrent_runs():
    async def many():
        return await asyncio.gather(
            *[
                MockVtonEngine().run(png_bytes(), garment_png(), "upper")
                for _ in range(4)
            ]
        )

    results = asyncio.run(many())
    assert len({len(r) for r in results}) == 1


def test_threads_do_not_leak_after_runs():
    before = threading.active_count()
    asyncio.run(MockVtonEngine().run(png_bytes(), garment_png(), "lower"))
    assert threading.active_count() - before <= 2
