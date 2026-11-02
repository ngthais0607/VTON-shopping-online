from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.errors import ForbiddenError
from app.features.orders.constants import OrderStatus
from app.features.orders.domain import is_order_paid
from app.features.orders.model import Order, OrderItem
from app.features.products import service as product_service
from app.features.products.model import ProductReview
from app.features.products.schemas import (
    FitFeedbackSummary,
    ReviewAggregateSummary,
    ReviewCreate,
    ReviewPage,
)
from app.features.users.model import User


def list_product_reviews(
    db: Session, product_id: int, limit: int = 10, offset: int = 0
) -> ReviewPage:
    product_service.get_product(db, product_id)

    base_query = db.query(ProductReview).filter(ProductReview.product_id == product_id)
    total_reviews, rating, total_fb, small_count, tts_count, large_count = (
        base_query.with_entities(
            func.count(ProductReview.id),
            func.avg(ProductReview.rating),
            func.count(func.nullif(ProductReview.fit_feedback, "")),
            func.count(case((ProductReview.fit_feedback == "small", 1))),
            func.count(case((ProductReview.fit_feedback == "true_to_size", 1))),
            func.count(case((ProductReview.fit_feedback == "large", 1))),
        ).one()
    )
    average_rating = round(float(rating), 1) if rating is not None else None
    fit_feedback_summary = None
    if total_fb:
        fit_feedback_summary = FitFeedbackSummary(
            small=round(small_count / total_fb * 100, 1),
            true_to_size=round(tts_count / total_fb * 100, 1),
            large=round(large_count / total_fb * 100, 1),
            total_responses=total_fb,
        )

    summary = ReviewAggregateSummary(
        average_rating=average_rating,
        total_reviews=total_reviews,
        fit_feedback=fit_feedback_summary,
    )

    page_items = (
        base_query.options(joinedload(ProductReview.user))
        .order_by(ProductReview.created_at.desc(), ProductReview.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return ReviewPage(
        items=page_items,
        total=total_reviews,
        limit=limit,
        offset=offset,
        summary=summary,
        # backwards-compatibility fields
        average_rating=average_rating,
        total_reviews=total_reviews,
        reviews=page_items,
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
    else:
        user_id = user.id

    orders = (
        db.query(Order)
        .outerjoin(Order.items)
        .options(selectinload(Order.payments))
        .filter(
            Order.user_id == user_id,
            (Order.product_id == product_id) | (OrderItem.product_id == product_id),
            ~Order.status.in_(
                [
                    OrderStatus.CANCELLED.value,
                    OrderStatus.EXPIRED.value,
                    OrderStatus.CANCELLED,
                    OrderStatus.EXPIRED,
                ]
            ),
        )
        .all()
    )

    if not any(is_order_paid(o) for o in orders):
        raise ForbiddenError(
            "Only verified purchasers can review this product",
            code="review_not_eligible_unpurchased",
        )

    # Lock user row to serialize concurrent first submissions
    db.query(User).filter(User.id == user_id).with_for_update().first()

    existing = (
        db.query(ProductReview)
        .filter(
            ProductReview.user_id == user_id,
            ProductReview.product_id == product_id,
        )
        .first()
    )

    if existing is not None:
        existing.rating = command.rating
        existing.title = command.title
        existing.comment = command.comment
        existing.fit_feedback = command.fit_feedback
        existing.is_verified_purchase = True
        db.commit()
        db.refresh(existing)
        product_service.invalidate_catalog_cache()
        return existing

    review = ProductReview(
        product_id=product_id,
        user_id=user_id,
        rating=command.rating,
        title=command.title,
        comment=command.comment,
        fit_feedback=command.fit_feedback,
        is_verified_purchase=True,
    )
    db.add(review)
    try:
        db.commit()
        db.refresh(review)
    except IntegrityError:
        db.rollback()
        # Concurrent first submission collision recovery
        existing = (
            db.query(ProductReview)
            .filter(
                ProductReview.user_id == user_id,
                ProductReview.product_id == product_id,
            )
            .first()
        )
        if existing is not None:
            existing.rating = command.rating
            existing.title = command.title
            existing.comment = command.comment
            existing.fit_feedback = command.fit_feedback
            existing.is_verified_purchase = True
            db.commit()
            db.refresh(existing)
            review = existing
        else:
            raise

    product_service.invalidate_catalog_cache()
    return review


# Aliases for router compatibility
create_review = create_product_review
get_product_reviews = list_product_reviews
get_reviews = list_product_reviews
