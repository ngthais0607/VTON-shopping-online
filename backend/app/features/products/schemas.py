from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import (
    AliasChoices,
    AliasPath,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.core.config import get_settings
from app.core.schemas import UtcDatetime
from app.features.products.variant_schemas import VariantItem


class ProductSort(StrEnum):
    LATEST = "latest"
    PRICE_ASC = "price_asc"
    PRICE_DESC = "price_desc"
    STOCK_ASC = "stock_asc"
    STOCK_DESC = "stock_desc"
    SOLD_DESC = "sold_desc"
    NAME_ASC = "name_asc"


class StockStatus(StrEnum):
    IN_STOCK = "in_stock"
    LOW_STOCK = "low_stock"
    OUT_OF_STOCK = "out_of_stock"


class ProductFilters(BaseModel):
    category_id: int | None = None
    search: str | None = None
    min_price: float | None = Field(default=None, ge=0)
    max_price: float | None = Field(default=None, ge=0)
    is_active: bool | None = None
    stock_status: StockStatus | None = None
    gender: list[str] | None = None
    brand: list[str] | None = None
    size: list[str] | None = None
    color: list[str] | None = None
    sort: ProductSort = ProductSort.LATEST
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

    @field_validator("gender", "brand", "size", "color", mode="before")
    @classmethod
    def normalize_multi_filter(cls, v: Any) -> list[str] | None:
        if v is None:
            return None
        if isinstance(v, str):
            parts = [p.strip() for p in v.split(",") if p.strip()]
            return parts if parts else None
        if isinstance(v, (list, tuple, set)):
            res = []
            for item in v:
                if isinstance(item, str):
                    for p in item.split(","):
                        if p.strip():
                            res.append(p.strip())
                elif item is not None:
                    res.append(str(item))
            return res if res else None
        return v


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    price: float = Field(ge=0)
    description: str | None = Field(default=None, max_length=1000)
    category_id: int | None = None
    currency: str = Field(default="VND", min_length=1, max_length=10)
    is_active: bool = False
    brand: str | None = Field(default=None, max_length=100)
    gender: str = Field(default="unisex", max_length=20)
    material: str | None = Field(default=None, max_length=255)
    fit: str | None = Field(default=None, max_length=50)
    care_instructions: str | None = Field(default=None, max_length=500)
    size_chart: dict[str, Any] | None = None
    variants: list[VariantItem] | None = None


class ProductPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    price: float | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=1000)
    category_id: int | None = None
    currency: str | None = Field(default=None, min_length=1, max_length=10)
    is_active: bool | None = None
    brand: str | None = Field(default=None, max_length=100)
    gender: str | None = Field(default=None, max_length=20)
    material: str | None = Field(default=None, max_length=255)
    fit: str | None = Field(default=None, max_length=50)
    care_instructions: str | None = Field(default=None, max_length=500)
    size_chart: dict[str, Any] | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_required_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        nullable_fields = {
            "description",
            "category_id",
            "brand",
            "material",
            "fit",
            "care_instructions",
            "size_chart",
        }
        for field_name, field_value in value.items():
            if field_name not in nullable_fields and field_value is None:
                raise ValueError(f"{field_name} cannot be null")
        return value


class CategorySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ProductImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    url: str = Field(validation_alias=AliasChoices("url", "object_name"))
    color_name: str | None = None
    kind: str = "model_photo"
    is_primary: bool = False
    sort_order: int = 0

    @field_validator("url", mode="before")
    @classmethod
    def build_public_url(cls, value: str) -> str:
        if value.startswith(("http://", "https://")):
            return value
        settings = get_settings()
        base_url = settings.minio_external_url.rstrip("/")
        return f"{base_url}/{settings.minio_bucket}/{value}"


class ProductVariantPublicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    sku: str
    size: str
    color_name: str
    color_hex: str | None = None
    price: float | None = None
    available_stock: int
    in_stock: bool = True
    is_active: bool
    created_at: UtcDatetime | None = None
    updated_at: UtcDatetime | None = None


class ProductVariantAdminResponse(ProductVariantPublicResponse):
    stock_quantity: int
    reserved_quantity: int
    sold_quantity: int


ProductVariantResponse = ProductVariantAdminResponse


class ProductPublicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    price: float
    description: str | None = None
    currency: str
    is_active: bool
    brand: str | None = None
    gender: str = "unisex"
    material: str | None = None
    fit: str | None = None
    care_instructions: str | None = None
    size_chart: dict[str, Any] | None = None
    price_min: float | None = None
    price_max: float | None = None
    category: CategorySummary | None = None
    images: list[ProductImageResponse] = []
    available_stock: int
    in_stock: bool = True
    rating_avg: float | None = None
    review_count: int = 0
    created_at: UtcDatetime | None = None
    updated_at: UtcDatetime | None = None


class ProductAdminResponse(ProductPublicResponse):
    stock_quantity: int
    reserved_quantity: int
    sold_quantity: int


ProductResponse = ProductAdminResponse


class VariantLookupPublicItem(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_slug: str
    sku: str
    size: str
    color_name: str
    color_hex: str | None = None
    price: float
    available_stock: int
    in_stock: bool = True
    is_active: bool
    image_url: str | None = None


class VariantLookupAdminItem(VariantLookupPublicItem):
    stock_quantity: int
    reserved_quantity: int
    sold_quantity: int


VariantLookupItem = VariantLookupAdminItem


class FacetColor(BaseModel):
    name: str
    hex: str | None = None


class ProductFacetsResponse(BaseModel):
    genders: list[str]
    brands: list[str]
    sizes: list[str]
    colors: list[FacetColor]
    price_min: float
    price_max: float


class FitFeedbackSummary(BaseModel):
    small: float = 0.0
    true_to_size: float = 0.0
    large: float = 0.0
    total_responses: int = 0


class ProductDetailPublicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    price: float
    price_min: float
    price_max: float
    description: str | None = None
    brand: str | None = None
    gender: str = "unisex"
    material: str | None = None
    fit: str | None = None
    care_instructions: str | None = None
    size_chart: dict[str, Any] | None = None
    currency: str
    is_active: bool
    available_stock: int
    in_stock: bool = True
    category: CategorySummary | None = None
    images: list[ProductImageResponse] = []
    variants: list[ProductVariantPublicResponse] = []
    available_sizes: list[str] = []
    available_colors: list[FacetColor] = []
    fit_feedback: FitFeedbackSummary | None = None
    rating_avg: float | None = None
    review_count: int = 0
    created_at: UtcDatetime | None = None
    updated_at: UtcDatetime | None = None


class ProductDetailAdminResponse(ProductDetailPublicResponse):
    stock_quantity: int
    reserved_quantity: int
    sold_quantity: int
    variants: list[ProductVariantAdminResponse] = []


ProductDetailResponse = ProductDetailAdminResponse


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=255)
    comment: str | None = Field(default=None, max_length=1000)
    fit_feedback: str | None = Field(
        default=None, pattern="^(small|true_to_size|large)$"
    )


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    user_id: int
    user_name: str = Field(validation_alias=AliasPath("user", "full_name"))
    rating: int
    title: str | None = None
    comment: str | None = None
    fit_feedback: str | None = None
    is_verified_purchase: bool
    created_at: UtcDatetime | None = None


class ReviewSummary(BaseModel):
    average_rating: float | None
    total_reviews: int
    reviews: list[ReviewResponse]
    fit_feedback: FitFeedbackSummary | None = None
