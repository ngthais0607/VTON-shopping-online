import io
import json

import httpx
import pytest
from PIL import Image

from app.core.errors import BusinessRuleError
from app.features.vton_lab import service
from app.features.vton_lab.engines import ENGINE_TYPES, TryOnRequest, build_engine
from app.features.vton_lab.errors import VtonConfigError, VtonEngineError
from app.features.vton_lab.images import garment_mask, letterbox, unletterbox


def _png(size=(256, 384), color=(120, 160, 200)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, format="PNG")
    return out.getvalue()


def _garment_png() -> bytes:
    image = Image.new("RGB", (300, 300), (255, 255, 255))
    image.paste((200, 30, 30), (60, 40, 240, 260))
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


@pytest.fixture(autouse=True)
def fresh_registry():
    service.reset_registry()
    yield
    service.reset_registry()


def _post(client, **data):
    return client.post(
        "/api/v1/vton-lab/try-on",
        files={
            "person": ("p.png", _png(), "image/png"),
            "garment": ("g.png", _garment_png(), "image/png"),
        },
        data=data,
    )


def test_all_builtin_engine_types_are_registered():
    assert {"mock", "catvton_http", "gradio_space", "dmvton_cpu", "fashn_api"} <= set(
        ENGINE_TYPES
    )


def test_mock_engine_returns_png_with_timing_headers(client, mock_admin_auth):
    response = _post(client, cloth_type="upper")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-vton-engine"] == "mock"
    assert int(response.headers["x-vton-elapsed-ms"]) >= 0
    assert response.headers["cache-control"] == "private, no-store"
    assert Image.open(io.BytesIO(response.content)).size == (256, 384)


def test_list_engines_requires_admin(client, mock_user_auth):
    assert client.get("/api/v1/vton-lab/engines").status_code == 403


def test_try_on_requires_admin(client, mock_user_auth):
    assert _post(client).status_code == 403


def test_list_engines_includes_mock_as_default(client, mock_admin_auth):
    response = client.get("/api/v1/vton-lab/engines")
    assert response.status_code == 200
    (mock,) = [e for e in response.json() if e["name"] == "mock"]
    assert mock["is_default"] is True
    assert mock["sends_images_off_host"] is False


def test_unknown_engine_is_404(client, mock_admin_auth):
    response = _post(client, engine="nope")
    assert response.status_code == 404
    assert response.json()["code"] == "vton_engine_not_found"


def test_invalid_cloth_type_is_400(client, mock_admin_auth):
    response = _post(client, cloth_type="hat")
    assert response.status_code == 400
    assert response.json()["code"] == "vton_invalid_cloth_type"


def test_non_image_upload_is_400(client, mock_admin_auth):
    response = client.post(
        "/api/v1/vton-lab/try-on",
        files={
            "person": ("p.png", b"not an image", "image/png"),
            "garment": ("g.png", _garment_png(), "image/png"),
        },
    )
    assert response.status_code == 400
    assert response.json()["code"] == "vton_invalid_image"


def test_tiny_image_is_rejected(client, mock_admin_auth):
    response = client.post(
        "/api/v1/vton-lab/try-on",
        files={
            "person": ("p.png", _png((64, 64)), "image/png"),
            "garment": ("g.png", _garment_png(), "image/png"),
        },
    )
    assert response.status_code == 400


def test_registry_loads_engines_file(tmp_path):
    path = tmp_path / "engines.json"
    path.write_text(
        json.dumps(
            {
                "default": "cat",
                "engines": {"cat": {"type": "catvton_http", "url": "http://x"}},
            }
        ),
        encoding="utf-8",
    )
    registry = service.load_registry(str(path))
    assert registry.default == "cat"
    assert registry.names() == ["cat", "mock"]


def test_registry_rejects_unknown_type_and_bad_default(tmp_path):
    path = tmp_path / "engines.json"
    path.write_text(json.dumps({"engines": {"x": {"type": "???"}}}), encoding="utf-8")
    with pytest.raises(VtonConfigError):
        service.load_registry(str(path))
    with pytest.raises(VtonConfigError):
        service.load_registry("", default="missing")


def test_registry_missing_file_is_config_error(tmp_path):
    with pytest.raises(VtonConfigError):
        service.load_registry(str(tmp_path / "absent.json"))


def test_catvton_http_engine_posts_to_service(monkeypatch):
    seen = {}

    def fake_post(url, **kwargs):
        seen["url"] = url
        seen["data"] = kwargs["data"]
        return httpx.Response(200, content=_png())

    monkeypatch.setattr(httpx, "post", fake_post)
    engine = build_engine("cat", {"type": "catvton_http", "url": "http://svc:8080/"})
    request = TryOnRequest(
        person=Image.new("RGB", (256, 384)),
        garment=Image.new("RGB", (256, 256)),
        cloth_type="lower",
    )
    assert engine.generate(request).size == (256, 384)
    assert seen["url"] == "http://svc:8080/v1/tryon"
    assert seen["data"] == {"cloth_type": "lower"}


def test_catvton_http_engine_maps_failures(monkeypatch):
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: httpx.Response(422, content=b"no person")
    )
    engine = build_engine("cat", {"type": "catvton_http", "url": "http://svc"})
    request = TryOnRequest(Image.new("RGB", (256, 384)), Image.new("RGB", (256, 256)))
    with pytest.raises(VtonEngineError):
        engine.generate(request)

    def refuse(*args, **kwargs):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "post", refuse)
    with pytest.raises(VtonEngineError):
        engine.generate(request)


def test_engine_without_required_option_fails_clearly():
    engine = build_engine("cat", {"type": "catvton_http"})
    request = TryOnRequest(Image.new("RGB", (256, 384)), Image.new("RGB", (256, 256)))
    with pytest.raises(VtonConfigError):
        engine.generate(request)


def test_dmvton_engine_rejects_non_upper_garments(client, mock_admin_auth, tmp_path):
    path = tmp_path / "engines.json"
    path.write_text(
        json.dumps({"engines": {"dm": {"type": "dmvton_cpu", "repo": "x"}}}),
        encoding="utf-8",
    )
    service._registry = service.load_registry(str(path))
    response = _post(client, engine="dm", cloth_type="lower")
    assert response.status_code == 400
    assert response.json()["code"] == "vton_cloth_type_unsupported"


def test_letterbox_round_trip_keeps_aspect_ratio():
    source = Image.new("RGB", (400, 300), (10, 20, 30))
    boxed, box = letterbox(source, 192, 256)
    assert boxed.size == (192, 256)
    assert box[2] / box[3] == pytest.approx(400 / 300, rel=0.02)
    assert unletterbox(boxed, box, (400, 300)).size == (400, 300)


def test_garment_mask_selects_non_white_pixels():
    image = Image.new("RGB", (100, 100), (255, 255, 255))
    image.paste((10, 10, 10), (30, 30, 70, 70))
    mask = garment_mask(image)
    assert mask.getpixel((50, 50)) == 255
    assert mask.getpixel((5, 5)) == 0


def test_cost_volume_matches_naive_reference():
    torch = pytest.importorskip("torch")
    from app.features.vton_lab.engines.dmvton_cpu import cost_volume

    torch.manual_seed(0)
    first = torch.randn(1, 4, 6, 5)
    second = torch.randn(1, 4, 6, 5)
    out = cost_volume(first, second)
    assert out.shape == (1, 49, 6, 5)
    for k in (0, 10, 24, 48):
        dy, dx = k // 7 - 3, k % 7 - 3
        for y, x in ((0, 0), (3, 2), (5, 4)):
            y2, x2 = y + dy, x + dx
            expected = (
                (first[0, :, y, x] * second[0, :, y2, x2]).mean()
                if 0 <= y2 < 6 and 0 <= x2 < 5
                else torch.tensor(0.0)
            )
            assert out[0, k, y, x] == pytest.approx(expected.item(), abs=1e-5)


def _adapter(tmp_path, spec):
    from app.features.vton_lab.adapter import LabVtonEngine

    path = tmp_path / "engines.json"
    path.write_text(json.dumps({"default": "x", "engines": {"x": spec}}), "utf-8")
    return LabVtonEngine(service.load_registry(str(path)), None)


def test_task_pipeline_can_run_a_lab_engine(monkeypatch):
    import asyncio

    from app.core.config import Settings
    from app.integrations.vton_engine import create_vton_engine

    engine = create_vton_engine(Settings(vton_engine="lab"))
    assert engine.name == "lab"
    output = asyncio.run(engine.run(_png(), _garment_png(), "upper"))
    assert Image.open(io.BytesIO(output)).size == (256, 384)


def test_lab_adapter_maps_failures_to_task_errors(tmp_path, monkeypatch):
    import asyncio

    from app.integrations.vton_engine import VtonEngineError as TaskError

    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(500))
    engine = _adapter(tmp_path, {"type": "catvton_http", "url": "http://svc"})
    with pytest.raises(TaskError) as engine_failed:
        asyncio.run(engine.run(_png(), _garment_png(), "upper"))
    assert engine_failed.value.retryable is True

    with pytest.raises(TaskError) as bad_input:
        asyncio.run(engine.run(b"nope", _garment_png(), "upper"))
    assert bad_input.value.code == "invalid_input"
    assert bad_input.value.retryable is False

    broken = _adapter(tmp_path, {"type": "catvton_http"})
    with pytest.raises(TaskError) as misconfigured:
        asyncio.run(broken.run(_png(), _garment_png(), "upper"))
    assert misconfigured.value.code == "engine_misconfigured"


def test_person_bbox_and_upper_body_crop():
    from app.features.vton_lab.images import person_bbox, upper_body_box

    image = Image.new("RGB", (400, 600), (230, 230, 230))
    image.paste((20, 20, 20), (150, 60, 250, 560))  # a dark "person"
    left, top, width, height = person_bbox(image)
    assert abs(left - 150) < 12 and abs(top - 60) < 12
    assert abs(width - 100) < 20 and abs(height - 500) < 20
    x, y, w, h = upper_body_box(image.size, (left, top, width, height))
    assert w / h == pytest.approx(0.75, abs=0.02)
    assert 0 <= x and x + w <= 400 and 0 <= y and y + h <= 600
    assert y <= top + 5  # starts near the head


def test_person_bbox_is_none_on_plain_background():
    from app.features.vton_lab.images import person_bbox

    assert person_bbox(Image.new("RGB", (300, 300), (200, 200, 200))) is None


def test_paste_back_keeps_original_pixels_outside_changed_region():
    pytest.importorskip("numpy")
    from app.features.vton_lab.engines.dmvton_cpu import _paste_changed_region

    original = Image.new("RGB", (192, 256), (50, 100, 150))
    base = Image.new("RGB", (192, 256), (50, 100, 150))
    generated = base.copy()
    generated.paste((250, 0, 0), (70, 100, 120, 160))
    out = _paste_changed_region(original, base, generated)
    assert out.getpixel((5, 5)) == (50, 100, 150)
    assert out.getpixel((95, 130))[0] > 200


def test_fallback_engine_uses_next_when_first_fails():
    from PIL import Image

    from app.features.vton_lab.engines import TryOnRequest, build_engine

    engine = build_engine(
        "chain",
        {
            "type": "fallback",
            "engines": [
                {"type": "catvton_http", "url": "http://127.0.0.1:9", "timeout": 1},
                {"type": "mock"},
            ],
        },
    )
    engine.load()
    image = engine.generate(
        TryOnRequest(
            Image.new("RGB", (300, 400), "gray"), Image.new("RGB", (200, 200), "red")
        )
    )
    assert image.size == (300, 400)


def test_cached_engine_serves_prewarmed_and_never_stores_user_photos():
    import asyncio

    from app.integrations.vton_engine import CachedVtonEngine, cache_key

    class Store:
        def __init__(self):
            self.data = {}

        def get(self, name):
            return self.data[name]

        def put(self, name, stream, content_type):
            self.data[name] = stream.read()

    class Inner:
        name = "inner"
        calls = 0

        async def run(self, person, garment, cloth_type):
            Inner.calls += 1
            return b"png"

    store = Store()
    reader = CachedVtonEngine(Inner(), store)
    asyncio.run(reader.run(b"p", b"g", "upper"))
    assert store.data == {} and Inner.calls == 1  # runtime is read-only

    writer = CachedVtonEngine(Inner(), store, write=True)
    asyncio.run(writer.run(b"p", b"g", "upper"))
    assert list(store.data) == [cache_key(b"p", b"g", "upper")]
    assert asyncio.run(reader.run(b"p", b"g", "upper")) == b"png"
    assert Inner.calls == 2  # second read was a cache hit


# --- fashn_api -------------------------------------------------------------


def _fashn(monkeypatch, handler, **options):
    monkeypatch.setenv("FASHN_API_KEY", "test-key")
    return build_engine(
        "fashn",
        {
            "type": "fashn_api",
            "transport": httpx.MockTransport(handler),
            "poll_interval_s": 0,
            **options,
        },
    )


def _fashn_request(cloth_type="upper"):
    return TryOnRequest(
        person=Image.new("RGB", (256, 384)),
        garment=Image.new("RGB", (256, 256)),
        cloth_type=cloth_type,
    )


def test_fashn_engine_submits_polls_and_decodes_base64(monkeypatch):
    import base64

    seen = {}
    polls = iter(["processing", "completed"])

    def handler(request):
        if request.url.path == "/v1/run":
            seen["auth"] = request.headers["authorization"]
            seen["body"] = json.loads(request.content)
            return httpx.Response(200, json={"id": "abc", "error": None})
        assert request.url.path == "/v1/status/abc"
        status = next(polls)
        output = ["data:image/png;base64," + base64.b64encode(_png()).decode()]
        return httpx.Response(
            200,
            json={"id": "abc", "status": status, "output": output, "error": None},
        )

    engine = _fashn(monkeypatch, handler, mode="quality")
    image = engine.generate(_fashn_request("lower"))
    assert image.size == (256, 384)
    assert seen["auth"] == "Bearer test-key"
    inputs = seen["body"]["inputs"]
    assert seen["body"]["model_name"] == "tryon-v1.6"
    assert inputs["category"] == "bottoms"
    assert inputs["mode"] == "quality"
    assert inputs["model_image"].startswith("data:image/jpeg;base64,")


def test_fashn_engine_downloads_cdn_output_without_key(monkeypatch):
    def handler(request):
        if request.url.path == "/v1/run":
            return httpx.Response(200, json={"id": "j"})
        return httpx.Response(
            200, json={"status": "completed", "output": ["https://cdn.x/o.png"]}
        )

    seen = {}

    def fake_get(url, **kwargs):
        seen["url"], seen["kwargs"] = url, kwargs
        return httpx.Response(200, content=_png())

    monkeypatch.setattr(httpx, "get", fake_get)
    engine = _fashn(monkeypatch, handler)
    assert engine.generate(_fashn_request()).size == (256, 384)
    assert seen["url"] == "https://cdn.x/o.png"
    assert "headers" not in seen["kwargs"]


def test_fashn_engine_requires_key(monkeypatch):
    monkeypatch.delenv("FASHN_API_KEY", raising=False)
    monkeypatch.setattr(
        "app.features.vton_lab.engines.fashn_api._windows_user_env", lambda name: ""
    )
    engine = build_engine("fashn", {"type": "fashn_api"})
    with pytest.raises(VtonEngineError, match="FASHN_API_KEY"):
        engine.generate(_fashn_request())


def test_fashn_engine_maps_provider_errors(monkeypatch):
    def out_of_credits(request):
        return httpx.Response(429, json={"error": {"name": "OutOfCredits"}})

    with pytest.raises(VtonEngineError, match="429"):
        _fashn(monkeypatch, out_of_credits).generate(_fashn_request())

    def failed(name):
        def handler(request):
            if request.url.path == "/v1/run":
                return httpx.Response(200, json={"id": "j"})
            return httpx.Response(
                200,
                json={"status": "failed", "error": {"name": name, "message": "x"}},
            )

        return handler

    with pytest.raises(BusinessRuleError):
        _fashn(monkeypatch, failed("ContentModerationError")).generate(_fashn_request())
    with pytest.raises(VtonEngineError):
        _fashn(monkeypatch, failed("PipelineError")).generate(_fashn_request())


def test_fashn_engine_times_out_while_polling(monkeypatch):
    def handler(request):
        if request.url.path == "/v1/run":
            return httpx.Response(200, json={"id": "j"})
        return httpx.Response(200, json={"status": "processing"})

    engine = _fashn(monkeypatch, handler, timeout_s=0.01, poll_interval_s=0.05)
    with pytest.raises(VtonEngineError, match="did not finish"):
        engine.generate(_fashn_request())
