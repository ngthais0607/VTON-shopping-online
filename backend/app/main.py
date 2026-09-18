import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()
from app.features.orders.model import Order, Payment
from app.features.products.model import Product, ProductImage
from app.features.users.model import User
from app.features.categories.model import Category

from app.core.database import Base, engine
from app.features.users.router import router as user_router
from app.features.products.router import router as product_router
from app.features.categories.router import router as categories_router
from app.features.orders.router import router as order_router
from app.integrations.minio_client import ensure_bucket_exists

from app.features.dashboard.router import router as dashboard_router

from fastapi.middleware.cors import CORSMiddleware

Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.core.rate_limiter import limiter

app = FastAPI(
    title="AI-VTON E-Commerce Platform",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

cors_origins_str = os.getenv("CORS_ORIGINS", "http://localhost:3000")
cors_origins = [o.strip() for o in cors_origins_str.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_bucket_exists()

app.include_router(product_router)
app.include_router(user_router)
app.include_router(categories_router)
app.include_router(order_router)
app.include_router(dashboard_router)


@app.get("/")
def root():
    return {
        "message": "AI-VTON API is running"
    }
