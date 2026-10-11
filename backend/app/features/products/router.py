from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db, save_to_db
from app.core.schemas import Page
from app.core.security import get_current_admin, get_current_user
from app.features.orders.model import Order
from app.features.products import schemas, service
from app.features.products.model import Product, ProductImage, ProductReview
from app.features.products.schemas import (
    ProductCreate,
    ProductFilters,
    ProductPatch,
    ProductResponse,
)
from app.features.users.model import User
from app.integrations.minio_client import (
    MINIO_BUCKET,
    MINIO_EXTERNAL_URL,
    minio_client,
)

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


# Image and review behavior remains in this router until Tasks 4 and 5. Task 3 only
# moves these existing endpoints under the versioned product prefix.
@router.post(
    "/{product_id}/upload-image",
    summary="Upload product image",
)
def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    product = (
        db.query(Product)
        .filter(
            Product.id == product_id,
            Product.is_deleted == False,
        )
        .first()
    )

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    image_id = str(uuid4())
    file_extension = file.filename.split(".")[-1]
    object_name = f"products/{image_id}.{file_extension}"

    minio_client.put_object(
        bucket_name=MINIO_BUCKET,
        object_name=object_name,
        data=file.file,
        length=-1,
        part_size=10 * 1024 * 1024,
        content_type=file.content_type,
    )
    new_image = ProductImage(
        id=image_id,
        product_id=product.id,
        object_name=object_name,
    )

    save_to_db(db, new_image)

    image_url = f"{MINIO_EXTERNAL_URL}/{MINIO_BUCKET}/{object_name}"
    return {
        "message": "Image uploaded successfully",
        "product_id": product.id,
        "image": {
            "id": new_image.id,
            "object_name": new_image.object_name,
            "image_url": image_url,
        },
    }


@router.get(
    "/{product_id}/reviews",
    summary="Get product reviews and average rating",
)
def get_product_reviews(product_id: int, db: Session = Depends(get_db)):
    product = (
        db.query(Product)
        .filter(
            Product.id == product_id,
            Product.is_deleted == False,
        )
        .first()
    )

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    reviews = (
        db.query(ProductReview)
        .filter(ProductReview.product_id == product_id)
        .order_by(ProductReview.created_at.desc())
        .all()
    )

    total_reviews = len(reviews)
    avg_rating = (
        sum(review.rating for review in reviews) / total_reviews
        if total_reviews > 0
        else 5.0
    )

    review_list = [
        {
            "id": review.id,
            "product_id": review.product_id,
            "user_id": review.user_id,
            "user_name": review.user.full_name if review.user else "Anonymous User",
            "rating": review.rating,
            "title": review.title,
            "comment": review.comment,
            "is_verified_purchase": review.is_verified_purchase,
            "created_at": (
                review.created_at.isoformat() if review.created_at else None
            ),
        }
        for review in reviews
    ]

    return {
        "average_rating": round(avg_rating, 1),
        "total_reviews": total_reviews,
        "reviews": review_list,
    }


@router.post(
    "/{product_id}/reviews",
    status_code=status.HTTP_201_CREATED,
    summary="Submit product review",
)
def create_product_review(
    product_id: int,
    review_data: schemas.ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if review_data.rating < 1 or review_data.rating > 5:
        raise HTTPException(
            status_code=400,
            detail="Rating must be between 1 and 5",
        )

    product = (
        db.query(Product)
        .filter(
            Product.id == product_id,
            Product.is_deleted == False,
        )
        .first()
    )

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    paid_order = (
        db.query(Order)
        .filter(
            Order.user_id == current_user.id,
            Order.product_id == product_id,
            Order.status == "paid",
        )
        .first()
    )
    is_verified = paid_order is not None

    new_review = ProductReview(
        product_id=product_id,
        user_id=current_user.id,
        rating=review_data.rating,
        title=review_data.title,
        comment=review_data.comment,
        is_verified_purchase=is_verified,
    )
    saved_review = save_to_db(db, new_review)

    return {
        "id": saved_review.id,
        "product_id": saved_review.product_id,
        "user_id": saved_review.user_id,
        "user_name": current_user.full_name,
        "rating": saved_review.rating,
        "title": saved_review.title,
        "comment": saved_review.comment,
        "is_verified_purchase": saved_review.is_verified_purchase,
        "created_at": (
            saved_review.created_at.isoformat() if saved_review.created_at else None
        ),
    }
