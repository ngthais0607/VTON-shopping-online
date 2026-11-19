"""Try engines in order; use the first that works (e.g. online API, then local CPU).

    {"type": "fallback", "engines": [
        {"type": "gradio_space", "space": "..."},
        {"type": "dmvton_cpu", "repo": "..."}]}

Any failure of an engine (network down, timeout, crash) moves on to the next one.
The last engine's error is raised when all fail.
"""

import logging

from PIL import Image

from app.core.errors import BusinessRuleError
from app.features.vton_lab.engines.base import (
    CLOTH_TYPES,
    TryOnEngine,
    TryOnRequest,
    build_engine,
    register_engine,
)
from app.features.vton_lab.errors import VtonConfigError, VtonEngineError

logger = logging.getLogger(__name__)


@register_engine("fallback")
class FallbackEngine(TryOnEngine):
    def __init__(self, name, options):
        super().__init__(name, options)
        specs = self.option("engines", required=True)
        if not isinstance(specs, list) or not specs:
            raise VtonConfigError(f"Engine '{name}' needs a non-empty 'engines' list")
        self._chain = [build_engine(f"{name}[{i}]", s) for i, s in enumerate(specs)]
        self._loaded: set[int] = set()
        # Images leave the host only if some link in the chain can send them.
        self.sends_images_off_host = any(e.sends_images_off_host for e in self._chain)

    @property
    def supported_cloth_types(self):  # type: ignore[override]
        return frozenset().union(*(e.supported_cloth_types for e in self._chain)) & set(
            CLOTH_TYPES
        )

    def generate(self, request: TryOnRequest) -> Image.Image:
        last: Exception | None = None
        for index, engine in enumerate(self._chain):
            if request.cloth_type not in engine.supported_cloth_types:
                continue
            try:
                if index not in self._loaded:
                    engine.load()
                    self._loaded.add(index)
                return engine.generate(request)
            except BusinessRuleError:
                raise
            except Exception as exc:  # network, timeout, crash: try the next one
                logger.warning("Engine %s failed (%s); falling back", engine.name, exc)
                last = exc
        if isinstance(last, VtonEngineError):
            raise last
        raise VtonEngineError("All engines in the fallback chain failed") from last
