import logging

import redis
from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.features.health.schemas import HealthComponents, HealthResponse

router = APIRouter(prefix="/api/v1/health", tags=["Health"])
logger = logging.getLogger(__name__)


@router.get("", response_model=HealthResponse, summary="System health check")
def health_check(response: Response, db: Session = Depends(get_db)) -> HealthResponse:
    db_status = "healthy"
    try:
        db.execute(text("SELECT 1")).scalar()
    except Exception:
        logger.exception("Health check: database unavailable")
        db_status = "unhealthy"
        response.status_code = 503

    settings = get_settings()
    redis_status = "memory"
    if settings.redis_url.startswith("redis://"):
        try:
            with redis.Redis.from_url(
                settings.redis_url, socket_timeout=2, socket_connect_timeout=2
            ) as r:
                r.ping()
            redis_status = "healthy"
        except Exception:
            logger.exception("Health check: Redis unavailable")
            redis_status = "degraded"

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
