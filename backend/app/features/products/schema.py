from typing import Self

from pydantic import BaseModel, Field, model_validator


class ProductWrite(BaseModel):
    name: str
    price: float = Field(gt=0)
    description: str | None = None
    category_id: int | None = None
    stock_quantity: int = Field(default=0, ge=0)
    reserved_quantity: int = Field(default=0, ge=0)
    sold_quantity: int = Field(default=0, ge=0)
    currency: str = "USD"
    is_active: bool = True

    @model_validator(mode="after")
    def validate_allocated_inventory(self) -> Self:
        if self.reserved_quantity + self.sold_quantity > self.stock_quantity:
            raise ValueError("Reserved and sold quantities cannot exceed total stock")
        return self


class ProductCreate(ProductWrite):
    pass


class ProductUpdate(ProductWrite):
    pass


class ReviewCreate(BaseModel):
    rating: int
    title: str | None = None
    comment: str | None = None


class ReviewResponse(BaseModel):
    id: int
    product_id: int
    user_id: int
    user_name: str
    rating: int
    title: str | None = None
    comment: str | None = None
    is_verified_purchase: bool
    created_at: str | None = None


class ProductReviewsResponse(BaseModel):
    average_rating: float
    total_reviews: int
    reviews: list[ReviewResponse]
