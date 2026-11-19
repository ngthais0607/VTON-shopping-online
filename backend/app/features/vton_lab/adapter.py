"""Lets the task pipeline (queue, storage, UI) run any engine of the lab registry.

Select with ``VTON_ENGINE=lab``; the lab engine used is ``VTON_LAB_DEFAULT_ENGINE``
from the file in ``VTON_LAB_ENGINES_FILE``.
"""

import asyncio

from app.core.config import Settings
from app.core.errors import ApplicationError
from app.features.vton_lab import service
from app.features.vton_lab.errors import VtonConfigError, VtonEngineError
from app.features.vton_lab.images import to_png_bytes
from app.integrations.vton_engine import VtonEngineError as TaskEngineError

NAME = "lab"


class LabVtonEngine:
    name = NAME

    def __init__(self, registry: service.EngineRegistry, engine: str | None) -> None:
        self._registry = registry
        self._engine = engine

    async def run(self, person: bytes, garment: bytes, cloth_type: str) -> bytes:
        return await asyncio.to_thread(self._run, person, garment, cloth_type)

    def _run(self, person: bytes, garment: bytes, cloth_type: str) -> bytes:
        try:
            result = service.try_on(
                self._registry,
                person_bytes=person,
                garment_bytes=garment,
                cloth_type=cloth_type,
                engine=self._engine,
            )
        except VtonConfigError as error:
            raise TaskEngineError(
                error.message, code="engine_misconfigured", retryable=False
            ) from error
        except VtonEngineError as error:
            raise TaskEngineError(
                error.message, code="engine_error", retryable=True
            ) from error
        except ApplicationError as error:  # bad image / unsupported garment type
            raise TaskEngineError(
                error.message, code="invalid_input", retryable=False
            ) from error
        return to_png_bytes(result.image)


def create_lab_engine(settings: Settings) -> LabVtonEngine:
    registry = service.load_registry(
        settings.vton_lab_engines_file, settings.vton_lab_default_engine
    )
    return LabVtonEngine(registry, None)
