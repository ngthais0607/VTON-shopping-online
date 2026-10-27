"""Capture validated login identity before SlowAPI evaluates route limits."""

import hashlib
import hmac

from fastapi import Request

from app.core.config import get_settings
from app.features.users.schemas import LoginCommand


def prepare_login_command(request: Request, command: LoginCommand) -> LoginCommand:
    digest = hmac.new(
        get_settings().secret_key.encode(),
        command.identifier.strip().casefold().encode(),
        hashlib.sha256,
    ).hexdigest()
    request.state.login_identifier_key = "login-identifier:" + digest
    return command


def login_identifier_key(request: Request) -> str:
    return request.state.login_identifier_key
