from sqlalchemy.orm import Session, joinedload

from app.features.orders.model import Order, OrderItem
from app.features.products import service as product_service
from app.features.products.model import ProductReview
from app.features.products.schemas import ReviewCreate, ReviewSummary
from app.features.users.model import User


def list_product_reviews(db: Session, product_id: int) -> ReviewSummary:
    product_service.get_product(db, product_id)
    reviews = (
        db.query(ProductReview)
        .options(joinedload(ProductReview.user))
        .filter(ProductReview.product_id == product_id)
        .order_by(ProductReview.created_at.desc())
        .all()
    )
    total_reviews = len(reviews)
    average_rating = (
        round(sum(review.rating for review in reviews) / total_reviews, 1)
        if reviews
        else None
    )
    return ReviewSummary(
        average_rating=average_rating,
        total_reviews=total_reviews,
        reviews=reviews,
    )


def create_product_review(
    db: Session,
    product_id: int,
    user: User,
    command: ReviewCreate,
) -> ProductReview:
    product_service.get_product(db, product_id)
    paid_order = (
        db.query(Order)
        .outerjoin(Order.items)
        .filter(
            Order.user_id == user.id,
            (Order.product_id == product_id) | (OrderItem.product_id == product_id),
            Order.status == "paid",
        )
        .first()
    )
    review = ProductReview(
        product_id=product_id,
        user_id=user.id,
        rating=command.rating,
        title=command.title,
        comment=command.comment,
        is_verified_purchase=paid_order is not None,
        user=user,
    )
    db.add(review)
    db.flush()
    db.commit()
    return review
