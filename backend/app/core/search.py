"""Literal substring patterns for SQL LIKE with an explicit escape character."""


def literal_contains_pattern(value: str) -> str:
    return (
        "%" + value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    )
