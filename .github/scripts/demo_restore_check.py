"""Back up a local demo and verify DB plus catalog objects on owned resources."""

import argparse
import hashlib
import json
import re
import secrets
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

from compose_smoke import ROOT, SmokeStack
from minio import Minio
from minio.error import S3Error
from urllib3.exceptions import HTTPError

INFO_CODE = """
import json
from app.main import app
from app.core.database import engine
from app.core.config import get_settings
from app.integrations.storage import MinioProductStorage
from sqlalchemy import inspect, text
with engine.connect() as connection:
    tables = inspect(engine).get_table_names()
    counts = {name: connection.execute(text('SELECT COUNT(*) FROM `' + name + '`')).scalar() for name in tables}
    head = connection.execute(text('SELECT version_num FROM alembic_version')).scalar()
    objects = sorted(set(connection.execute(text('SELECT object_name FROM product_images')).scalars()))
settings = get_settings()
client = MinioProductStorage(settings)._client
types = {name: client.stat_object(settings.minio_bucket, name).content_type for name in objects}
print(json.dumps({'migration_head': head, 'table_counts': counts, 'bucket': settings.minio_bucket, 'object_names': objects, 'object_types': types}))
"""

OBJECT_CODE = """
import json, sys
from app.core.config import get_settings
from app.integrations.storage import MinioProductStorage
settings = get_settings()
client = MinioProductStorage(settings)._client
response = client.get_object(settings.minio_bucket, json.load(sys.stdin)['object_name'])
try:
    sys.stdout.buffer.write(response.read())
finally:
    response.close()
    response.release_conn()
"""


def source_run(project: str, service: str, *args: str, data=None) -> bytes:
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,62}", project):
        raise ValueError("Invalid Compose project")
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--project-directory",
            str(ROOT),
            "-f",
            str(ROOT / "docker-compose.yml"),
            "-p",
            project,
            "exec",
            "-T",
            service,
            *args,
        ],
        input=data,
        capture_output=True,
        check=True,
        timeout=120,
    )
    return result.stdout


def source_info(project: str) -> dict:
    return json.loads(source_run(project, "api", "python", "-c", INFO_CODE))


def source_dump(project: str) -> bytes:
    return source_run(
        project,
        "mariadb",
        "sh",
        "-c",
        'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" '
        '--single-transaction --routines --triggers "$MARIADB_DATABASE"',
    )


def source_object(project: str, object_name: str) -> bytes:
    return source_run(
        project,
        "api",
        "python",
        "-c",
        OBJECT_CODE,
        data=json.dumps({"object_name": object_name}).encode(),
    )


def target_info(stack) -> dict:
    # Count restored tables using MariaDB itself; do not require an app image.
    script = (
        'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" '
        '--batch --skip-column-names "$MARIADB_DATABASE"'
    )
    tables = stack.compose(
        "exec", "-T", "mariadb", "sh", "-c", script, input_text="SHOW TABLES;"
    ).stdout.splitlines()
    if not tables or any(not re.fullmatch(r"[a-zA-Z0-9_]+", t) for t in tables):
        raise RuntimeError("Unexpected restored table names")
    sql = "\n".join(f"SELECT '{t}', COUNT(*) FROM `{t}`;" for t in tables)
    result = stack.compose(
        "exec", "-T", "mariadb", "sh", "-c", script, input_text=sql
    ).stdout.splitlines()
    counts = {line.split("\t")[0]: int(line.split("\t")[1]) for line in result}
    head = stack.compose(
        "exec",
        "-T",
        "mariadb",
        "sh",
        "-c",
        script,
        input_text="SELECT version_num FROM alembic_version;",
    ).stdout.strip()
    return {"table_counts": counts, "migration_head": head}


def verify_restore(source_project: str, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=False)
    objects_dir = output / "objects"
    objects_dir.mkdir()
    before = source_info(source_project)
    (output / "database.sql").write_bytes(source_dump(source_project))
    objects = []
    for index, name in enumerate(before["object_names"]):
        if not name.startswith("products/") or "\\" in name or ".." in name.split("/"):
            raise ValueError("Only local catalog object names can be backed up")
        payload = source_object(source_project, name)
        # Local filenames never derive from remote object names.
        file = f"objects/{index:06d}.bin"
        (output / file).write_bytes(payload)
        objects.append(
            {
                "bucket": before["bucket"],
                "object_name": name,
                "file": file,
                "size": len(payload),
                "content_type": before.get("object_types", {}).get(name)
                or "application/octet-stream",
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
    if before != source_info(source_project):
        raise RuntimeError("Source changed during backup; retry without catalog writes")
    manifest = {
        "schema_version": 1,
        "source_project": source_project,
        "migration_head": before["migration_head"],
        "table_counts": before["table_counts"],
        "objects": objects,
        "database_sha256": hashlib.sha256(
            (output / "database.sql").read_bytes()
        ).hexdigest(),
        "verified": False,
    }
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    with tempfile.TemporaryDirectory(prefix="shop-restore-check-") as directory:
        stack = SmokeStack(directory)
        stack.project = "shop-restore-check-" + secrets.token_hex(6)
        owned = False
        try:
            owned = (
                True  # Record ownership before up: partial creation also needs cleanup.
            )
            stack.compose(
                "up",
                "-d",
                "--wait",
                "--wait-timeout",
                "120",
                "mariadb",
                "minio",
                timeout=180,
            )
            stack.compose(
                "exec",
                "-T",
                "mariadb",
                "sh",
                "-c",
                'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"',
                input_text=(output / "database.sql").read_text(encoding="utf-8"),
                timeout=120,
            )
            restored = target_info(stack)
            if any(
                restored[key] != before[key]
                for key in ("migration_head", "table_counts")
            ):
                raise RuntimeError("Restored database does not match snapshot")
            client = Minio(
                "127.0.0.1:" + stack.values["MINIO_PORT"],
                access_key=stack.values["MINIO_ROOT_USER"],
                secret_key=stack.values["MINIO_ROOT_PASSWORD"],
                secure=False,
            )
            bucket = before["bucket"]
            if not client.bucket_exists(bucket):
                client.make_bucket(bucket)
            for item in objects:
                payload = (output / item["file"]).read_bytes()
                client.put_object(
                    bucket,
                    item["object_name"],
                    BytesIO(payload),
                    len(payload),
                    content_type=item["content_type"],
                )
                response = client.get_object(bucket, item["object_name"])
                try:
                    actual = response.read()
                finally:
                    response.close()
                    response.release_conn()
                if (
                    len(actual) != item["size"]
                    or hashlib.sha256(actual).hexdigest() != item["sha256"]
                ):
                    raise RuntimeError("Restored object digest mismatch")
        finally:
            if owned:
                stack.compose("down", "--volumes", "--remove-orphans", timeout=120)
    manifest["verified"] = True
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-project", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        result = verify_restore(args.source_project, args.output.resolve())
    except (
        OSError,
        ValueError,
        RuntimeError,
        subprocess.SubprocessError,
        S3Error,
        HTTPError,
    ) as exc:
        # Never expose container output/credentials; artifacts retain diagnostic state.
        print(
            f"Restore verification failed ({type(exc).__name__}); artifacts: {args.output}"
        )
        return 1
    print(
        f"Restore verified: {len(result['objects'])} objects; artifacts: {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
