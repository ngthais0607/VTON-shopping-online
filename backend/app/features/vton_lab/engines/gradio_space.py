"""Calls any Gradio app (e.g. a Hugging Face Space) that offers try-on.

Needs the optional ``gradio_client`` package; it is imported only when the
engine runs. Images are sent to the third-party host: use test photos only.

Options:
  space      Space id ("owner/name") or full URL            (required)
  api_name   endpoint, e.g. "/tryon"                         (required)
  args       list describing the call, in order. Each item is either a literal
             (str/number/bool) or one of the placeholders "$person",
             "$garment", "$cloth_type", "$seed".
  person_as  "path" (default) or "editor": how the person image is passed.
             "editor" wraps it as {"background": file, "layers": [], "composite": file}
             as used by IDM-VTON style demos.
  hf_token_env  name of an env var holding a Hugging Face token (optional)
  result_index  which returned item is the image (default 0)
"""

import os
import tempfile
from pathlib import Path

from PIL import Image

from app.features.vton_lab.engines.base import (
    TryOnEngine,
    TryOnRequest,
    register_engine,
)
from app.features.vton_lab.errors import VtonEngineError


@register_engine("gradio_space")
class GradioSpaceEngine(TryOnEngine):
    sends_images_off_host = True

    def load(self) -> None:
        try:
            from gradio_client import Client
        except ImportError as exc:
            raise VtonEngineError(
                "gradio_client is not installed (pip install gradio_client)"
            ) from exc
        token_env = self.option("hf_token_env")
        token = os.environ.get(token_env) if token_env else None
        try:
            self._client = Client(self.option("space", required=True), hf_token=token)
        except Exception as exc:  # noqa: BLE001 - library raises many types
            raise VtonEngineError(
                f"Cannot reach Gradio app: {exc.__class__.__name__}"
            ) from exc

    def generate(self, request: TryOnRequest) -> Image.Image:
        from gradio_client import handle_file

        api_name = str(self.option("api_name", required=True))
        with tempfile.TemporaryDirectory(prefix="vton-gradio-") as tmp:
            person_path = Path(tmp) / "person.png"
            garment_path = Path(tmp) / "garment.png"
            request.person.save(person_path)
            request.garment.save(garment_path)
            person_file = handle_file(str(person_path))
            if self.option("person_as", "path") == "editor":
                person_arg = {
                    "background": person_file,
                    "layers": [],
                    "composite": person_file,
                }
            else:
                person_arg = person_file
            values = {
                "$person": person_arg,
                "$garment": handle_file(str(garment_path)),
                "$cloth_type": request.cloth_type,
                "$seed": request.seed,
            }
            args = [
                values.get(item, item) if isinstance(item, str) else item
                for item in self.option("args", ["$person", "$garment"])
            ]
            try:
                result = self._client.predict(*args, api_name=api_name)
            except Exception as exc:  # noqa: BLE001
                raise VtonEngineError(
                    f"Gradio call failed: {exc.__class__.__name__}"
                ) from exc
            image_path = _pick_path(result, int(self.option("result_index", 0)))
            try:
                with Image.open(image_path) as image:
                    return image.convert("RGB")
            except OSError as exc:
                raise VtonEngineError(
                    "Gradio app returned an unreadable image"
                ) from exc


def _pick_path(result, index: int) -> str:
    item = result[index] if isinstance(result, (list, tuple)) else result
    if isinstance(item, dict):
        item = item.get("path") or item.get("value") or item.get("url")
    if not isinstance(item, str):
        raise VtonEngineError("Gradio app returned no image path")
    return item
