"""Resolve the real Compose file without starting or contacting containers."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def resolve_compose(tmp_path, missing=None):
    if not shutil.which("docker"):
        pytest.skip("Docker CLI unavailable")
    values = {
        "MARIADB_ROOT_PASSWORD": "root-test-only",
        "MARIADB_USER": "app",
        "MARIADB_PASSWORD": "app-test-only",
        "REDIS_PASSWORD": "redis-test-only",
        "SECRET_KEY": "a" * 48,
        "MINIO_ROOT_USER": "testadmin",
        "MINIO_ROOT_PASSWORD": "minio-test-only",
        "VIETQR_BANK_ID": "MB",
        "VIETQR_ACCOUNT_NO": "0000000000",
        "NEXT_PUBLIC_IMAGE_HOST": "https://images.example.test",
        "MINIO_EXTERNAL_URL": "https://images.example.test",
    }
    values.pop(missing, None)
    envfile = tmp_path / "compose.env"
    envfile.write_text("\n".join(f"{k}={v}" for k, v in values.items()))
    environment = {
        k: v
        for k, v in os.environ.items()
        if k not in values
        and k != missing
        and not k.startswith(
            ("MINIO_", "VIETQR_", "MARIADB_", "REDIS_", "NEXT_PUBLIC_")
        )
        and k not in {"DATABASE_URL", "SECRET_KEY", "APP_ENV", "CORS_ORIGINS"}
    }
    return subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(envfile),
            "-f",
            str(ROOT / "docker-compose.yml"),
            "config",
            "--format",
            "json",
        ],
        capture_output=True,
        text=True,
        env=environment,
        timeout=30,
    )


def test_backend_services_receive_complete_restricted_settings(tmp_path):
    result = resolve_compose(tmp_path)
    assert result.returncode == 0, result.stderr
    services = json.loads(result.stdout)["services"]
    for name in ("migrate", "api", "arq_worker"):
        env = services[name]["environment"]
        assert env["VIETQR_ACCOUNT_NO"] == "0000000000"
        assert env["DATABASE_URL"].startswith("mysql+pymysql://app:")
        assert env["REDIS_URL"].startswith("redis://:redis-test-only@redis:")
        assert env["MINIO_EXTERNAL_URL"] == "https://images.example.test"
        assert "container_name" not in services[name]
    for name in ("mariadb", "redis", "minio"):
        assert all(port["host_ip"] == "127.0.0.1" for port in services[name]["ports"])
    assert "/api/v1/health" in str(services["api"]["healthcheck"])


@pytest.mark.parametrize(
    "missing", ["VIETQR_ACCOUNT_NO", "REDIS_PASSWORD", "MARIADB_PASSWORD"]
)
def test_missing_required_configuration_fails(tmp_path, missing):
    assert resolve_compose(tmp_path, missing).returncode != 0
