from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.core.schemas import UtcDatetime


class VtonEligibilityResponse(BaseModel):
    eligible: bool
    cloth_type: str | None = None
    reason: str | None = None
    engine: str
    daily_quota: int


class VtonQuotaResponse(BaseModel):
    limit: int
    used: int
    remaining: int
    retention_hours: int


class VtonTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: int
    variant_id: int | None = None
    cloth_type: str
    status: str
    engine: str
    error_code: str | None = None
    # Internal object keys are never serialized; only the has_* flags are exposed.
    person_object: str | None = Field(default=None, exclude=True)
    result_object: str | None = Field(default=None, exclude=True)
    created_at: UtcDatetime
    finished_at: UtcDatetime | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_result(self) -> bool:
        return self.status == "succeeded" and self.result_object is not None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_person_image(self) -> bool:
        return self.person_object is not None


class VtonTaskPage(BaseModel):
    items: list[VtonTaskResponse]
    total: int
