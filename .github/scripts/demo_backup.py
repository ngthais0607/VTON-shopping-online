"""Back up the configured Compose demo DB, or restore into a NEW database."""

import argparse
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def compose(*args, **kwargs):
    return subprocess.run(["docker", "compose", *args], cwd=ROOT, check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("backup", "restore"))
    parser.add_argument("path", type=Path)
    parser.add_argument(
        "--database", help="New restore database name, e.g. truelook_restore"
    )
    args = parser.parse_args()
    if args.database and not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", args.database):
        parser.error("--database must use lowercase letters/digits/_")
    if args.action == "backup":
        args.path.parent.mkdir(parents=True, exist_ok=True)
        with args.path.open("xb") as output:
            compose(
                "exec",
                "-T",
                "mariadb",
                "sh",
                "-c",
                'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" '
                "--single-transaction --routines --triggers "
                + (args.database or '"$MARIADB_DATABASE"'),
                stdout=output,
            )
        print(f"Backup saved: {args.path.resolve()} ({args.path.stat().st_size} bytes)")
    else:
        name = args.database or ""
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", name):
            parser.error(
                "--database must name a NEW database (lowercase letters/digits/_)"
            )
        # CREATE without IF NOT EXISTS refuses to overwrite an existing database.
        compose(
            "exec",
            "-T",
            "mariadb",
            "sh",
            "-c",
            'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"',
            input=f"CREATE DATABASE `{name}` CHARACTER SET utf8mb4;".encode(),
        )
        with args.path.open("rb") as source:
            compose(
                "exec",
                "-T",
                "mariadb",
                "sh",
                "-c",
                f'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" {name}',
                stdin=source,
            )
        print(f"Restored into new database: {name}")


if __name__ == "__main__":
    main()
