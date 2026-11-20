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
    client_host = (
        request.client.host if request.client and request.client.host else "127.0.0.1"
    )

    app = (
        request.scope.get("app")
        if hasattr(request, "scope") and isinstance(request.scope, dict)
        else None
    )
    app_state = getattr(app, "state", None)
    settings = getattr(app_state, "settings", None)
    raw_trusted = (
        getattr(settings, "forwarded_allow_ips", None) if settings is not None else None
    )
    if raw_trusted is None:
        raw_trusted = get_settings().forwarded_allow_ips

    raw_trusted = (raw_trusted or "").strip()
    if not raw_trusted:
        return client_host

    trusted_items = [item.strip() for item in raw_trusted.split(",") if item.strip()]
    if not trusted_items:
        return client_host

    if not _is_trusted_proxy(client_host, trusted_items):
        return client_host

    xff = request.headers.get("x-forwarded-for")
    if not xff:
        return client_host

    # Each proxy appends the address it received the request from, so only the
    # entries to the right of the last untrusted hop are reliable. The leftmost
    # entry is whatever the client chose to send. Walk right-to-left past our own
    # proxies; the first address that is not one of them is the real client.
    # A "*" wildcard only vouches for the direct peer; it cannot identify which
    # forwarded hops are proxies, so it resolves to the rightmost entry.
    hop_proxies = [item for item in trusted_items if item != "*"]
    parts = [p.strip() for p in xff.split(",") if p.strip()]
    for hop in reversed(parts):
        if not _is_trusted_proxy(hop, hop_proxies):
            return hop
    return client_host


def _is_trusted_proxy(host: str, trusted_items: list[str]) -> bool:
    if "*" in trusted_items:
        return True
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return host in trusted_items
    for item in trusted_items:
        try:
            if addr in ipaddress.ip_network(item, strict=False):
                return True
        except ValueError:
            if host == item:
                return True
    return False


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
