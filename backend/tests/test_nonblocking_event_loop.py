import inspect

from app.features.orders import router as order_router
from app.features.users import router as user_router


def test_db_lock_endpoints_are_synchronous():
    # Endpoints with synchronous DB transactions must be 'def' (not 'async def')
    # so FastAPI executes them in the worker threadpool instead of blocking the main event loop.
    assert not inspect.iscoroutinefunction(order_router.checkout_cart)
    assert not inspect.iscoroutinefunction(order_router.update_order_status)
    assert not inspect.iscoroutinefunction(user_router.register_user)
