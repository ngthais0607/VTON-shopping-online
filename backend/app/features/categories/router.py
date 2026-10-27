from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.schemas import Page
from app.core.security import get_current_admin
from app.features.categories import service
from app.features.categories.schemas import (
    CategoryCreate,
    CategoryPatch,
    CategoryResponse,
    CategoryTreeItem,
)
from app.features.users.model import User

router = APIRouter(prefix="/api/v1/categories", tags=["Categories"])


@router.post(
    "",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create category",
)
def create_category(
    command: CategoryCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    return service.create_category(db, command, current_admin.id)


@router.get(
    "/tree",
    response_model=list[CategoryTreeItem],
    summary="Get category hierarchy tree",
)
def get_category_tree(db: Session = Depends(get_db)):
    return service.get_category_tree(db)


@router.get(
    "",
    response_model=Page[CategoryResponse],
    summary="Get categories",
)
def list_categories(
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return service.list_categories(db, search, limit, offset)


@router.get(
    "/{category_id}",
    response_model=CategoryResponse,
    summary="Get category by ID",
)
def get_category(category_id: int, db: Session = Depends(get_db)):
    return service.get_category(db, category_id)


@router.patch(
    "/{category_id}",
    response_model=CategoryResponse,
    summary="Update category",
)
def update_category(
    category_id: int,
    command: CategoryPatch,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    return service.update_category(db, category_id, command, current_admin.id)


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete category",
)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> None:
    service.delete_category(db, category_id, current_admin.id)
