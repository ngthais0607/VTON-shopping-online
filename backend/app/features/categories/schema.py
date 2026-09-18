from pydantic import BaseModel

class CategoryBase(BaseModel):
    name: str       
    description: str | None = None

class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    updated_by_id: int | None = None

class CategoryDelete(BaseModel):
    deleted_by_id: int | None = None

