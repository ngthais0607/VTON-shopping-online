"""Import every ORM model so SQLAlchemy can resolve cross-feature relationships.

The API gets this for free through its routers; standalone processes (the VTON
worker) must import it explicitly or mapper configuration fails at first query.
"""

from app.features.categories import model as categories_model
from app.features.orders import model as orders_model
from app.features.products import model as products_model
from app.features.products import variant_model
from app.features.users import model as users_model
from app.features.users import session_model
from app.features.vton import model as vton_model

__all__ = [
    "categories_model",
    "orders_model",
    "products_model",
    "variant_model",
    "users_model",
    "session_model",
    "vton_model",
]
