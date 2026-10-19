"""Run MariaDB tests on an owned disposable server, never a developer database."""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from compose_smoke import ROOT, SmokeStack


def main():
    with tempfile.TemporaryDirectory(prefix="vton-integration-") as directory:
        stack = SmokeStack(directory)
        url = f"mysql+pymysql://root:{stack.values['MARIADB_ROOT_PASSWORD']}@127.0.0.1:{stack.values['MARIADB_PORT']}/smokeapp"
        environment = {
            **os.environ,
            **stack.values,
            "DATABASE_URL": url,
            "TEST_DATABASE_URL": url,
            "MINIO_ACCESS_KEY": stack.values["MINIO_ROOT_USER"],
            "MINIO_SECRET_KEY": stack.values["MINIO_ROOT_PASSWORD"],
            "PYTHONPATH": str(ROOT / "backend"),
            "REDIS_URL": "memory://",
            "PYTHONUNBUFFERED": "1",
        }
        try:
            stack.compose(
                "up", "-d", "--wait", "--wait-timeout", "120", "mariadb", timeout=180
            )
            subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                cwd=ROOT / "backend",
                env=environment,
                check=True,
            )
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pytest",
                    str(ROOT / "backend/tests/integration"),
                    "-q",
                ],
                cwd=Path(directory),
                env=environment,
                check=False,
                timeout=600,
            )
            return result.returncode
        finally:
            stack.compose("down", "--volumes", "--remove-orphans", check=False)


if __name__ == "__main__":
    raise SystemExit(main())
