from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.core.rate_limiter import limiter
from app.features.categories.router import router as categories_router
from app.features.dashboard.router import router as dashboard_router
from app.features.orders.router import router as order_router
from app.features.products.router import router as product_router
from app.features.users.router import router as user_router
from app.integrations.minio_client import ensure_bucket_exists


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    ensure_bucket_exists()
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    application_settings = settings or get_settings()
    application = FastAPI(
        title="AI-VTON E-Commerce Platform",
        lifespan=lifespan,
    )

    application.state.settings = application_settings
    application.state.limiter = limiter
    application.add_exception_handler(
        RateLimitExceeded,
        _rate_limit_exceeded_handler,
    )
    register_error_handlers(application)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=application_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(product_router)
    application.include_router(user_router)
    application.include_router(categories_router)
    application.include_router(order_router)
    application.include_router(dashboard_router)

    @application.get("/")
    def root() -> dict[str, str]:
        return {"message": "AI-VTON API is running"}

    return application


app = create_app()
