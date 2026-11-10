import asyncio
from datetime import timedelta
from io import BytesIO
from types import SimpleNamespace

import pytest
from PIL import Image

from app.core.config import get_settings
from app.core.rate_limiter import limiter
from app.features.categories.model import Category
from app.features.products.model import ProductImage
from app.features.vton import service
from app.features.vton.mapping import cloth_type_for_category, pick_garment_image
from app.features.vton.model import VtonTask
from app.integrations.vton_engine import MockVtonEngine, VtonEngineError
from app.jobs import vton as vton_jobs
from tests.factories import make_product


def png_bytes(size=(512, 768), color=(120, 140, 160)) -> bytes:
    out = BytesIO()
    Image.new("RGB", size, color).save(out, format="PNG")
    return out.getvalue()


def garment_png() -> bytes:
    image = Image.new("RGB", (400, 500), (255, 255, 255))
    for x in range(80, 320):
        for y in range(60, 440):
            image.putpixel((x, y), (200, 30, 30))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class RecordingQueue:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    async def enqueue(self, task_name, *args, queue_name=None, job_id=None):
        if self.fail:
            raise RuntimeError("redis down")
        self.calls.append((task_name, args, queue_name, job_id))


@pytest.fixture(autouse=True)
def _reset_limiter():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def queue(client):
    from app.main import app

    original = app.state.task_queue
    app.state.task_queue = RecordingQueue()
    yield app.state.task_queue
    app.state.task_queue = original


def _category(db, slug, parent=None):
    category = Category(name=slug, slug=slug, parent_id=parent.id if parent else None)
    db.add(category)
    db.flush()
    return category


@pytest.fixture
def tee(db_session, product_storage):
    category = _category(db_session, "ao-thun")
    product = make_product(
        db_session,
        name="Vton Tee",
        category_id=category.id,
        auto_create_variant=False,
    )
    from tests.factories import make_variant

    variant = make_variant(
        db_session, product_id=product.id, size="M", color_name="Đỏ", stock_quantity=5
    )
    object_name = "products/demo/tee-do.png"
    product_storage.put(object_name, BytesIO(garment_png()), "image/png")
    db_session.add(
        ProductImage(
            id="img-tee-do",
            product_id=product.id,
            object_name=object_name,
            kind="vton_garment",
            color_name="Đỏ",
        )
    )
    db_session.commit()
    return SimpleNamespace(product=product, variant=variant, garment=object_name)


def _post(client, tee, **overrides):
    data = {"product_id": str(tee.product.id), "variant_id": str(tee.variant.id)}
    data["consent"] = overrides.pop("consent", "true")
    files = {
        "person_image": (
            overrides.pop("filename", "me.png"),
            overrides.pop("payload", png_bytes()),
            overrides.pop("content_type", "image/png"),
        )
    }
    return client.post(
        "/api/v1/vton/tasks",
        data=data,
        files=files,
        headers=overrides.pop("headers", {}),
    )


# --- mapping -----------------------------------------------------------------


def test_category_mapping_is_explicit_and_unsupported_by_default(db_session):
    parent = _category(db_session, "vay-dam")
    dress = _category(db_session, "dam-da-hoi", parent)
    other = _category(db_session, "phu-kien-khac", parent)
    unknown_parent = _category(db_session, "ao")
    custom_child = _category(db_session, "ao-ba-lo", unknown_parent)

    assert cloth_type_for_category(dress) == "overall"
    assert cloth_type_for_category(custom_child) == "upper"
    assert cloth_type_for_category(other) is None
    assert cloth_type_for_category(None) is None


def test_garment_picker_requires_raster_and_matching_colour():
    def img(name, kind="flat_lay", color=None, order=0):
        return SimpleNamespace(
            object_name=name, kind=kind, color_name=color, sort_order=order
        )

    svg = img("products/demo/a.svg")
    red = img("products/a-red.png", "vton_garment", "Đỏ")
    generic = img("products/a.jpg")
    assert pick_garment_image([svg], None) is None
    assert pick_garment_image([svg, generic], "Đỏ") is generic
    assert pick_garment_image([svg, generic, red], "đỏ") is red
    assert pick_garment_image([red], "Xanh") is None
    assert pick_garment_image([img("x.png", "model_photo")], None) is None


# --- eligibility ---------------------------------------------------------------


def test_eligibility_reports_support_and_reasons(client, db_session, tee):
    ok = client.get(f"/api/v1/vton/products/{tee.product.id}/eligibility?color=Đỏ")
    assert ok.status_code == 200
    assert ok.json()["eligible"] is True
    assert ok.json()["cloth_type"] == "upper"

    wrong_color = client.get(
        f"/api/v1/vton/products/{tee.product.id}/eligibility?color=Xanh"
    )
    assert wrong_color.json() == {
        **wrong_color.json(),
        "eligible": False,
        "reason": "garment_image_missing",
    }

    plain = make_product(db_session, name="No category")
    db_session.commit()
    unsupported = client.get(f"/api/v1/vton/products/{plain.id}/eligibility")
    assert unsupported.json()["reason"] == "category_unsupported"


def test_cloth_types_setting_limits_try_on(client, db_session, monkeypatch, tee):
    jeans = make_product(
        db_session,
        name="Vton Jeans",
        category_id=_category(db_session, "quan-jeans").id,
    )
    db_session.add(
        ProductImage(
            id="img-jeans",
            product_id=jeans.id,
            object_name="products/demo/jeans.png",
            kind="vton_garment",
        )
    )
    db_session.commit()
    original = client.app.state.settings
    limited = original.model_copy(update={"vton_cloth_types": "upper"})
    monkeypatch.setattr(client.app.state, "settings", limited)

    lower = client.get(f"/api/v1/vton/products/{jeans.id}/eligibility").json()
    assert lower["eligible"] is False
    assert lower["reason"] == "cloth_type_disabled"
    upper = client.get(f"/api/v1/vton/products/{tee.product.id}/eligibility").json()
    assert upper["eligible"] is True


# --- task creation -------------------------------------------------------------


def test_create_task_requires_login(client, tee):
    assert _post(client, tee).status_code == 401


def test_create_task_requires_consent(client, mock_user_auth, queue, tee):
    response = _post(client, tee, consent="false")
    assert response.status_code == 400
    assert response.json()["code"] == "consent_required"
    assert queue.calls == []


def test_create_task_stores_private_stripped_photo_and_enqueues(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    response = _post(client, tee)
    assert response.status_code == 202, response.text
    body = response.json()
    assert body["status"] == "queued"
    assert body["cloth_type"] == "upper"
    assert "person_object" not in body and "result_object" not in body

    task = db_session.get(VtonTask, body["id"])
    assert task.person_object.startswith("vton/people/")
    assert not task.person_object.startswith("products/")
    assert task.garment_object == tee.garment
    assert task.consent_at is not None
    assert queue.calls == [("process_vton_task", (task.id,), "vton", task.id)]
    stored = Image.open(BytesIO(product_storage.get(task.person_object)))
    assert stored.format == "JPEG"
    assert not stored.getexif()


@pytest.mark.parametrize(
    ("kwargs", "code"),
    [
        ({"payload": b"not an image", "filename": "x.png"}, "invalid_person_image"),
        (
            {"payload": png_bytes((100, 200)), "filename": "x.png"},
            "person_image_too_small",
        ),
        (
            {"payload": png_bytes((600, 300)), "filename": "x.png"},
            "person_image_not_portrait",
        ),
        (
            {"payload": png_bytes(), "filename": "x.gif", "content_type": "image/gif"},
            "invalid_person_image",
        ),
    ],
)
def test_create_task_rejects_bad_photos(
    client, mock_user_auth, queue, tee, kwargs, code
):
    response = _post(client, tee, **kwargs)
    assert response.status_code == 400
    assert response.json()["code"] == code
    assert queue.calls == []


def test_create_task_rejects_unsupported_product_and_foreign_variant(
    client, db_session, mock_user_auth, queue, tee
):
    plain = make_product(db_session, name="Plain")
    db_session.commit()
    response = client.post(
        "/api/v1/vton/tasks",
        data={"product_id": str(plain.id), "consent": "true"},
        files={"person_image": ("me.png", png_bytes(), "image/png")},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "vton_unsupported_product"

    other = make_product(db_session, name="Other")
    db_session.commit()
    response = client.post(
        "/api/v1/vton/tasks",
        data={
            "product_id": str(tee.product.id),
            "variant_id": str(other.variants[0].id),
            "consent": "true",
        },
        files={"person_image": ("me.png", png_bytes(), "image/png")},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "variant_not_found"


def test_only_one_active_task_and_idempotent_replay(client, mock_user_auth, queue, tee):
    first = _post(client, tee, headers={"Idempotency-Key": "abc-123"})
    assert first.status_code == 202
    replay = _post(client, tee, headers={"Idempotency-Key": "abc-123"})
    assert replay.status_code == 202
    assert replay.json()["id"] == first.json()["id"]
    assert len(queue.calls) == 1

    second = _post(client, tee, headers={"Idempotency-Key": "other"})
    assert second.status_code == 409
    assert second.json()["code"] == "vton_task_in_progress"


def test_daily_quota_is_enforced(client, db_session, mock_user_auth, queue, tee):
    limit = get_settings().vton_daily_quota
    for _ in range(limit):
        db_session.add(
            VtonTask(
                id=f"old-{_}",
                user_id=mock_user_auth.id,
                product_id=tee.product.id,
                cloth_type="upper",
                status="succeeded",
                engine="mock",
                garment_object=tee.garment,
                consent_at=service.utcnow(),
                created_at=service.utcnow() - timedelta(hours=2),
            )
        )
    db_session.commit()
    quota = client.get("/api/v1/vton/quota").json()
    assert quota["remaining"] == 0

    response = _post(client, tee)
    assert response.status_code == 429
    assert response.json()["code"] == "vton_quota_exceeded"


def test_enqueue_failure_keeps_durable_task_for_recovery(
    client, db_session, mock_user_auth, queue, tee
):
    queue.fail = True
    response = _post(client, tee)
    assert response.status_code == 202
    task = db_session.get(VtonTask, response.json()["id"])
    assert task.status == "queued"
    task.created_at = service.utcnow() - timedelta(minutes=5)
    db_session.commit()
    assert vton_jobs.recover_vton_tasks(db_session, get_settings()) == [task.id]


# --- worker + ownership --------------------------------------------------------


def _run_job(db_session, product_storage, task_id, engine=None):
    return asyncio.run(
        vton_jobs.process_vton_task(
            db_session,
            product_storage,
            engine or MockVtonEngine(),
            get_settings(),
            task_id,
        )
    )


def test_full_flow_with_mock_engine_and_private_download(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    task_id = _post(client, tee).json()["id"]
    assert _run_job(db_session, product_storage, task_id) == "succeeded"
    assert _run_job(db_session, product_storage, task_id) == "skipped"

    body = client.get(f"/api/v1/vton/tasks/{task_id}").json()
    assert body["status"] == "succeeded"
    assert body["has_result"] is True

    result = client.get(f"/api/v1/vton/tasks/{task_id}/result")
    assert result.status_code == 200
    assert result.headers["content-type"] == "image/png"
    assert result.headers["cache-control"] == "private, no-store"
    assert Image.open(BytesIO(result.content)).size == (768, 1024)
    assert client.get(f"/api/v1/vton/tasks/{task_id}/person").status_code == 200

    listing = client.get("/api/v1/vton/tasks").json()
    assert listing["total"] == 1


def test_other_users_cannot_read_or_delete_a_task(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    from app.core.security import get_current_user
    from app.features.users.model import User
    from app.main import app

    task_id = _post(client, tee).json()["id"]
    _run_job(db_session, product_storage, task_id)

    stranger = User(
        id=777,
        username="stranger",
        email="stranger@test.com",
        password_hash="x",
        role="customer",
    )
    db_session.add(stranger)
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: stranger
    for method, path in (
        ("get", f"/api/v1/vton/tasks/{task_id}"),
        ("get", f"/api/v1/vton/tasks/{task_id}/result"),
        ("get", f"/api/v1/vton/tasks/{task_id}/person"),
        ("delete", f"/api/v1/vton/tasks/{task_id}"),
    ):
        assert getattr(client, method)(path).status_code == 404, path
    assert client.get("/api/v1/vton/tasks").json()["total"] == 0


def test_delete_erases_objects_but_keeps_quota_row(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    task_id = _post(client, tee).json()["id"]
    _run_job(db_session, product_storage, task_id)
    task = db_session.get(VtonTask, task_id)
    person, result = task.person_object, task.result_object

    assert client.delete(f"/api/v1/vton/tasks/{task_id}").status_code == 204
    assert {person, result} <= set(product_storage.deleted)
    assert client.get(f"/api/v1/vton/tasks/{task_id}").status_code == 404
    assert client.get("/api/v1/vton/quota").json()["used"] == 1


def test_non_retryable_engine_error_fails_task(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    class NoPerson:
        name = "x"

        async def run(self, *_):
            raise VtonEngineError("none", code="no_person_detected", retryable=False)

    task_id = _post(client, tee).json()["id"]
    assert _run_job(db_session, product_storage, task_id, NoPerson()) == "failed"
    db_session.expire_all()
    task = db_session.get(VtonTask, task_id)
    assert (task.status, task.error_code) == ("failed", "no_person_detected")


def test_retryable_engine_error_requeues_until_attempts_exhausted(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    class Flaky:
        name = "x"

        async def run(self, *_):
            raise VtonEngineError("boom", code="engine_error", retryable=True)

    task_id = _post(client, tee).json()["id"]
    attempts = get_settings().vton_max_attempts
    outcomes = []
    for _ in range(attempts):
        outcomes.append(_run_job(db_session, product_storage, task_id, Flaky()))
        db_session.expire_all()
    assert outcomes == ["requeued"] * (attempts - 1) + ["failed"]
    assert db_session.get(VtonTask, task_id).error_code == "engine_error"


def test_engine_still_starting_waits_without_burning_attempts(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    class Down:
        name = "x"

        async def run(self, *_):
            raise VtonEngineError("down", code="engine_unavailable", retryable=True)

    task_id = _post(client, tee).json()["id"]
    for _ in range(get_settings().vton_max_attempts + 2):
        assert _run_job(db_session, product_storage, task_id, Down()) == "requeued"
        db_session.expire_all()
    task = db_session.get(VtonTask, task_id)
    assert (task.status, task.attempts) == ("queued", 0)

    # ...but never forever: past the stale threshold, normal attempts apply again.
    task.created_at = service.utcnow() - timedelta(
        minutes=get_settings().vton_stale_processing_minutes + 1
    )
    db_session.commit()
    outcomes = []
    for _ in range(get_settings().vton_max_attempts):
        outcomes.append(_run_job(db_session, product_storage, task_id, Down()))
        db_session.expire_all()
    assert outcomes[-1] == "failed"
    assert db_session.get(VtonTask, task_id).error_code == "engine_unavailable"


def test_missing_garment_object_fails_with_clear_code(
    client, db_session, mock_user_auth, queue, product_storage, tee
):
    task_id = _post(client, tee).json()["id"]
    task = db_session.get(VtonTask, task_id)
    task.garment_object = "products/gone.png"
    db_session.commit()
    assert _run_job(db_session, product_storage, task_id) == "failed"
    db_session.expire_all()
    assert db_session.get(VtonTask, task_id).error_code == "garment_unavailable"


def test_recovery_fails_or_requeues_stale_processing_tasks(
    client, db_session, mock_user_auth, queue, tee
):
    settings = get_settings()
    stale = service.utcnow() - timedelta(
        minutes=settings.vton_stale_processing_minutes + 1
    )

    def make(task_id, attempts):
        db_session.add(
            VtonTask(
                id=task_id,
                user_id=mock_user_auth.id,
                product_id=tee.product.id,
                cloth_type="upper",
                status="processing",
                engine="mock",
                attempts=attempts,
                garment_object=tee.garment,
                consent_at=stale,
                created_at=stale,
                started_at=stale,
            )
        )

    make("stuck-retry", 1)
    make("stuck-final", settings.vton_max_attempts)
    db_session.commit()
    requeue = vton_jobs.recover_vton_tasks(db_session, settings)
    assert requeue == ["stuck-retry"]
    assert db_session.get(VtonTask, "stuck-final").error_code == "engine_timeout"


def test_retention_purges_old_finished_tasks(
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

    purged = asyncio.run(
        vton_jobs.purge_expired_vton_data(db_session, product_storage, get_settings())
    )
    assert purged == 1
    assert {person, result} <= set(product_storage.deleted)
    db_session.expire_all()
    task = db_session.get(VtonTask, task_id)
    assert task.person_object is None and task.result_object is None
    assert task.purged_at is not None


def test_mock_engine_output_is_visibly_labelled_demo():
    async def run():
        return await MockVtonEngine().run(png_bytes(), garment_png(), "upper")

    image = Image.open(BytesIO(asyncio.run(run())))
    assert image.size == (768, 1024)
    # Banner strip at the bottom is dark slate, never the person photo.
    assert sum(image.getpixel((400, 1010))[:3]) < 200


def test_default_timeouts_allow_long_generation_and_stay_consistent():
    settings = get_settings()
    assert settings.vton_service_timeout_seconds >= 3600
    # Recovery must never fail a task that is still legitimately running.
    assert (
        settings.vton_stale_processing_minutes * 60
        > settings.vton_service_timeout_seconds + 60
    )


def test_settings_reject_stale_threshold_below_engine_timeout():
    from app.core.config import Settings

    base = get_settings().model_dump()
    base["vton_stale_processing_minutes"] = 5
    base["vton_service_timeout_seconds"] = 3600
    with pytest.raises(ValueError, match="vton_stale_processing_minutes"):
        Settings.model_validate(base)


def test_vton_worker_alone_can_configure_all_mappers():
    """The worker container never imports the routers; it must map every model itself."""
    import os
    import subprocess
    import sys

    code = (
        "import app.vton_worker\n"
        "from sqlalchemy.orm import configure_mappers\n"
        "configure_mappers()\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        env={**os.environ},
    )
    assert result.returncode == 0, result.stderr[-800:]
