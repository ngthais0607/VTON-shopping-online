"""Importing this package registers every built-in engine type."""

from app.features.vton_lab.engines import (  # noqa: F401
    catvton_http,
    dmvton_cpu,
    fallback,
    fashn_api,
    gradio_space,
    mock,
)
from app.features.vton_lab.engines.base import (
    ENGINE_TYPES,
    TryOnEngine,
    TryOnRequest,
    build_engine,
    register_engine,
)

__all__ = [
    "ENGINE_TYPES",
    "TryOnEngine",
    "TryOnRequest",
    "build_engine",
    "register_engine",
]
