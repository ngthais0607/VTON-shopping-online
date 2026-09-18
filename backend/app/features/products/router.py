from app.features.products.model import ProductImage, ProductReview
from app.features.categories.model import Category
from app.features.orders.model import Order

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload, selectinload
from datetime import datetime, timezone
from uuid import uuid4
from app.integrations.minio_client import minio_client, MINIO_BUCKET, MINIO_EXTERNAL_URL
from app.features.products import schema
from app.core import database
from app.core.database import get_db, save_to_db
from app.features.products.model import Product
from app.core.security import get_current_admin, get_current_user
from app.features.users.model import User

router = APIRouter(
    prefix="/products",
    tags=["Products"]
)


def product_to_json(product: Product):
    return {
        "id": product.id,
        "name": product.name,
        "price": product.price,
        "description": product.description,
        "created_at": product.created_at,
        "updated_at": product.updated_at,  
        "stock_quantity": product.stock_quantity,
        "reserved_quantity": product.reserved_quantity,
        "sold_quantity": product.sold_quantity,
        "currency": product.currency,
        "is_active": product.is_active,
        "category": {
            "id": product.category.id,
            "name": product.category.name
        } if product.category else None,
        "images": [
            {
                "id": image.id,
                "object_name": image.object_name,
                "url": f"{MINIO_EXTERNAL_URL}/{MINIO_BUCKET}/{image.object_name}"
            } for image in product.images               
        ]
    }


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    summary="Create product"
)
def create_product(
    product: schema.ProductCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    if product.category_id:
        category = db.query(Category).filter(
            Category.id == product.category_id,
            Category.is_deleted == False
        ).first()

        if not category:
            raise HTTPException(
                status_code=404,
                detail="Category not found"
            )

    new_product = Product(
        name=product.name,
        price=product.price,
        description=product.description,
        category_id=product.category_id,
        stock_quantity=product.stock_quantity,
        reserved_quantity=product.reserved_quantity,
        sold_quantity=product.sold_quantity,
        currency=product.currency,
        is_active=product.is_active
    )

    saved_product = save_to_db(db, new_product)
    return product_to_json(saved_product)


@router.get(
    "/",
    summary="Get products"
)
def get_products(
    category_id: int | None = None,
    search: str | None = None,
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    is_active: bool | None = None,
    stock_status: str | None = None,
    sort_by: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    # Eager load relationships to prevent SQL N+1 query problem
    query = db.query(Product).options(
        joinedload(Product.category),
        selectinload(Product.images)
    ).filter(
        Product.is_deleted == False
    )

    if search:
        query = query.filter(
            or_(
                Product.name.ilike(f"%{search}%"),
                Product.description.ilike(f"%{search}%"),
            )
        )

    if min_price is not None:
        query = query.filter(Product.price >= min_price)

    if max_price is not None:
        query = query.filter(Product.price <= max_price)

    if category_id is not None:
        category = db.query(Category).filter(
            Category.id == category_id,
            Category.is_deleted == False
        ).first()
        if not category:
            raise HTTPException(
                status_code=404,
                detail="Category not found"
            )
        query = query.filter(Product.category_id == category_id)

    if is_active is not None:
        query = query.filter(Product.is_active == is_active)

    if stock_status:
        available = Product.stock_quantity - Product.reserved_quantity - Product.sold_quantity
        if stock_status in ("instock", "in_stock"):
            query = query.filter(available > 0)
        elif stock_status in ("low", "low_stock"):
            query = query.filter(available < 20)
        elif stock_status in ("outofstock", "out_of_stock"):
            query = query.filter(available == 0)

    # Handle stable sorting with pagination
    if sort_by in ("price_asc", "price-asc"):
        query = query.order_by(Product.price.asc(), Product.id.desc())
    elif sort_by in ("price_desc", "price-desc"):
        query = query.order_by(Product.price.desc(), Product.id.desc())
    elif sort_by in ("stock_asc", "stock-asc"):
        query = query.order_by(Product.stock_quantity.asc(), Product.id.desc())
    elif sort_by in ("stock_desc", "stock-desc"):
        query = query.order_by(Product.stock_quantity.desc(), Product.id.desc())
    elif sort_by in ("sold_desc", "sold-desc"):
        query = query.order_by(Product.sold_quantity.desc(), Product.id.desc())
    elif sort_by in ("name_asc", "name-asc"):
        query = query.order_by(Product.name.asc(), Product.id.desc())
    else: # latest
        query = query.order_by(Product.created_at.desc(), Product.id.desc())

    total = query.count()
    products = query.offset(offset).limit(limit).all()
    page = (offset // limit) + 1

    return {
        "items": [product_to_json(product) for product in products],
        "total": total,
        "page": page,
        "limit": limit
    }


@router.get(
    "/{product_id}",
    summary="Get product by id"
)
def get_product(
    product_id: int,
    db: Session = Depends(get_db)
):
    product = db.query(Product).options(
        joinedload(Product.category),
        selectinload(Product.images)
    ).filter(
        Product.id == product_id,
        Product.is_deleted == False
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    return product_to_json(product)


@router.put(
    "/{product_id}",
    summary="Update product"
)
def update_product(
    product_id: int,
    updated_product: schema.ProductUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    if updated_product.category_id:
        category = db.query(Category).filter(
           Category.id == updated_product.category_id,
           Category.is_deleted == False
        ).first()

        if not category:
          raise HTTPException(
            status_code=404,
            detail="Category not found"
        )

    product = db.query(Product).filter(
        Product.id == product_id,
        Product.is_deleted == False
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )
    
    product.category_id = updated_product.category_id
    product.name = updated_product.name
    product.price = updated_product.price
    product.description = updated_product.description
    product.stock_quantity = updated_product.stock_quantity
    product.reserved_quantity = updated_product.reserved_quantity
    product.sold_quantity = updated_product.sold_quantity
    product.currency = updated_product.currency
    product.is_active = updated_product.is_active

    saved_product = save_to_db(db, product)
    return product_to_json(saved_product)


@router.delete(
    "/{product_id}",
    summary="Delete product"
)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.is_deleted == False
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    product.is_deleted = True
    product.deleted_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "message": "Product deleted successfully"
    }

@router.post(
    "/{product_id}/upload-image",
    summary="Upload product image"
)
def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.is_deleted == False
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    image_id = str(uuid4())
    file_extension = file.filename.split(".")[-1]
    object_name = f"products/{image_id}.{file_extension}"

    minio_client.put_object(
            bucket_name=MINIO_BUCKET,
            object_name=object_name,
            data=file.file,
            length=-1,
            part_size=10*1024*1024,
            content_type=file.content_type
    )
    new_image = ProductImage(
        id=image_id,
        product_id=product.id,
        object_name=object_name
    )

    save_to_db(db, new_image)
    
    image_url = f"{MINIO_EXTERNAL_URL}/{MINIO_BUCKET}/{object_name}"
    return {
        "message": "Image uploaded successfully",
        "product_id": product.id,
        "image": {
            "id": new_image.id,
            "object_name": new_image.object_name,
            "image_url": image_url
        }
    }


@router.get(
    "/{product_id}/reviews",
    summary="Get product reviews and average rating"
)
def get_product_reviews(
    product_id: int,
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.is_deleted == False
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    reviews = db.query(ProductReview).filter(
        ProductReview.product_id == product_id
    ).order_by(ProductReview.created_at.desc()).all()

    total_reviews = len(reviews)
    avg_rating = (sum(r.rating for r in reviews) / total_reviews) if total_reviews > 0 else 5.0

    review_list = [
        {
            "id": r.id,
            "product_id": r.product_id,
            "user_id": r.user_id,
            "user_name": r.user.full_name if r.user else "Anonymous User",
            "rating": r.rating,
            "title": r.title,
            "comment": r.comment,
            "is_verified_purchase": r.is_verified_purchase,
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in reviews
    ]

    return {
        "average_rating": round(avg_rating, 1),
        "total_reviews": total_reviews,
        "reviews": review_list
    }


@router.post(
    "/{product_id}/reviews",
    status_code=status.HTTP_201_CREATED,
    summary="Submit product review"
)
def create_product_review(
    product_id: int,
    review_data: schema.ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if review_data.rating < 1 or review_data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    product = db.query(Product).filter(
        Product.id == product_id,
        Product.is_deleted == False
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Check if user has purchased this product and order status is 'paid'
    paid_order = db.query(Order).filter(
        Order.user_id == current_user.id,
        Order.product_id == product_id,
        Order.status == "paid"
    ).first()

    is_verified = paid_order is not None

    new_review = ProductReview(
        product_id=product_id,
        user_id=current_user.id,
        rating=review_data.rating,
        title=review_data.title,
        comment=review_data.comment,
        is_verified_purchase=is_verified
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
        "created_at": saved_review.created_at.isoformat() if saved_review.created_at else None
    }