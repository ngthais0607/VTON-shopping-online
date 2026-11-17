"""PostToolUse hook: format and lint a just-edited backend Python file with ruff.

Reads the hook JSON from stdin. Silent (exit 0) for anything that is not a
`backend/**/*.py` file. On lint errors it prints them to stderr and exits 2 so
the assistant sees and fixes them.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
PYTHON = BACKEND / ".venv" / "Scripts" / "python.exe"


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        raw = payload.get("tool_input", {}).get("file_path")
    except (json.JSONDecodeError, AttributeError):
        return 0
    if not raw:
        return 0

    path = Path(raw).resolve()
    if path.suffix != ".py" or not path.is_relative_to(BACKEND) or not path.exists():
        return 0
    if ".venv" in path.parts or "alembic" in path.parts:
        return 0
    if not PYTHON.exists():
        return 0

    base = [str(PYTHON), "-m", "ruff"]
    subprocess.run([*base, "format", str(path)], cwd=BACKEND, capture_output=True)
    check = subprocess.run(
        [*base, "check", "--fix", str(path)],
        cwd=BACKEND,
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        sys.stderr.write(check.stdout + check.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
