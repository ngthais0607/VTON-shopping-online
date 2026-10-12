from app.main import app

HTTP_METHODS = {"delete", "get", "head", "options", "patch", "post", "put"}
COMMON_ERROR_STATUSES = {"400", "401", "403", "404", "409", "500"}


def test_all_application_paths_are_root_or_versioned() -> None:
    unversioned = sorted(
        path
        for path in app.openapi()["paths"]
        if path != "/" and path != "/api/v1" and not path.startswith("/api/v1/")
    )

    assert unversioned == []


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
