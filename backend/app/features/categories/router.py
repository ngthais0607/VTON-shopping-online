from fastapi import APIRouter, Depends, HTTPException, status, Query 
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.features.categories import schema
from app.core import database
from app.core.database import get_db, save_to_db
from app.features.categories.model import Category
from app.core.security import get_current_admin
from app.features.users.model import User



router = APIRouter(
    prefix="/categories",
    tags=["Categories"]
)

def category_to_db(category: schema.CategoryBase):
    return Category(
        name=category.name,
        description=category.description
        
    )
def category_to_json(category: Category):
    product_count = len([product for product in category.products if not product.is_deleted])
    return {
        "id": category.id,
        "name": category.name,
        "description": category.description,
        "product_count": product_count,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
        "created_by": category.created_by,
        "updated_by": category.updated_by,
        "deleted_by": category.deleted_by
    }

@router.post(
    "",    
    status_code=status.HTTP_201_CREATED,
    summary="Create category"       
)
def create_category(    
    category: schema.CategoryBase,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    new_category = category_to_db(category)

    saved_category = save_to_db(db, new_category)
    return category_to_json(saved_category)
        
@router.get(
    "/{category_id}",
    summary="Get category by ID"
)
def get_category(
    category_id: int,
    db: Session = Depends(get_db)
):
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.is_deleted == False
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail="Category not found"
        )

    return category_to_json(category)

@router.get(
    "",    
    summary="Get categories"
)
def get_categories(
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(Category).filter(
        Category.is_deleted == False
    )
    if search:
        query = query.filter(
            Category.name.ilike(f"%{search}%")
        )

    categories = query.offset(offset).limit(limit).all()

    return [
        category_to_json(category)
        for category in categories
    ]

@router.put(
    "/{category_id}",
    summary="Update category"
)
def update_category(
    category_id: int,
    updated_category: schema.CategoryUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.is_deleted == False 
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail="Category not found"
        )

    for key, value in updated_category.model_dump(exclude_unset=True).items():
        setattr(category, key, value)

    save_to_db(db, category)

    return category_to_json(category)


@router.delete(
    "/{category_id}",  
    summary="Delete category"
)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.is_deleted == False
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail="Category not found"
        )
    deleted_at = datetime.now(timezone.utc)

    category.is_deleted = True
    category.deleted_at = deleted_at
    category.deleted_by = current_admin.id

    db.commit()

    return {"message": "Category deleted successfully"}

