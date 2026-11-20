"""Capture validated login identity before SlowAPI evaluates route limits."""

import hashlib
import hmac

from fastapi import Request

from app.core.config import get_settings
from app.core.rate_limiter import get_client_ip
from app.features.users.schemas import LoginCommand


def prepare_login_command(request: Request, command: LoginCommand) -> LoginCommand:
    digest = hmac.new(
        get_settings().secret_key.encode(),
        command.identifier.strip().casefold().encode(),
        hashlib.sha256,
    ).hexdigest()
    # Scoped to the caller's IP as well, so a stranger hammering a victim's identifier
    # exhausts only their own budget and cannot lock the real owner out.
    request.state.login_identifier_key = (
        f"login-identifier:{digest}:{get_client_ip(request)}"
    )
    return command


def login_identifier_key(request: Request) -> str:
    return request.state.login_identifier_key
