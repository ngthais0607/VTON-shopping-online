from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import UtcDatetime


def _not_blank(value: str | None) -> str | None:
    if value is not None and not value.strip():
        raise ValueError("name cannot be blank")
    return value


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    parent_id: int | None = Field(default=None)
    description: str | None = Field(default=None, max_length=1000)

    _name_not_blank = field_validator("name")(_not_blank)


class CategoryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    parent_id: int | None = Field(default=None)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def reject_null_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("name cannot be null")
        return _not_blank(value)


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    parent_id: int | None = None
    description: str | None = None
    created_at: UtcDatetime | None = None
    updated_at: UtcDatetime | None = None
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
