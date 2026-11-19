from fastapi import APIRouter, Depends, File, Form, Response, UploadFile

from app.core.errors import COMMON_ERROR_RESPONSES
from app.core.security import get_current_admin
from app.features.users.model import User
from app.features.vton_lab import service
from app.features.vton_lab.images import MAX_UPLOAD_BYTES, to_png_bytes
from app.features.vton_lab.schemas import PNG_RESPONSE, EngineResponse

router = APIRouter(
    prefix="/api/v1/vton-lab",
    tags=["Virtual try-on"],
    responses=COMMON_ERROR_RESPONSES,
)


@router.get("/engines", response_model=list[EngineResponse])
def list_engines(
    registry: service.EngineRegistry = Depends(service.get_registry),
    _admin: User = Depends(get_current_admin),
):
    return registry.describe()


@router.post(
    "/try-on",
    response_class=Response,
    responses=PNG_RESPONSE,
)
def try_on(
    person: UploadFile = File(...),
    garment: UploadFile = File(...),
    cloth_type: str = Form(default="upper"),
    engine: str | None = Form(default=None),
    seed: int = Form(default=42, ge=0, le=2**31 - 1),
    registry: service.EngineRegistry = Depends(service.get_registry),
    _admin: User = Depends(get_current_admin),
) -> Response:
    """Admin-only lab endpoint: run one engine, return PNG + timing headers."""
    result = service.try_on(
        registry,
        person_bytes=person.file.read(MAX_UPLOAD_BYTES + 1),
        garment_bytes=garment.file.read(MAX_UPLOAD_BYTES + 1),
        cloth_type=cloth_type,
        engine=engine,
        seed=seed,
    )
    return Response(
        content=to_png_bytes(result.image),
        media_type="image/png",
        headers=result.headers(),
    )
