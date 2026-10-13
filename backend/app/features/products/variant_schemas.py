from __future__ import annotations

from pydantic import BaseModel, Field


class ColorItem(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    hex: str | None = Field(default=None, max_length=7)


class VariantItem(BaseModel):
    size: str = Field(min_length=1, max_length=20)
    color_name: str = Field(min_length=1, max_length=50)
    color_hex: str | None = Field(default=None, max_length=7)
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
    price: float | None = Field(default=None, ge=0)
    stock_quantity: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    color_hex: str | None = Field(default=None, max_length=7)


class VariantStockAdjustment(BaseModel):
    stock_quantity: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=500)
