import ast
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).parents[1]
APP_ROOT = BACKEND_ROOT / "app"
ROUTER_FILES = tuple(sorted((APP_ROOT / "features").glob("**/router.py")))
FORBIDDEN_ROUTER_VENDOR_ROOTS = {"aiosmtplib", "arq", "minio"}


def _parse(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _location(path: Path, node: ast.AST) -> str:
    return f"{path.relative_to(BACKEND_ROOT)}:{node.lineno}"


def _import_roots(node: ast.Import | ast.ImportFrom) -> set[str]:
    if isinstance(node, ast.Import):
        return {alias.name.split(".", 1)[0] for alias in node.names}
    if node.module is None:
        return set()
    return {node.module.split(".", 1)[0]}


def _imported_modules(
    node: ast.Import | ast.ImportFrom,
    *,
    current_package: str | None = None,
) -> set[str]:
    if isinstance(node, ast.Import):
        return {alias.name for alias in node.names}

    if node.level:
        if current_package is None:
            return set()
        package_parts = current_package.split(".")
        parent_count = node.level - 1
        if parent_count >= len(package_parts):
            return set()
        base_parts = package_parts[: len(package_parts) - parent_count]
        if node.module is not None:
            base_parts.extend(node.module.split("."))
        base_module = ".".join(base_parts)
    else:
        base_module = node.module or ""

    imported_modules = {base_module} if base_module else set()
    imported_modules.update(
        f"{base_module}.{alias.name}"
        for alias in node.names
        if base_module and alias.name != "*"
    )
    return imported_modules


@pytest.mark.parametrize(
    ("source", "current_package"),
    [
        ("from app.features.users import router", "app.core"),
        ("from ..features.users import router", "app.core"),
    ],
)
def test_import_resolution_includes_feature_router_aliases(
    source: str,
    current_package: str,
) -> None:
    import_node = ast.parse(source).body[0]
    assert isinstance(import_node, ast.ImportFrom)

    assert "app.features.users.router" in _imported_modules(
        import_node,
        current_package=current_package,
    )


def _orm_model_names() -> set[str]:
    names: set[str] = set()
    for path in (APP_ROOT / "features").glob("**/model.py"):
        for node in ast.walk(_parse(path)):
            if not isinstance(node, ast.ClassDef):
                continue
            if any(
                isinstance(base, ast.Name) and base.id == "Base" for base in node.bases
            ):
                names.add(node.name)
    return names


def test_routers_do_not_own_database_transactions_or_queries() -> None:
    violations: list[str] = []
    for path in ROUTER_FILES:
        for node in ast.walk(_parse(path)):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in {"commit", "query"}
            ):
                violations.append(f"{_location(path, node)} calls .{node.func.attr}()")

    assert violations == []


def test_routers_do_not_construct_orm_entities_or_response_dicts() -> None:
    model_names = _orm_model_names()
    violations: list[str] = []
    for path in ROUTER_FILES:
        for node in ast.walk(_parse(path)):
            if isinstance(node, ast.Call) and (
                isinstance(node.func, ast.Name)
                and node.func.id in model_names
                or isinstance(node.func, ast.Attribute)
                and node.func.attr in model_names
            ):
                model_name = (
                    node.func.id if isinstance(node.func, ast.Name) else node.func.attr
                )
                violations.append(
                    f"{_location(path, node)} constructs ORM model {model_name}"
                )
            if isinstance(node, ast.Dict) or (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "dict"
            ):
                violations.append(
                    f"{_location(path, node)} manually builds a response dictionary"
                )

    assert violations == []


def test_routers_do_not_import_vendor_sdks() -> None:
    violations: list[str] = []
    for path in ROUTER_FILES:
        for node in ast.walk(_parse(path)):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                forbidden = _import_roots(node) & FORBIDDEN_ROUTER_VENDOR_ROOTS
                for package in sorted(forbidden):
                    violations.append(
                        f"{_location(path, node)} imports vendor package {package}"
                    )

    assert violations == []


def test_core_and_integrations_do_not_import_feature_routers() -> None:
    violations: list[str] = []
    boundary_files = tuple((APP_ROOT / "core").glob("*.py")) + tuple(
        (APP_ROOT / "integrations").glob("*.py")
    )
    for path in sorted(boundary_files):
        for node in ast.walk(_parse(path)):
            if not isinstance(node, (ast.Import, ast.ImportFrom)):
                continue
            imported_routers = {
                module
                for module in _imported_modules(
                    node,
                    current_package=".".join(
                        path.parent.relative_to(BACKEND_ROOT).parts
                    ),
                )
                if module.startswith("app.features.") and module.endswith(".router")
            }
            for imported_router in sorted(imported_routers):
                violations.append(
                    f"{_location(path, node)} imports feature router {imported_router}"
                )

    assert violations == []


def test_legacy_persistence_helpers_and_json_mappers_are_absent() -> None:
    violations: list[str] = []
    for path in sorted(BACKEND_ROOT.glob("**/*.py")):
        if any(part in {".venv", ".pytest_cache"} for part in path.parts):
            continue
        for node in ast.walk(_parse(path)):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == "save_to_db" or node.name.endswith("_to_json"):
                    violations.append(
                        f"{_location(path, node)} defines legacy helper {node.name}"
                    )
            if isinstance(node, ast.Name) and node.id == "save_to_db":
                violations.append(
                    f"{_location(path, node)} references legacy helper save_to_db"
                )

    assert sorted(set(violations)) == []
