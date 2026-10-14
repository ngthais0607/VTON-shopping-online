import ipaddress

from fastapi import Request
from slowapi import Limiter

from app.core.config import get_settings


def get_client_ip(request: Request) -> str:
    """
    Resolve client IP for rate limiting.
    Only trust X-Forwarded-For if the immediate connection IP (request.client.host)
    is within the configured forwarded_allow_ips.
    Otherwise, rate limit by request.client.host directly.
    """
    client_host = request.client.host if request.client and request.client.host else "127.0.0.1"

    app = request.scope.get("app") if hasattr(request, "scope") and isinstance(request.scope, dict) else None
    app_state = getattr(app, "state", None)
    settings = getattr(app_state, "settings", None)
    raw_trusted = getattr(settings, "forwarded_allow_ips", None) if settings is not None else None
    if raw_trusted is None:
        raw_trusted = get_settings().forwarded_allow_ips

    raw_trusted = (raw_trusted or "").strip()
    if not raw_trusted:
        return client_host

    trusted_items = [item.strip() for item in raw_trusted.split(",") if item.strip()]
    if not trusted_items:
        return client_host

    is_trusted = False
    if "*" in trusted_items:
        is_trusted = True
    else:
        try:
            client_addr = ipaddress.ip_address(client_host)
            for item in trusted_items:
                try:
                    net = ipaddress.ip_network(item, strict=False)
                    if client_addr in net:
                        is_trusted = True
                        break
                except ValueError:
                    if client_host == item:
                        is_trusted = True
                        break
        except ValueError:
            is_trusted = client_host in trusted_items

    if not is_trusted:
        return client_host

    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if not xff:
        return client_host

    parts = [p.strip() for p in xff.split(",") if p.strip()]
    if parts:
        return parts[0]

    return client_host


redis_url = get_settings().redis_url.strip() or "memory://"
storage_options = {}
if redis_url.startswith("redis"):
    storage_options["protocol"] = 2

try:
    limiter = Limiter(
        key_func=get_client_ip,
        storage_uri=redis_url,
        storage_options=storage_options,
        swallow_errors=True,
        in_memory_fallback_enabled=True,
    )
except Exception:
    limiter = Limiter(
        key_func=get_client_ip,
        storage_uri="memory://",
        swallow_errors=True,
    )
