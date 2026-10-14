
from typing import Self

from pydantic import BaseModel, Field, model_validator

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

    @model_validator(mode="after")
    def validate_matrix_or_variants(self) -> Self:
        has_sizes = bool(self.sizes)
        has_colors = bool(self.colors)
        has_variants = bool(self.variants)

        # Validate non-blank trimmed entries
        if has_sizes:
            cleaned_sizes = [s.strip() for s in self.sizes]
            if any(not s for s in cleaned_sizes):
                raise ValueError("Sizes cannot contain blank entries")
            self.sizes = cleaned_sizes

        if has_colors:
            for c in self.colors:
                if not c.name.strip():
                    raise ValueError("Color names cannot be blank")
                c.name = c.name.strip()

        # Check partial matrix (even alongside explicit variants)
        if has_sizes and not has_colors:
            raise ValueError("Matrix variant generation requires colors when sizes are specified")
        if has_colors and not has_sizes:
            raise ValueError("Matrix variant generation requires sizes when colors are specified")

        # Check completely empty payload
        if not (has_sizes and has_colors) and not has_variants:
            raise ValueError("Payload must contain either explicit variants or a complete size and color matrix")

        return self


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
