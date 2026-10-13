from sqlalchemy.orm import Session, joinedload

from app.features.orders.model import Order, OrderItem
from app.features.products import service as product_service
from app.features.products.model import ProductReview
from app.features.products.schemas import (
    FitFeedbackSummary,
    ReviewCreate,
    ReviewSummary,
)
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

    feedback_reviews = [r for r in reviews if r.fit_feedback]
    fit_feedback_summary = None
    if feedback_reviews:
        total_fb = len(feedback_reviews)
        small_count = sum(1 for r in feedback_reviews if r.fit_feedback == "small")
        tts_count = sum(1 for r in feedback_reviews if r.fit_feedback == "true_to_size")
        large_count = sum(1 for r in feedback_reviews if r.fit_feedback == "large")
        fit_feedback_summary = FitFeedbackSummary(
            small=round(small_count / total_fb * 100, 1),
            true_to_size=round(tts_count / total_fb * 100, 1),
            large=round(large_count / total_fb * 100, 1),
            total_responses=total_fb,
        )

    return ReviewSummary(
        average_rating=average_rating,
        total_reviews=total_reviews,
        reviews=reviews,
        fit_feedback=fit_feedback_summary,
    )


def create_product_review(
    db: Session,
    product_id: int,
    user: User | int,
    command: ReviewCreate,
) -> ProductReview:
    product_service.get_product(db, product_id)

    if isinstance(user, int):
        user_id = user
        user_obj = db.get(User, user_id)
    else:
        user_id = user.id
        user_obj = user

    paid_order = (
        db.query(Order)
        .outerjoin(Order.items)
        .filter(
            Order.user_id == user_id,
            (Order.product_id == product_id) | (OrderItem.product_id == product_id),
            Order.status == "paid",
        )
        .first()
    )
    review = ProductReview(
        product_id=product_id,
        user_id=user_id,
        rating=command.rating,
        title=command.title,
        comment=command.comment,
        fit_feedback=command.fit_feedback,
        is_verified_purchase=paid_order is not None,
        user=user_obj,
    )
    db.add(review)
    db.flush()
    db.commit()
    return review


# Aliases for router compatibility
create_review = create_product_review
get_product_reviews = list_product_reviews
get_reviews = list_product_reviews
