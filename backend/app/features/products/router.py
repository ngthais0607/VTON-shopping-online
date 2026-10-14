from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import BusinessRuleError
from app.core.schemas import Page
from app.core.security import (
    get_current_admin,
    get_current_user,
    get_current_user_optional,
)
from app.features.products import images, reviews, service
from app.features.products.schemas import (
    ProductAdminResponse,
    ProductCreate,
    ProductDetailAdminResponse,
    ProductDetailPublicResponse,
    ProductFacetsResponse,
    ProductFilters,
    ProductImageResponse,
    ProductPatch,
    ProductPublicResponse,
    ProductResponse,
    ProductSort,
    ProductVariantPublicResponse,
    ReviewCreate,
    ReviewPage,
    ReviewResponse,
    StockStatus,
    VariantLookupAdminItem,
    VariantLookupPublicItem,
)
from app.features.users.model import User
from app.integrations.storage import ProductStorage, get_product_storage

router = APIRouter(prefix="/api/v1/products", tags=["Products"])


def get_product_filters(
    category_id: int | None = None,
    search: str | None = None,
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    is_active: bool | None = None,
    stock_status: StockStatus | None = None,
    gender: Annotated[list[str] | None, Query()] = None,
    brand: Annotated[list[str] | None, Query()] = None,
    size: Annotated[list[str] | None, Query()] = None,
    color: Annotated[list[str] | None, Query()] = None,
    sort: ProductSort = ProductSort.LATEST,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ProductFilters:
    return ProductFilters(
        category_id=category_id,
        search=search,
        min_price=min_price,
        max_price=max_price,
        is_active=is_active,
        stock_status=stock_status,
        gender=gender,
        brand=brand,
        size=size,
        color=color,
        sort=sort,
        limit=limit,
        offset=offset,
    )


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
    response_model=Page[ProductAdminResponse] | Page[ProductPublicResponse],
    summary="Get products",
)
def list_products(
    filters: Annotated[ProductFilters, Depends(get_product_filters)],
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    is_admin = bool(current_user and current_user.role == "admin")
    page = service.list_products(db, filters, is_admin=is_admin)
    if is_admin:
        return Page(
            items=[ProductAdminResponse.model_validate(p) for p in page.items],
            total=page.total,
            limit=page.limit,
            offset=page.offset,
        )
    return Page(
        items=[ProductPublicResponse.model_validate(p) for p in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get(
    "/variants/lookup",
    response_model=list[VariantLookupAdminItem] | list[VariantLookupPublicItem],
    summary="Batch lookup product variants for cart validation",
)
def lookup_variants(
    ids: str = Query(default="", description="Comma-separated variant IDs"),
    skus: str = Query(default="", description="Comma-separated variant SKUs"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    storage: ProductStorage = Depends(get_product_storage),
):
    id_list: list[int] = []
    if ids and ids.strip():
        try:
            id_list = [int(i.strip()) for i in ids.split(",") if i.strip()]
        except ValueError:
            raise BusinessRuleError(
                "Invalid variant ID in query list", code="invalid_variant_id"
            )
    sku_list: list[str] = []
    if skus and skus.strip():
        sku_list = [s.strip() for s in skus.split(",") if s.strip()]

    is_admin = bool(current_user and current_user.role == "admin")
    return service.lookup_variants(
        db, ids=id_list, skus=sku_list, is_admin=is_admin, storage=storage
    )


@router.get(
    "/facets",
    response_model=ProductFacetsResponse,
    summary="Get product facets (brands, genders, sizes, colors, price range)",
)
def get_product_facets(db: Session = Depends(get_db)):
    return service.get_product_facets(db)


@router.get(
    "/by-slug/{slug}",
    response_model=ProductDetailAdminResponse | ProductDetailPublicResponse,
    summary="Get product detail by slug",
)
def get_product_by_slug(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    is_admin = bool(current_user and current_user.role == "admin")
    product = service.get_product_by_slug(db, slug, is_admin=is_admin)
    if is_admin:
        return ProductDetailAdminResponse.model_validate(product)
    active_variants = [v for v in product.variants if v.is_active]
    dto = ProductDetailPublicResponse.model_validate(product)
    dto.variants = [
        ProductVariantPublicResponse.model_validate(v) for v in active_variants
    ]
    return dto


@router.get(
    "/{product_id}",
    response_model=ProductAdminResponse | ProductPublicResponse,
    summary="Get product by ID",
)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    is_admin = bool(current_user and current_user.role == "admin")
    product = service.get_product(db, product_id, is_admin=is_admin)
    if is_admin:
        return ProductAdminResponse.model_validate(product)
    return ProductPublicResponse.model_validate(product)


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
    response_model=ReviewPage,
    summary="Get product reviews",
)
def get_reviews(
    product_id: int,
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return reviews.get_product_reviews(db, product_id, limit=limit, offset=offset)
