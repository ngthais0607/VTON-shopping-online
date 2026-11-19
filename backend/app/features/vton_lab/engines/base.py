"""Engine contract and registry.

Adding a model = one module with a ``TryOnEngine`` subclass decorated with
``@register_engine("type-name")``, imported from ``engines/__init__.py``.
Heavy libraries (torch, gradio_client...) must be imported inside ``load()`` so
the backend starts without them.
"""

from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, ClassVar

from PIL import Image

from app.core.errors import BusinessRuleError
from app.features.vton_lab.errors import VtonConfigError

UPPER, LOWER, OVERALL = "upper", "lower", "overall"
CLOTH_TYPES = (UPPER, LOWER, OVERALL)


@dataclass(frozen=True)
class TryOnRequest:
    person: Image.Image
    garment: Image.Image
    cloth_type: str = UPPER
    seed: int = 42

    def __post_init__(self) -> None:
        if self.cloth_type not in CLOTH_TYPES:
            raise BusinessRuleError(
                f"cloth_type must be one of {', '.join(CLOTH_TYPES)}",
                code="vton_invalid_cloth_type",
            )


class TryOnEngine(ABC):
    type_name: ClassVar[str] = ""
    supported_cloth_types: ClassVar[frozenset[str]] = frozenset(CLOTH_TYPES)
    # True when the engine sends images to a third-party service.
    sends_images_off_host: ClassVar[bool] = False

    def __init__(self, name: str, options: Mapping[str, Any]) -> None:
        self.name = name
        self.options = dict(options)

    def option(self, key: str, default: Any = None, *, required: bool = False):
        if required and key not in self.options:
            raise VtonConfigError(
                f"Engine '{self.name}' needs option '{key}'",
                details={"engine": self.name, "option": key},
            )
        return self.options.get(key, default)

    def load(self) -> None:  # noqa: B027 - optional hook
        """Load weights or open clients. Called once, before the first run."""

    @abstractmethod
    def generate(self, request: TryOnRequest) -> Image.Image:
        """Return the try-on image (any size; callers do not resize it)."""


ENGINE_TYPES: dict[str, type[TryOnEngine]] = {}


def register_engine(
    type_name: str,
) -> Callable[[type[TryOnEngine]], type[TryOnEngine]]:
    def decorator(cls: type[TryOnEngine]) -> type[TryOnEngine]:
        if type_name in ENGINE_TYPES:
            raise ValueError(f"engine type '{type_name}' registered twice")
        cls.type_name = type_name
        ENGINE_TYPES[type_name] = cls
        return cls

    return decorator


def build_engine(name: str, spec: Mapping[str, Any]) -> TryOnEngine:
    type_name = spec.get("type")
    engine_cls = ENGINE_TYPES.get(type_name) if isinstance(type_name, str) else None
    if engine_cls is None:
        raise VtonConfigError(
            f"Engine '{name}' has unknown type {type_name!r}",
            details={"engine": name, "known_types": sorted(ENGINE_TYPES)},
        )
    options = {key: value for key, value in spec.items() if key != "type"}
    return engine_cls(name, options)
