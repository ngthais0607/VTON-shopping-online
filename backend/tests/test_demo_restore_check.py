import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

SCRIPTS = Path(__file__).resolve().parents[2] / ".github/scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location(
    "demo_restore_check", SCRIPTS / "demo_restore_check.py"
)
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


def test_existing_output_is_refused(tmp_path, monkeypatch):
    monkeypatch.setattr(
        recovery, "source_info", lambda project: pytest.fail("source read")
    )
    with pytest.raises(FileExistsError):
        recovery.verify_restore("truelook-demo", tmp_path)


def test_source_is_never_a_mutation_or_cleanup_target(monkeypatch):
    commands = []

    def run(command, **kwargs):
        commands.append(command)
        return SimpleNamespace(stdout=b"{}", returncode=0)

    monkeypatch.setattr(recovery.subprocess, "run", run)
    recovery.source_info("truelook-demo")
    recovery.source_dump("truelook-demo")
    recovery.source_object("truelook-demo", "products/admin.png")
    assert len(commands) == 3
    for command in commands:
        assert command[command.index("-p") + 1] == "truelook-demo"
        assert "exec" in command
        assert not {"down", "up", "rm", "seed"} & set(command)
    assert "SELECT" in commands[0][-1]
    assert "mariadb-dump" in commands[1][-1]
    assert "get_object" in commands[2][-1]


@pytest.mark.parametrize(
    "corrupt,fail_import", [(False, False), (True, False), (False, True)]
)
def test_manifest_roundtrip_and_failure_cleanup(
    tmp_path, monkeypatch, corrupt, fail_import
):
    info = {
        "migration_head": "head",
        "table_counts": {"products": 1},
        "bucket": "product-images",
        "object_names": ["products/admin.png"],
        "object_types": {"products/admin.png": "image/png"},
    }
    monkeypatch.setattr(recovery, "source_info", lambda project: info)
    monkeypatch.setattr(recovery, "source_dump", lambda project: b"SQL snapshot")
    monkeypatch.setattr(recovery, "source_object", lambda *args: b"admin photo bytes")
    calls = []

    class Stack:
        def __init__(self, directory):
            self.project = "temporary"
            self.values = {
                "MINIO_PORT": "19099",
                "MINIO_ROOT_USER": "test",
                "MINIO_ROOT_PASSWORD": "secret",
            }

        def compose(self, *args, **kwargs):
            calls.append((self.project, args))
            if args[0] == "exec" and fail_import:
                raise RuntimeError("import failed")

    class Store:
        def __init__(self, *args, **kwargs):
            self.payload = b""

        def bucket_exists(self, bucket):
            return False

        def make_bucket(self, bucket):
            pass

        def put_object(self, bucket, name, stream, length, content_type=None):
            assert content_type == "image/png"
            self.payload = stream.read()

        def get_object(self, bucket, name):
            from io import BytesIO

            response = BytesIO(b"bad" if corrupt else self.payload)
            response.release_conn = lambda: None
            return response

    monkeypatch.setattr(recovery, "SmokeStack", Stack)
    monkeypatch.setattr(recovery, "Minio", Store)
    monkeypatch.setattr(recovery, "target_info", lambda stack: info)
    output = tmp_path / "new-backup"
    if corrupt or fail_import:
        with pytest.raises(RuntimeError):
            recovery.verify_restore("truelook-demo", output)
    else:
        result = recovery.verify_restore("truelook-demo", output)
        assert result["objects"][0]["object_name"] == "products/admin.png"
        assert result["objects"][0]["size"] == len(b"admin photo bytes")
        assert result["verified"] is True
    assert calls[-1][1][0] == "down"
    assert all(project.startswith("shop-restore-check-") for project, _ in calls)
    assert (output / "database.sql").read_bytes() == b"SQL snapshot"


def test_missing_object_does_not_claim_verified(tmp_path, monkeypatch):
    monkeypatch.setattr(
        recovery,
        "source_info",
        lambda project: {
            "bucket": "product-images",
            "object_names": ["products/missing.png"],
        },
    )
    monkeypatch.setattr(recovery, "source_dump", lambda project: b"SQL")

    def missing(*args):
        raise FileNotFoundError("missing object")

    monkeypatch.setattr(recovery, "source_object", missing)
    with pytest.raises(FileNotFoundError):
        recovery.verify_restore("truelook-demo", tmp_path / "new")
    assert not (tmp_path / "new" / "manifest.json").exists()
