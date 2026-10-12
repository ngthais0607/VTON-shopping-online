from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.routing import BaseRoute

from app.main import app

HTTP_METHODS = {"delete", "get", "head", "options", "patch", "post", "put"}
COMMON_ERROR_STATUSES = {"400", "401", "403", "404", "409", "500"}


def _unversioned_application_paths(routes: list[BaseRoute]) -> list[str]:
    return sorted(
        route.path
        for route in routes
        if isinstance(route, APIRoute)
        and route.path != "/"
        and route.path != "/api/v1"
        and not route.path.startswith("/api/v1/")
    )


def test_hidden_unversioned_route_is_rejected() -> None:
    mutation_app = FastAPI()

    @mutation_app.get("/legacy", include_in_schema=False)
    def hidden_legacy_route() -> dict[str, bool]:
        return {"legacy": True}

    assert "/legacy" not in mutation_app.openapi()["paths"]
    assert _unversioned_application_paths(mutation_app.routes) == ["/legacy"]


def test_all_application_paths_are_root_or_versioned() -> None:
    assert _unversioned_application_paths(app.routes) == []


def test_every_operation_documents_the_common_error_shape() -> None:
    schema = app.openapi()
    error_schema = schema["components"]["schemas"]["ErrorResponse"]
    assert set(error_schema["required"]) == {"code", "message"}
    assert set(error_schema["properties"]) == {"code", "message", "details"}

    missing: list[str] = []
    wrong_schema: list[str] = []
    for path, path_item in schema["paths"].items():
        for method, operation in path_item.items():
            if method not in HTTP_METHODS:
                continue
            responses = operation["responses"]
            absent = COMMON_ERROR_STATUSES - responses.keys()
            if absent:
                missing.append(f"{method.upper()} {path}: {sorted(absent)}")
            for status_code in COMMON_ERROR_STATUSES & responses.keys():
                response_schema = responses[status_code]["content"]["application/json"][
                    "schema"
                ]
                if response_schema != {"$ref": "#/components/schemas/ErrorResponse"}:
                    wrong_schema.append(
                        f"{method.upper()} {path} {status_code}: {response_schema}"
                    )

    assert missing == []
    assert wrong_schema == []
