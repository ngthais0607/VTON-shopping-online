from datetime import datetime
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
    sort: ProductSort = ProductSort.LATEST
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    price: float = Field(ge=0)
    description: str | None = Field(default=None, max_length=1000)
    category_id: int | None = None
    stock_quantity: int = Field(default=0, ge=0)
    currency: str = Field(default="VND", min_length=1, max_length=10)
    is_active: bool = True


class ProductPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    price: float | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=1000)
    category_id: int | None = None
    stock_quantity: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=1, max_length=10)
    is_active: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_required_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        nullable_fields = {"description", "category_id"}
        for field_name, field_value in value.items():
            if field_name not in nullable_fields and field_value is None:
                raise ValueError(f"{field_name} cannot be null")
        return value


class ProductStockAdjustment(BaseModel):
    stock_quantity: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=500)


class CategorySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ProductImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    url: str = Field(validation_alias=AliasChoices("url", "object_name"))

    @field_validator("url", mode="before")
    @classmethod
    def build_public_url(cls, value: str) -> str:
        if value.startswith(("http://", "https://")):
            return value
        settings = get_settings()
        base_url = settings.minio_external_url.rstrip("/")
        return f"{base_url}/{settings.minio_bucket}/{value}"


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: float
    description: str | None
    stock_quantity: int
    reserved_quantity: int
    sold_quantity: int
    currency: str
    is_active: bool
    category: CategorySummary | None
    images: list[ProductImageResponse]
    created_at: datetime | None
    updated_at: datetime | None


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=255)
    comment: str | None = Field(default=None, max_length=1000)


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    user_id: int
    user_name: str = Field(validation_alias=AliasPath("user", "full_name"))
    rating: int
    title: str | None = None
    comment: str | None = None
    is_verified_purchase: bool
    created_at: datetime | None = None


class ReviewSummary(BaseModel):
    average_rating: float | None
    total_reviews: int
    reviews: list[ReviewResponse]
