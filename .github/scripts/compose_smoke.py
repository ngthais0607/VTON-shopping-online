"""Build and verify a disposable Compose project; never reuse developer volumes."""

import json
import os
import re
import secrets
import socket
import struct
import subprocess
import sys
import tempfile
import time
import zlib
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]


def configure_output():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(
                encoding="utf-8", errors="backslashreplace", newline="\n"
            )


def available_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return str(sock.getsockname()[1])


class SmokeStack:
    def __init__(self, directory):
        self.project = "vton-smoke-" + secrets.token_hex(5)
        self.envfile = Path(directory) / "smoke.env"
        self.values = {
            "MARIADB_ROOT_PASSWORD": secrets.token_hex(20),
            "MARIADB_USER": "smokeapp",
            "MARIADB_PASSWORD": "app @:/ $ " + secrets.token_hex(20),
            "MARIADB_DATABASE": "smokeapp",
            "REDIS_PASSWORD": "smoke $ @:/ + %20 " + secrets.token_hex(12),
            "SECRET_KEY": secrets.token_hex(32),
            "MINIO_ROOT_USER": "smokeadmin",
            "MINIO_ROOT_PASSWORD": secrets.token_hex(20),
            "VIETQR_BANK_ID": "MB",
            "VIETQR_ACCOUNT_NO": "0000000000",
            "VIETQR_WEBHOOK_SECRET": secrets.token_hex(32),
            "APP_ENV": "development",
            "REFRESH_COOKIE_SECURE": "false",
            "EMAILS_ENABLED": "false",
            "EMAILS_CONSOLE_LOG": "false",
        }
        for name in ("MARIADB", "REDIS", "MINIO", "MINIO_CONSOLE", "API", "FRONTEND"):
            self.values[name + "_PORT"] = available_port()
        self.values.update(
            {
                "DATABASE_URL": "mysql+pymysql://smokeapp:"
                + quote(self.values["MARIADB_PASSWORD"], safe="")
                + "@mariadb:3306/smokeapp",
                "REDIS_URL": "redis://:"
                + quote(self.values["REDIS_PASSWORD"], safe="")
                + "@redis:6379/0",
                "MINIO_EXTERNAL_URL": "http://localhost:" + self.values["MINIO_PORT"],
                "NEXT_PUBLIC_IMAGE_HOST": "http://localhost:"
                + self.values["MINIO_PORT"],
                "NEXT_PUBLIC_API_BASE_URL": "http://localhost:"
                + self.values["API_PORT"],
                "CORS_ORIGINS": "http://localhost:" + self.values["FRONTEND_PORT"],
            }
        )
        self.envfile.write_text("\n".join(f"{k}='{v}'" for k, v in self.values.items()))
        # Process env takes precedence over --env-file. Keep only OS/tooling vars.
        self.environment = {
            k: v
            for k, v in os.environ.items()
            if not k.startswith(
                (
                    "MARIADB_",
                    "MINIO_",
                    "REDIS_",
                    "VIETQR_",
                    "NEXT_PUBLIC_",
                    "SMTP_",
                    "EMAILS_",
                    "REFRESH_COOKIE_",
                )
            )
            and k not in self.values
            and k not in {"DATABASE_URL", "CORS_ORIGINS", "FORWARDED_ALLOW_IPS"}
        }

    def redact(self, text):
        for key, value in self.values.items():
            if any(word in key for word in ("PASSWORD", "SECRET", "URL")):
                text = text.replace(value, "[redacted]")
        return re.sub(
            r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[redacted-jwt]", text
        )

    def compose(self, *args, check=True, timeout=120, input_text=None):
        result = subprocess.run(
            [
                "docker",
                "compose",
                "--project-directory",
                str(ROOT),
                "--env-file",
                str(self.envfile),
                "-p",
                self.project,
                "-f",
                str(ROOT / "docker-compose.yml"),
                *args,
            ],
            env=self.environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
            input=input_text,
        )
        if check and result.returncode:
            raise RuntimeError(self.redact(result.stdout + result.stderr))
        return result

    def verify(self):
        rows = self.compose("ps", "--all", "--format", "json").stdout
        containers = (
            json.loads(rows)
            if rows.lstrip().startswith("[")
            else [json.loads(row) for row in rows.splitlines() if row.strip()]
        )
        by_service = {row["Service"]: row for row in containers}
        assert by_service["migrate"]["ExitCode"] == 0
        assert by_service["arq_worker"]["State"] == "running"
        for port, path in (("API_PORT", "/api/v1/health"), ("FRONTEND_PORT", "/")):
            with urlopen(
                "http://127.0.0.1:" + self.values[port] + path, timeout=10
            ) as response:
                assert response.status == 200
        identity = self.compose(
            "exec",
            "-T",
            "api",
            "python",
            "-c",
            "from app.core.database import engine; from sqlalchemy import text; "
            "c=engine.connect(); print(c.execute(text('SELECT CURRENT_USER()')).scalar()); c.close()",
        )
        assert "smokeapp@" in identity.stdout
        unauth = self.compose(
            "exec", "-T", "redis", "env", "-u", "REDISCLI_AUTH", "redis-cli", "ping"
        )
        assert "NOAUTH" in unauth.stdout + unauth.stderr
        assert "PONG" in self.compose("exec", "-T", "redis", "redis-cli", "ping").stdout
        time.sleep(3)
        assert (
            "running"
            in self.compose("ps", "arq_worker", "--format", "{{.State}}").stdout
        )
        self.compose(
            "exec", "-T", "arq_worker", "arq", "--check", "app.worker.WorkerSettings"
        )

    def prepare_image(self):
        password = secrets.token_urlsafe(24)
        self.values["SMOKE_ADMIN_PASSWORD"] = password
        self.compose(
            "exec",
            "-T",
            "api",
            "python",
            "-m",
            "app.cli",
            "create-admin",
            "--email",
            "smoke-admin@example.com",
            "--username",
            "smoke-admin",
            input_text=password + "\n" + password + "\n",
        )
        origin = self.values["NEXT_PUBLIC_API_BASE_URL"] + "/api/v1"

        def post(path, data, headers=None):
            request = Request(
                origin + path, data=data, headers=headers or {}, method="POST"
            )
            with urlopen(request, timeout=30) as response:
                return json.load(response)

        logged_in = post(
            "/users/login",
            json.dumps({"identifier": "smoke-admin", "password": password}).encode(),
            {"Content-Type": "application/json"},
        )
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + logged_in["access_token"],
        }
        product = post(
            "/products",
            json.dumps(
                {
                    "name": "Smoke PNG",
                    "price": 100,
                    "currency": "VND",
                    "is_active": True,
                    "variants": [
                        {"size": "M", "color_name": "Default", "stock_quantity": 2}
                    ],
                }
            ).encode(),
            headers,
        )

        def chunk(kind, body):
            return (
                struct.pack("!I", len(body))
                + kind
                + body
                + struct.pack("!I", zlib.crc32(kind + body))
            )

        png = (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack("!IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\0\xff\0\0\xff"))
            + chunk(b"IEND", b"")
        )
        boundary = "smoke-" + secrets.token_hex(12)
        data = (
            (
                "--"
                + boundary
                + '\r\nContent-Disposition: form-data; name="file"; filename="smoke.png"\r\nContent-Type: image/png\r\n\r\n'
            ).encode()
            + png
            + ("\r\n--" + boundary + "--\r\n").encode()
        )
        headers["Content-Type"] = "multipart/form-data; boundary=" + boundary
        image = post(f"/products/{product['id']}/images", data, headers)
        return image["url"], "/storage" + urlsplit(image["url"]).path

    def browser_tests(self):
        image_url, image_path = self.prepare_image()
        environment = {
            **os.environ,
            "E2E_BASE_URL": "http://localhost:" + self.values["FRONTEND_PORT"],
            "E2E_API_URL": self.values["NEXT_PUBLIC_API_BASE_URL"],
            "E2E_IMAGE_URL": image_url,
            "E2E_IMAGE_PATH": image_path,
        }
        result = subprocess.run(
            ["pnpm.cmd" if sys.platform == "win32" else "pnpm", "test:e2e"],
            cwd=ROOT / "frontend",
            env=environment,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=360,
            check=False,
        )
        print(self.redact(result.stdout + result.stderr), flush=True)
        if result.returncode:
            raise RuntimeError("Browser acceptance failed")


@contextmanager
def running_stack():
    with tempfile.TemporaryDirectory(prefix="vton-smoke-") as directory:
        stack = SmokeStack(directory)
        try:
            stack.compose("config", "--quiet")
            print("Building isolated project " + stack.project, flush=True)
            stack.compose("build", timeout=1200)
            print("Build complete; starting isolated services", flush=True)
            stack.compose("up", "-d", "--wait", "--wait-timeout", "240", timeout=300)
            stack.verify()
            print("Runtime readiness and authenticated worker passed", flush=True)
            yield stack
        except Exception:
            result = stack.compose("logs", "--tail", "80", check=False)
            print(stack.redact(result.stdout + result.stderr), flush=True)
            raise
        finally:
            stack.compose("down", "--volumes", "--remove-orphans", check=False)


if __name__ == "__main__":
    configure_output()
    with running_stack() as stack:
        if os.environ.get("SMOKE_BROWSER_TESTS") == "1":
            stack.browser_tests()
        print("Compose smoke passed", flush=True)
