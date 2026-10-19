import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Nạp mã nguồn dự án vào sys.path để import app module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import cấu hình và metadata từ dự án FastAPI
from app.core.database import DATABASE_URL, Base

# Import all models to ensure they register on Base.metadata for autogenerate
from app.features.categories.model import Category  # noqa: F401  # Alembic autogenerate registration
from app.features.orders.model import Order, Payment  # noqa: F401  # Alembic autogenerate registration
from app.features.products.model import Product, ProductImage, ProductReview  # noqa: F401  # Alembic autogenerate registration
from app.features.products.variant_model import ProductVariant  # noqa: F401  # Alembic autogenerate registration
from app.features.users.model import User  # noqa: F401  # Alembic autogenerate registration
from app.features.users.session_model import UserSession  # noqa: F401

# this is the Alembic Config object, which provides access to the values within the .ini file in use.
config = context.config

# Ghi đè cấu hình sqlalchemy.url bằng cấu hình truyền vào hoặc biến môi trường
config_url = config.get_main_option("sqlalchemy.url")
if config_url and config_url != "sqlite:///./app.db":
    target_url = config_url
else:
    target_url = os.environ.get("DATABASE_URL") or os.environ.get("TEST_DATABASE_URL") or DATABASE_URL
config.set_main_option("sqlalchemy.url", target_url)

# Interpret the config file for Python logging without resetting existing loggers.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    is_sqlite = url.startswith("sqlite") if url else False
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=is_sqlite,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        is_sqlite = connection.dialect.name == "sqlite"
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=is_sqlite,
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
