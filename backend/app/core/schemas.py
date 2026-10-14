from datetime import datetime, timezone
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, Field, PlainSerializer

T = TypeVar("T")


def serialize_utc_datetime(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    iso = dt.isoformat()
    if iso.endswith("+00:00"):
        return iso[:-6] + "Z"
    return iso if iso.endswith("Z") else iso + "Z"


UtcDatetime = Annotated[
    datetime,
    PlainSerializer(serialize_utc_datetime, return_type=str, when_used="json"),
]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int = Field(ge=0)
    limit: int = Field(gt=0)
    offset: int = Field(ge=0)
