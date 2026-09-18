from pydantic import BaseModel

class ProductCreate(BaseModel):
    name: str
    price: float
    description: str | None = None
    category_id: int | None = None
    stock_quantity: int = 0
    reserved_quantity: int = 0
    sold_quantity: int = 0
    currency : str = "USD"
    is_active : bool = True

class ProductUpdate(BaseModel):
    name: str
    price: float
    description: str | None = None
    category_id: int | None = None
    stock_quantity: int = 0
    reserved_quantity: int = 0
    sold_quantity: int = 0
    currency : str = "USD"
    is_active : bool = True

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