from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    parent_id: int | None = Field(default=None)
    description: str | None = Field(default=None, max_length=1000)


class CategoryPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    parent_id: int | None = Field(default=None)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def reject_null_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("name cannot be null")
        return value


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    parent_id: int | None = None
    description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    created_by: int | None = None
    updated_by: int | None = None
    deleted_by: int | None = None


class CategoryTreeItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None = None
    parent_id: int | None = None
    children: list[CategoryTreeItem] = []


CategoryTreeItem.model_rebuild()
