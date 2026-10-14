from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError, ConflictError, ResourceNotFoundError
from app.core.schemas import Page
from app.core.slug import generate_unique_slug, slugify
from app.features.categories.model import Category
from app.features.categories.schemas import (
    CategoryCreate,
    CategoryPatch,
    CategoryTreeItem,
)
from app.features.products.model import Product


def create_category(
    db: Session,
    command: CategoryCreate,
    actor_id: int,
) -> Category:
    if command.parent_id is not None:
        parent = _get_active_category(db, command.parent_id)
        if parent.parent_id is not None:
            raise BusinessRuleError(
                "Cannot create subcategory under a child category (maximum 2 levels)",
                code="category_depth_exceeded",
            )

    existing_slugs = set(s[0] for s in db.query(Category.slug).all())
    base_slug = slugify(command.slug) if command.slug else slugify(command.name)
    slug = generate_unique_slug(base_slug or "category", existing_slugs)

    category = Category(
        name=command.name,
        slug=slug,
        parent_id=command.parent_id,
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

    updates = command.model_dump(exclude_unset=True)

    if "parent_id" in updates:
        new_parent_id = updates["parent_id"]
        if new_parent_id is not None:
            if new_parent_id == category_id:
                raise BusinessRuleError(
                    "Category cannot be its own parent",
                    code="category_cycle_detected",
                )
            parent = _get_active_category(db, new_parent_id)
            if parent.parent_id is not None:
                raise BusinessRuleError(
                    "Cannot assign child category as parent (maximum 2 levels)",
                    code="category_depth_exceeded",
                )
            # Cannot assign parent to category that has subcategories
            has_children = (
                db.query(Category)
                .filter(
                    Category.parent_id == category_id,
                    Category.is_deleted.is_(False),
                )
                .first()
                is not None
            )
            if has_children:
                raise BusinessRuleError(
                    "Cannot assign parent to a category that already has subcategories",
                    code="category_depth_exceeded",
                )

    if "slug" in updates and updates["slug"]:
        existing_slugs = set(
            s[0]
            for s in db.query(Category.slug).filter(Category.id != category_id).all()
        )
        updates["slug"] = generate_unique_slug(
            slugify(updates["slug"]) or "category", existing_slugs
        )

    for field, value in updates.items():
        setattr(category, field, value)
    category.updated_by = actor_id

    db.commit()
    db.refresh(category)
    return category


def delete_category(db: Session, category_id: int, actor_id: int) -> None:
    category = _get_active_category(db, category_id)

    has_active_products = (
        db.query(Product)
        .filter(
            Product.category_id == category_id,
            Product.is_deleted.is_(False),
        )
        .first()
        is not None
    )
    if has_active_products:
        raise ConflictError(
            "Cannot delete category with active products",
            code="category_in_use",
        )

    has_active_children = (
        db.query(Category)
        .filter(
            Category.parent_id == category_id,
            Category.is_deleted.is_(False),
        )
        .first()
        is not None
    )
    if has_active_children:
        raise ConflictError(
            "Cannot delete category with active subcategories",
            code="category_in_use",
        )

    category.is_deleted = True
    category.deleted_at = datetime.now(timezone.utc)
    category.deleted_by = actor_id
    db.commit()


def get_category_tree(db: Session) -> list[CategoryTreeItem]:
    all_categories = (
        db.query(Category)
        .filter(Category.is_deleted.is_(False))
        .order_by(Category.name.asc())
        .all()
    )

    children_by_parent: dict[int, list[CategoryTreeItem]] = {}
    roots: list[Category] = []

    for cat in all_categories:
        if cat.parent_id is None:
            roots.append(cat)
        else:
            children_by_parent.setdefault(cat.parent_id, []).append(
                CategoryTreeItem(
                    id=cat.id,
                    name=cat.name,
                    slug=cat.slug,
                    description=cat.description,
                    parent_id=cat.parent_id,
                    children=[],
                )
            )

    result: list[CategoryTreeItem] = []
    for root in roots:
        result.append(
            CategoryTreeItem(
                id=root.id,
                name=root.name,
                slug=root.slug,
                description=root.description,
                parent_id=None,
                children=children_by_parent.get(root.id, []),
            )
        )
    return result


def get_category_and_descendant_ids(db: Session, category_id: int) -> list[int]:
    child_ids = [
        row[0]
        for row in db.query(Category.id)
        .filter(
            Category.parent_id == category_id,
            Category.is_deleted.is_(False),
        )
        .all()
    ]
    return [category_id, *child_ids]


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
