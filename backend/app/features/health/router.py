from fastapi import APIRouter, Depends
import redis
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.features.health.schemas import HealthComponents, HealthResponse

router = APIRouter(prefix="/api/v1/health", tags=["Health"])


@router.get("", response_model=HealthResponse, summary="System health check")
def health_check(db: Session = Depends(get_db)) -> HealthResponse:
    db_status = "healthy"
    try:
        db.execute(text("SELECT 1")).scalar()
    except Exception as exc:
        db_status = f"unhealthy: {exc}"

    settings = get_settings()
    redis_status = "memory"
    if settings.redis_url.startswith("redis://"):
        try:
            r = redis.Redis.from_url(settings.redis_url, socket_timeout=2)
            r.ping()
            redis_status = "healthy"
        except Exception as exc:
            redis_status = f"degraded: {exc}"

    storage_status = "configured"
    is_ok = db_status == "healthy"

    components = HealthComponents(
        database=db_status,
        redis=redis_status,
        storage=storage_status,
    )
    return HealthResponse(
        status="ok" if is_ok else "unhealthy",
        components=components,
    )
