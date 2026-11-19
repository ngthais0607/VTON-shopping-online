"""FASHN try-on API (https://docs.fashn.ai): POST /v1/run, then poll /v1/status/{id}.

Images are sent to a third-party host. The key is read from an environment
variable (never from the engines file).

Options:
  api_key_env     env var holding the key                (default FASHN_API_KEY)
  base_url        API root                               (default https://api.fashn.ai)
  model_name      "tryon-v1.6" (default) or "tryon-max"
  mode            tryon-v1.6: performance | balanced | quality   (default balanced)
  timeout_s       total budget for submit + polling       (default 60)
  poll_interval_s delay between status checks             (default 1)
  moderation_level  conservative | permissive | none      (default permissive)
"""

import base64
import io
import os
import time
from typing import Any

import httpx
from PIL import Image, UnidentifiedImageError

from app.core.errors import BusinessRuleError
from app.features.vton_lab.engines.base import (
    LOWER,
    OVERALL,
    UPPER,
    TryOnEngine,
    TryOnRequest,
    register_engine,
)
from app.features.vton_lab.errors import VtonEngineError

CATEGORIES = {UPPER: "tops", LOWER: "bottoms", OVERALL: "one-pieces"}
# The shopper's input, not the service, is at fault: do not try another engine.
PERSON_MAX_SIDE, GARMENT_MAX_SIDE = 1296, 1024
REJECTED = {"ContentModerationError", "InputValidationError", "ImageLoadError"}


def _data_uri(image: Image.Image, max_side: int) -> str:
    """Downscaled JPEG data URI: the API works at ~864x1296, so more is wasted upload."""
    image = image.convert("RGB")
    image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()


def _windows_user_env(name: str) -> str:
    """Terminals opened before the key was set (e.g. VS Code) miss it; read the registry copy."""
    if os.name != "nt":
        return ""
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as reg:
            return str(winreg.QueryValueEx(reg, name)[0]).strip()
    except OSError:
        return ""


@register_engine("fashn_api")
class FashnApiEngine(TryOnEngine):
    sends_images_off_host = True

    def _key(self) -> str:
        env = str(self.option("api_key_env", "FASHN_API_KEY"))
        key = os.environ.get(env, "").strip() or _windows_user_env(env)
        if not key:
            raise VtonEngineError(f"FASHN API key missing: set {env}")
        return key

    def _inputs(self, request: TryOnRequest) -> dict[str, Any]:
        model = str(self.option("model_name", "tryon-v1.6"))
        person = _data_uri(request.person, PERSON_MAX_SIDE)
        garment = _data_uri(request.garment, GARMENT_MAX_SIDE)
        if model == "tryon-max":
            return {"model_image": person, "product_image": garment}
        return {
            "model_image": person,
            "garment_image": garment,
            "category": CATEGORIES[request.cloth_type],
            "mode": self.option("mode", "balanced"),
            "moderation_level": self.option("moderation_level", "permissive"),
            "seed": request.seed,
            "output_format": "png",
            "return_base64": True,
        }

    def generate(self, request: TryOnRequest) -> Image.Image:
        key = self._key()
        base = str(self.option("base_url", "https://api.fashn.ai")).rstrip("/")
        budget = float(self.option("timeout_s", 60))
        interval = float(self.option("poll_interval_s", 1.0))
        deadline = time.monotonic() + budget
        body = {
            "model_name": self.option("model_name", "tryon-v1.6"),
            "inputs": self._inputs(request),
        }
        headers = {"Authorization": f"Bearer {key}"}
        transport = self.options.get("transport")  # tests only
        try:
            with httpx.Client(
                base_url=base, headers=headers, timeout=30, transport=transport
            ) as client:
                job = self._json(client.post("/v1/run", json=body), "submit")
                job_id = job.get("id")
                if not job_id:
                    raise VtonEngineError("FASHN API returned no job id")
                while True:
                    state = self._json(client.get(f"/v1/status/{job_id}"), "status")
                    status = state.get("status")
                    if status == "completed":
                        return self._image(state)
                    if status == "failed":
                        self._raise_failed(state.get("error"))
                    if time.monotonic() + interval > deadline:
                        raise VtonEngineError(
                            f"FASHN API did not finish within {budget:.0f}s"
                        )
                    time.sleep(interval)
        except httpx.HTTPError as exc:
            raise VtonEngineError(
                f"FASHN API unreachable: {exc.__class__.__name__}"
            ) from exc

    @staticmethod
    def _json(response: httpx.Response, step: str) -> dict[str, Any]:
        if response.status_code != 200:
            name = ""
            try:
                name = str((response.json().get("error") or {}).get("name", ""))
            except (ValueError, AttributeError):
                pass
            raise VtonEngineError(
                f"FASHN API {step} answered {response.status_code} {name}".strip(),
                details={"status": response.status_code, "error": name},
            )
        try:
            return response.json()
        except ValueError as exc:
            raise VtonEngineError("FASHN API sent invalid JSON") from exc

    @staticmethod
    def _raise_failed(error: Any) -> None:
        error = error if isinstance(error, dict) else {}
        name = str(error.get("name", "UnknownError"))
        message = str(error.get("message", ""))[:200]
        if name in REJECTED:
            raise BusinessRuleError(
                "The photo or garment was rejected by the try-on provider",
                code="vton_rejected_by_provider",
                details={"reason": name},
            )
        raise VtonEngineError(f"FASHN job failed: {name} {message}".strip())

    @staticmethod
    def _image(state: dict[str, Any]) -> Image.Image:
        outputs = state.get("output") or []
        if not outputs:
            raise VtonEngineError("FASHN API returned no output")
        source = str(outputs[0])
        if source.startswith("data:"):
            raw = base64.b64decode(source.split(",", 1)[-1])
        else:
            # CDN link: fetched without the API key.
            response = httpx.get(source, timeout=30)
            if response.status_code != 200:
                raise VtonEngineError(
                    f"FASHN output download answered {response.status_code}"
                )
            raw = response.content
        try:
            image = Image.open(io.BytesIO(raw))
            image.load()
        except (UnidentifiedImageError, OSError) as exc:
            raise VtonEngineError("FASHN API returned a bad image") from exc
        return image.convert("RGB")
