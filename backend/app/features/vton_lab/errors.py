from app.core.errors import ApplicationError


class VtonEngineError(ApplicationError):
    """The engine could not produce an image (remote API down, model missing...)."""

    status_code = 502
    code = "vton_engine_failed"


class VtonConfigError(ApplicationError):
    """The engines config file is missing, unreadable or invalid."""

    status_code = 503
    code = "vton_config_invalid"
