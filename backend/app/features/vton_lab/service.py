"""Engine registry loading and the try-on use case.

Engines come from a JSON file (``VTON_ENGINES_FILE``):

    {"default": "dmvton",
     "engines": {
       "dmvton": {"type": "dmvton_cpu", "repo": "D:/vton-local/dm-vton", ...},
       "catvton": {"type": "catvton_http", "url": "http://localhost:8080"}}}

The built-in ``mock`` engine is always available.
"""

import json
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from app.core.config import get_settings
from app.core.errors import (
    ApplicationError,
    BusinessRuleError,
    ResourceNotFoundError,
)
from app.features.vton_lab.engines import TryOnEngine, TryOnRequest, build_engine
from app.features.vton_lab.errors import VtonConfigError, VtonEngineError
from app.features.vton_lab.images import decode_image

MOCK_NAME = "mock"
# Longest a request waits for the single generation slot before giving up.
LOCK_WAIT_SECONDS = 120.0


@dataclass(frozen=True)
class TryOnResult:
    image: Image.Image
    engine: str
    elapsed_ms: int

    def headers(self) -> dict[str, str]:
        return {
            "X-Vton-Engine": self.engine,
            "X-Vton-Elapsed-Ms": str(self.elapsed_ms),
            "Cache-Control": "private, no-store",
        }


@dataclass(frozen=True)
class EngineInfo:
    name: str
    type: str
    cloth_types: list[str]
    sends_images_off_host: bool
    is_default: bool
    loaded: bool


class EngineRegistry:
    def __init__(self, specs: dict[str, dict], default: str) -> None:
        self._engines: dict[str, TryOnEngine] = {
            name: build_engine(name, spec) for name, spec in specs.items()
        }
        if default not in self._engines:
            raise VtonConfigError(
                f"Default engine '{default}' is not defined",
                details={"known": sorted(self._engines)},
            )
        self.default = default
        self._loaded: set[str] = set()
        self._lock = threading.Lock()  # CPU-bound: one generation at a time

    def names(self) -> list[str]:
        return sorted(self._engines)

    def describe(self) -> list[EngineInfo]:
        return [
            EngineInfo(
                name=name,
                type=engine.type_name,
                cloth_types=sorted(engine.supported_cloth_types),
                sends_images_off_host=engine.sends_images_off_host,
                is_default=name == self.default,
                loaded=name in self._loaded,
            )
            for name, engine in sorted(self._engines.items())
        ]

    def run(self, name: str | None, request: TryOnRequest) -> TryOnResult:
        name = name or self.default
        engine = self._engines.get(name)
        if engine is None:
            raise ResourceNotFoundError(
                f"Unknown try-on engine '{name}'",
                code="vton_engine_not_found",
                details={"known": self.names()},
            )
        if request.cloth_type not in engine.supported_cloth_types:
            raise BusinessRuleError(
                f"Engine '{name}' does not support cloth_type '{request.cloth_type}'",
                code="vton_cloth_type_unsupported",
                details={"supported": sorted(engine.supported_cloth_types)},
            )
        # A hung generate() must not block every later request forever.
        if not self._lock.acquire(timeout=LOCK_WAIT_SECONDS):
            raise VtonEngineError("The try-on engine is busy; try again shortly")
        try:
            if name not in self._loaded:
                engine.load()
                self._loaded.add(name)
            started = time.perf_counter()
            image = engine.generate(request)
            elapsed_ms = round((time.perf_counter() - started) * 1000)
        finally:
            self._lock.release()
        return TryOnResult(image=image, engine=name, elapsed_ms=elapsed_ms)


def load_registry(path: str, default: str | None = None) -> EngineRegistry:
    specs: dict[str, dict] = {MOCK_NAME: {"type": "mock"}}
    chosen_default = default or MOCK_NAME
    if path:
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise VtonConfigError(
                f"Cannot read engines file: {exc.__class__.__name__}"
            ) from exc
        engines = data.get("engines") if isinstance(data, dict) else None
        if not isinstance(engines, dict) or not all(
            isinstance(spec, dict) for spec in engines.values()
        ):
            raise VtonConfigError("Engines file needs an 'engines' object of objects")
        specs.update(engines)
        chosen_default = data.get("default") or chosen_default
    return EngineRegistry(specs, chosen_default)


_registry: EngineRegistry | None = None
_registry_lock = threading.Lock()


def get_registry() -> EngineRegistry:
    global _registry
    with _registry_lock:
        if _registry is None:
            settings = get_settings()
            _registry = load_registry(
                settings.vton_lab_engines_file, settings.vton_lab_default_engine
            )
        return _registry


def reset_registry() -> None:
    """Forget loaded engines (config change, tests)."""
    global _registry
    with _registry_lock:
        _registry = None


def try_on(
    registry: EngineRegistry,
    *,
    person_bytes: bytes,
    garment_bytes: bytes,
    cloth_type: str,
    engine: str | None,
    seed: int = 42,
) -> TryOnResult:
    request = TryOnRequest(
        person=decode_image(person_bytes, "person"),
        garment=decode_image(garment_bytes, "garment"),
        cloth_type=cloth_type,
        seed=seed,
    )
    try:
        return registry.run(engine, request)
    except (ApplicationError, VtonEngineError):
        raise
    except Exception as exc:  # engines may raise anything (ValueError, OSError...)
        raise VtonEngineError(f"Engine crashed: {exc.__class__.__name__}") from exc
