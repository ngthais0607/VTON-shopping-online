import importlib.util
import io
import sys
from pathlib import Path


def test_smoke_diagnostics_survive_windows_console_encoding(monkeypatch):
    script = Path(__file__).parents[2] / ".github/scripts/compose_smoke.py"
    spec = importlib.util.spec_from_file_location("smoke_output_probe", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    buffers = [io.BytesIO(), io.BytesIO()]
    streams = [io.TextIOWrapper(buffer, encoding="cp1252") for buffer in buffers]
    with monkeypatch.context() as patch:
        patch.setattr(sys, "stdout", streams[0])
        patch.setattr(sys, "stderr", streams[1])
        module.configure_output()
        for stream in streams:
            stream.write("▲ diagnostic\n")
            stream.flush()
        assert all(buffer.getvalue() == "▲ diagnostic\n".encode() for buffer in buffers)
