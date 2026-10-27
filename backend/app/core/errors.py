import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: Any | None = None


COMMON_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse, "description": "Invalid application request"},
    401: {"model": ErrorResponse, "description": "Authentication required"},
    403: {"model": ErrorResponse, "description": "Access forbidden"},
    404: {"model": ErrorResponse, "description": "Resource not found"},
    409: {"model": ErrorResponse, "description": "Resource conflict"},
    500: {"model": ErrorResponse, "description": "Internal server error"},
}


class ApplicationError(Exception):
    status_code = 400
    code = "application_error"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details
        if code is not None:
            self.code = code


class ResourceNotFoundError(ApplicationError):
    status_code = 404
    code = "resource_not_found"


class ConflictError(ApplicationError):
    status_code = 409
    code = "conflict"


class ForbiddenError(ApplicationError):
    status_code = 403
    code = "forbidden"


class AuthenticationError(ApplicationError):
    status_code = 401
    code = "authentication_failed"


class BusinessRuleError(ApplicationError):
    status_code = 400
    code = "business_rule_violation"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApplicationError)
    async def handle_application_error(
        _request: Request,
        exc: ApplicationError,
    ) -> JSONResponse:
        response = ErrorResponse(
            code=exc.code,
            message=exc.message,
            details=exc.details,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=response.model_dump(mode="json"),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        _request: Request,
        exc: Exception,
    ) -> JSONResponse:
        logger.error(
            "Unhandled application error",
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        response = ErrorResponse(
            code="internal_server_error",
            message="Internal server error",
        )
        return JSONResponse(
            status_code=500,
            content=response.model_dump(mode="json"),
        )
