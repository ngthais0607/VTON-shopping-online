from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_admin
from app.features.products import variant_service
from app.features.products.schemas import ProductVariantResponse
from app.features.products.variant_schemas import (
    BulkVariantCreate,
    VariantPatch,
    VariantStockAdjustment,
)
from app.features.users.model import User

router = APIRouter(tags=["Variants"])


@router.post(
    "/api/v1/products/{product_id}/variants/bulk",
    response_model=list[ProductVariantResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Generate variant matrix for product",
)
def bulk_create_variants(
    product_id: int,
    command: BulkVariantCreate,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    return variant_service.bulk_create_variants(db, product_id, command)


@router.patch(
    "/api/v1/variants/{variant_id}",
    response_model=ProductVariantResponse,
    summary="Update variant",
)
def update_variant(
    variant_id: int,
    command: VariantPatch,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    return variant_service.update_variant(db, variant_id, command)


@router.post(
    "/api/v1/variants/{variant_id}/adjust-stock",
    response_model=ProductVariantResponse,
    summary="Adjust variant stock with reason audit",
)
def adjust_variant_stock(
    variant_id: int,
    command: VariantStockAdjustment,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    return variant_service.adjust_variant_stock(db, variant_id, command)


@router.delete(
    "/api/v1/variants/{variant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete or deactivate variant",
)
def delete_variant(
    variant_id: int,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
) -> None:
    variant_service.delete_variant(db, variant_id)
