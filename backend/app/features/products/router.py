from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import BusinessRuleError
from app.core.schemas import Page
from app.core.security import get_current_admin, get_current_user
from app.features.products import images, reviews, service
from app.features.products.schemas import (
    ProductCreate,
    ProductDetailResponse,
    ProductFacetsResponse,
    ProductFilters,
    ProductImageResponse,
    ProductPatch,
    ProductResponse,
    ProductStockAdjustment,
    ReviewCreate,
    ReviewResponse,
    ReviewSummary,
    VariantLookupItem,
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
    "/variants/lookup",
    response_model=list[VariantLookupItem],
    summary="Batch lookup product variants for cart validation",
)
def lookup_variants(
    ids: str = Query(default="", description="Comma-separated variant IDs"),
    db: Session = Depends(get_db),
):
    id_list: list[int] = []
    if ids and ids.strip():
        try:
            id_list = [int(i.strip()) for i in ids.split(",") if i.strip()]
        except ValueError:
            raise BusinessRuleError("Invalid variant ID in query list", code="invalid_variant_id")
    return service.lookup_variants(db, id_list)


@router.get(
    "/facets",
    response_model=ProductFacetsResponse,
    summary="Get product facets (brands, genders, sizes, colors, price range)",
)
def get_product_facets(db: Session = Depends(get_db)):
    return service.get_product_facets(db)


@router.get(
    "/by-slug/{slug}",
    response_model=ProductDetailResponse,
    summary="Get product detail by slug",
)
def get_product_by_slug(slug: str, db: Session = Depends(get_db)):
    return service.get_product_by_slug(db, slug)


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
    summary="Upload product image (legacy endpoint)",
)
@router.post(
    "/{product_id}/images",
    response_model=ProductImageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload product image",
)
def upload_image(
    product_id: int,
    file: UploadFile = File(...),
    color_name: str | None = Form(default=None),
    kind: str = Form(default="model_photo"),
    is_primary: bool = Form(default=False),
    sort_order: int = Form(default=0),
    db: Session = Depends(get_db),
    storage: ProductStorage = Depends(get_product_storage),
    _current_admin: User = Depends(get_current_admin),
):
    return images.upload_product_image(
        db,
        storage,
        product_id,
        file.file,
        file.filename or "",
        file.content_type or "",
        color_name=color_name,
        kind=kind,
        is_primary=is_primary,
        sort_order=sort_order,
    )


@router.delete(
    "/{product_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete product image",
)
def delete_image(
    product_id: int,
    image_id: str,
    db: Session = Depends(get_db),
    storage: ProductStorage = Depends(get_product_storage),
    _current_admin: User = Depends(get_current_admin),
) -> None:
    images.delete_product_image(db, storage, product_id, image_id)


@router.post(
    "/{product_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create product review",
)
def create_review(
    product_id: int,
    command: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return reviews.create_review(db, product_id, current_user.id, command)


@router.get(
    "/{product_id}/reviews",
    response_model=ReviewSummary,
    summary="Get product reviews",
)
def get_reviews(product_id: int, db: Session = Depends(get_db)):
    return reviews.get_product_reviews(db, product_id)
