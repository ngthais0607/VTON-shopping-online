from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.schemas import Page
from app.core.security import get_current_admin, get_current_user
from app.features.products import images, reviews, service
from app.features.products.schemas import (
    ProductCreate,
    ProductFilters,
    ProductImageResponse,
    ProductPatch,
    ProductResponse,
    ProductStockAdjustment,
    ReviewCreate,
    ReviewResponse,
    ReviewSummary,
)
from app.features.users.model import User
from app.integrations.storage import ProductStorage, get_product_storage

router = APIRouter(prefix="/api/v1/products", tags=["Products"])


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create product",
)
def create_product(
    command: ProductCreate,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    return service.create_product(db, command)


@router.get(
    "",
    response_model=Page[ProductResponse],
    summary="Get products",
)
def list_products(
    filters: Annotated[ProductFilters, Depends()],
    db: Session = Depends(get_db),
):
    return service.list_products(db, filters)


@router.get(
    "/{product_id}",
    response_model=ProductResponse,
    summary="Get product by ID",
)
def get_product(product_id: int, db: Session = Depends(get_db)):
    return service.get_product(db, product_id)


@router.patch(
    "/{product_id}",
    response_model=ProductResponse,
    summary="Update product",
)
def update_product(
    product_id: int,
    command: ProductPatch,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    return service.update_product(db, product_id, command)


@router.post(
    "/{product_id}/adjust-stock",
    response_model=ProductResponse,
    summary="Adjust product stock quantity with mandatory reason",
)
def adjust_product_stock(
    product_id: int,
    command: ProductStockAdjustment,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    return service.adjust_product_stock(db, product_id, command)


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete product",
)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
) -> None:
    service.delete_product(db, product_id)


@router.post(
    "/{product_id}/upload-image",
    response_model=ProductImageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload product image",
)
def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    storage: ProductStorage = Depends(get_product_storage),
    _current_admin: User = Depends(get_current_admin),
):
    return images.store_product_image(
        db,
        storage,
        product_id,
        file.file,
        file.filename or "",
        file.content_type or "",
        size=file.size,
    )


@router.get(
    "/{product_id}/reviews",
    response_model=ReviewSummary,
    summary="Get product reviews and average rating",
)
def get_product_reviews(product_id: int, db: Session = Depends(get_db)):
    return reviews.list_product_reviews(db, product_id)


@router.post(
    "/{product_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit product review",
)
def create_product_review(
    product_id: int,
    command: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return reviews.create_product_review(db, product_id, current_user, command)
