from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.errors import ResourceNotFoundError
from app.core.schemas import Page
from app.features.categories.model import Category
from app.features.categories.schemas import CategoryCreate, CategoryPatch


def create_category(
    db: Session,
    command: CategoryCreate,
    actor_id: int,
) -> Category:
    category = Category(
        name=command.name,
        description=command.description,
        created_by=actor_id,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def list_categories(
    db: Session,
    search: str | None,
    limit: int,
    offset: int,
) -> Page[Category]:
    query = db.query(Category).filter(Category.is_deleted.is_(False))
    if search:
        query = query.filter(Category.name.ilike(f"%{search}%"))

    total = query.count()
    categories = query.order_by(Category.id).offset(offset).limit(limit).all()
    return Page(items=categories, total=total, limit=limit, offset=offset)


def get_category(db: Session, category_id: int) -> Category:
    return _get_active_category(db, category_id)


def update_category(
    db: Session,
    category_id: int,
    command: CategoryPatch,
    actor_id: int,
) -> Category:
    category = _get_active_category(db, category_id)
    for field, value in command.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    category.updated_by = actor_id

    db.commit()
    db.refresh(category)
    return category


def delete_category(db: Session, category_id: int, actor_id: int) -> None:
    category = _get_active_category(db, category_id)
    category.is_deleted = True
    category.deleted_at = datetime.now(timezone.utc)
    category.deleted_by = actor_id
    db.commit()


def _get_active_category(db: Session, category_id: int) -> Category:
    category = (
        db.query(Category)
        .filter(
            Category.id == category_id,
            Category.is_deleted.is_(False),
        )
        .first()
    )
    if category is None:
        raise ResourceNotFoundError(
            f"Category {category_id} was not found",
            code="category_not_found",
        )
    return category
