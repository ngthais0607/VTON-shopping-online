from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import get_db
from app.core.rate_limiter import limiter
from app.core.security import get_current_user
from app.features.users.model import User
from app.features.vton import service
from app.features.vton.schemas import (
    VtonEligibilityResponse,
    VtonQuotaResponse,
    VtonTaskPage,
    VtonTaskResponse,
)
from app.integrations.queue import TaskQueue, get_task_queue
from app.integrations.storage import ProductStorage, get_product_storage

router = APIRouter(prefix="/api/v1/vton", tags=["Virtual try-on"])


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


@router.get(
    "/products/{product_id}/eligibility",
    response_model=VtonEligibilityResponse,
    summary="Check whether a product supports virtual try-on",
)
def get_eligibility(
    product_id: int,
    color: str | None = Query(default=None, max_length=50),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
):
    return service.get_eligibility(db, settings, product_id, color)


@router.get("/quota", response_model=VtonQuotaResponse, summary="Try-on quota")
def get_quota(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
    current_user: User = Depends(get_current_user),
):
    return service.get_quota(db, settings, current_user)


@router.post(
    "/tasks",
    response_model=VtonTaskResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start a virtual try-on",
)
@limiter.limit("10/minute")
async def create_task(
    request: Request,
    person_image: UploadFile = File(...),
    product_id: int = Form(...),
    variant_id: int | None = Form(default=None),
    consent: bool = Form(default=False),
    idempotency_key: str | None = Header(default=None, max_length=64),
    db: Session = Depends(get_db),
    storage: ProductStorage = Depends(get_product_storage),
    queue: TaskQueue = Depends(get_task_queue),
    settings: Settings = Depends(get_app_settings),
    current_user: User = Depends(get_current_user),
):
    return await service.create_task(
        db,
        storage,
        queue,
        settings,
        current_user,
        product_id=product_id,
        variant_id=variant_id,
        stream=person_image.file,
        filename=person_image.filename or "",
        content_type=person_image.content_type or "",
        consent=consent,
        idempotency_key=idempotency_key,
    )


@router.get("/tasks", response_model=VtonTaskPage, summary="List my try-ons")
def list_tasks(
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_tasks(db, current_user, limit, offset)
    return VtonTaskPage(items=items, total=total)


@router.get("/tasks/{task_id}", response_model=VtonTaskResponse, summary="Get a try-on")
def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_task(db, current_user, task_id)


@router.get("/tasks/{task_id}/person", summary="Download the submitted photo")
async def get_person_image(
    task_id: str,
    db: Session = Depends(get_db),
    storage: ProductStorage = Depends(get_product_storage),
    current_user: User = Depends(get_current_user),
):
    task = service.get_task(db, current_user, task_id)
    image = await service.read_task_image(storage, task, "person")
    return Response(
        content=image.content,
        media_type=image.media_type,
        headers=service.PRIVATE_IMAGE_HEADERS,
    )


@router.get("/tasks/{task_id}/result", summary="Download the try-on result")
async def get_result_image(
    task_id: str,
    db: Session = Depends(get_db),
    storage: ProductStorage = Depends(get_product_storage),
    current_user: User = Depends(get_current_user),
):
    task = service.get_task(db, current_user, task_id)
    image = await service.read_task_image(storage, task, "result")
    return Response(
        content=image.content,
        media_type=image.media_type,
        headers=service.PRIVATE_IMAGE_HEADERS,
    )


@router.delete(
    "/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Erase a try-on's photo and result",
)
async def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    storage: ProductStorage = Depends(get_product_storage),
    current_user: User = Depends(get_current_user),
):
    await service.delete_task_images(db, storage, current_user, task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
