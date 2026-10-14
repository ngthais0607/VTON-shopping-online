from datetime import datetime

from pydantic import BaseModel, Field

from app.core.schemas import UtcDatetime

HEX_COLOR_PATTERN = r"^#[0-9A-Fa-f]{6}$"


class ColorItem(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    hex: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)


class VariantItem(BaseModel):
    size: str = Field(min_length=1, max_length=20)
    color_name: str = Field(min_length=1, max_length=50)
    color_hex: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    price: float | None = Field(default=None, ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    sku: str | None = Field(default=None, max_length=64)


class BulkVariantCreate(BaseModel):
    sizes: list[str] = Field(default_factory=list)
    colors: list[ColorItem] = Field(default_factory=list)
    variants: list[VariantItem] = Field(default_factory=list)
    default_stock: int = Field(default=0, ge=0)
    default_price: float | None = Field(default=None, ge=0)


class VariantPatch(BaseModel):
    model_config = {"extra": "forbid"}

    price: float | None = Field(default=None, ge=0)
    is_active: bool | None = None
    color_hex: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    sku: str | None = Field(default=None, min_length=1, max_length=64)


class VariantStockAdjustment(BaseModel):
    model_config = {"extra": "forbid"}

    stock_quantity: int | None = Field(default=None, ge=0)
    delta: int | None = None
    reason: str = Field(min_length=1, max_length=500)


class InventoryAdjustmentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    variant_id: int
    old_stock: int
    new_stock: int
    delta: int
    reason: str
    user_id: int | None = None
    created_at: UtcDatetime
