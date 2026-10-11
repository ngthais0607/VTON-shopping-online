from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db, save_to_db
from app.core.schemas import Page
from app.core.security import get_current_admin, get_current_user
from app.features.products import reviews, service
from app.features.products.model import Product, ProductImage
from app.features.products.schemas import (
    ProductCreate,
    ProductFilters,
    ProductPatch,
    ProductResponse,
    ReviewCreate,
    ReviewResponse,
    ReviewSummary,
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
    response_model=ReviewSummary,
    summary="Get product reviews and average rating",
)
def get_product_reviews(product_id: int, db: Session = Depends(get_db)):
    return reviews.list_product_reviews(db, product_id)


@router.post(
    "/{product_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit product review",
)
def create_product_review(
    product_id: int,
    command: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return reviews.create_product_review(db, product_id, current_user, command)
