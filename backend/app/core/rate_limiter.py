from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

redis_url = get_settings().redis_url.strip() or "memory://"
storage_options = {}
if redis_url.startswith("redis"):
    storage_options["protocol"] = 2

try:
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri=redis_url,
        storage_options=storage_options,
    )
except Exception:
    limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")
