from __future__ import annotations

import json
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import cast

BASE_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BASE_DIR / "config.json"
WEB_DIR = BASE_DIR / "web"
NEXT_BIN = WEB_DIR / "node_modules" / ".bin" / "next"
VERSION_FILE = BASE_DIR / "VERSION"


def _read_json_object(path: Path) -> dict[str, object]:
    if not path.exists() or path.is_dir():
        return {}
    try:
        parsed = cast(object, json.loads(path.read_text(encoding="utf-8")))
    except Exception:
        return {}
    if isinstance(parsed, dict):
        parsed_dict = cast(dict[object, object], parsed)
        normalized: dict[str, object] = {}
        for key, value in parsed_dict.items():
            normalized[str(key)] = value
        return normalized
    return {}


def _coerce_bool(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return default


def _read_version() -> str:
    try:
        return VERSION_FILE.read_text(encoding="utf-8").strip() or "0.0.0"
    except Exception:
        return "0.0.0"


def _terminate_process(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        _ = process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        _ = process.wait(timeout=5)


def _run_production() -> None:
    _ = os.execvp(
        "uv",
        ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80", "--access-log"],
    )


def _run_development() -> None:
    if not NEXT_BIN.is_file():
        raise FileNotFoundError(f"Next dev binary not found: {NEXT_BIN}")

    backend = subprocess.Popen(
        ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--access-log"],
        cwd=BASE_DIR,
        env=os.environ.copy(),
    )

    frontend_env = os.environ.copy()
    frontend_env["NODE_ENV"] = "development"
    _ = frontend_env.setdefault("NEXT_PUBLIC_APP_VERSION", _read_version())

    frontend = subprocess.Popen(
        [str(NEXT_BIN), "dev", "--webpack", "-H", "0.0.0.0", "-p", "80"],
        cwd=WEB_DIR,
        env=frontend_env,
    )

    def handle_signal(signum: int, _frame: object) -> None:
        _terminate_process(frontend)
        _terminate_process(backend)
        raise SystemExit(128 + signum)

    _ = signal.signal(signal.SIGTERM, handle_signal)
    _ = signal.signal(signal.SIGINT, handle_signal)

    try:
        while True:
            frontend_code = frontend.poll()
            backend_code = backend.poll()
            if frontend_code is not None:
                _terminate_process(backend)
                raise SystemExit(frontend_code)
            if backend_code is not None:
                _terminate_process(frontend)
                raise SystemExit(backend_code)
            time.sleep(0.5)
    finally:
        _terminate_process(frontend)
        _terminate_process(backend)


def main() -> None:
    raw_config = _read_json_object(CONFIG_FILE)
    if _coerce_bool(raw_config.get("next_dev"), False):
        _run_development()
        return
    _run_production()


if __name__ == "__main__":
    main()
