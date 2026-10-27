from pydantic import BaseModel


class HealthComponents(BaseModel):
    database: str
    redis: str
    storage: str


class HealthResponse(BaseModel):
    status: str
    components: HealthComponents
