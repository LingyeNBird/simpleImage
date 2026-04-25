from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock, Thread
from typing import Callable, Mapping

from services.config import DATA_DIR


IMAGE_JOBS_FILE = DATA_DIR / "image_jobs.json"
IMAGE_JOB_INPUTS_DIR = DATA_DIR / "image_job_inputs"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_int(value: object, default: int = 0) -> int:
    try:
        if value is None:
            return default
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            return int(value.strip())
    except (TypeError, ValueError):
        return default
    return default


def _normalize_result_image(raw: object) -> dict[str, object] | None:
    if not isinstance(raw, dict):
        return None
    image_url = str(raw.get("url") or "").strip()
    object_key = str(raw.get("object_key") or "").strip()
    url_expires_at = str(raw.get("url_expires_at") or "").strip()
    if not image_url and not object_key:
        return None
    normalized: dict[str, object] = {
        "id": str(raw.get("id") or uuid.uuid4().hex).strip() or uuid.uuid4().hex,
        "storage": "image_bed",
    }
    if image_url:
        normalized["url"] = image_url
    if object_key:
        normalized["object_key"] = object_key
    if url_expires_at:
        normalized["url_expires_at"] = url_expires_at
    return normalized


def _normalize_reference_input(raw: object) -> dict[str, object] | None:
    if not isinstance(raw, dict):
        return None
    path = str(raw.get("path") or "").strip()
    if not path:
        return None
    return {
        "name": str(raw.get("name") or Path(path).name).strip() or Path(path).name,
        "type": str(raw.get("type") or "image/png").strip() or "image/png",
        "path": path,
    }


def _normalize_job(raw: object) -> dict[str, object] | None:
    if not isinstance(raw, dict):
        return None
    job_id = str(raw.get("id") or uuid.uuid4().hex).strip() or uuid.uuid4().hex
    status = str(raw.get("status") or "queued").strip() or "queued"
    if status in {"running"}:
        status = "queued"
    return {
        "id": job_id,
        "owner_role": str(raw.get("owner_role") or "user").strip() or "user",
        "user_id": str(raw.get("user_id") or "").strip(),
        "username": str(raw.get("username") or "").strip(),
        "conversation_id": str(raw.get("conversation_id") or job_id).strip() or job_id,
        "conversation_title": str(raw.get("conversation_title") or "").strip(),
        "prompt": str(raw.get("prompt") or "").strip(),
        "mode": "edit" if str(raw.get("mode") or "").strip() == "edit" else "generate",
        "model": str(raw.get("model") or "auto").strip() or "auto",
        "count": max(1, _safe_int(raw.get("count"), 1)),
        "size": str(raw.get("size") or "1:1").strip() or "1:1",
        "status": status,
        "delivery_mode": "image_bed",
        "created_at": str(raw.get("created_at") or _now_iso()).strip() or _now_iso(),
        "updated_at": str(raw.get("updated_at") or raw.get("created_at") or _now_iso()).strip() or _now_iso(),
        "error": str(raw.get("error") or "").strip() or None,
        "reference_images": [
            item for item in (_normalize_reference_input(image) for image in (raw.get("reference_images") or [])) if item is not None
        ],
        "result_images": [
            item for item in (_normalize_result_image(image) for image in (raw.get("result_images") or [])) if item is not None
        ],
    }


class ImageJobService:
    def __init__(self, store_file: Path, inputs_dir: Path):
        self._store_file = store_file
        self._inputs_dir = inputs_dir
        self._lock = Lock()
        self._jobs = self._load()
        self._running_jobs: set[str] = set()

    def _load(self) -> list[dict[str, object]]:
        if not self._store_file.exists():
            return []
        try:
            raw = json.loads(self._store_file.read_text(encoding="utf-8"))
        except Exception:
            return []
        items = raw.get("items") if isinstance(raw, dict) else raw
        if not isinstance(items, list):
            return []
        return [item for item in (_normalize_job(job) for job in items) if item is not None]

    def _save(self) -> None:
        self._store_file.parent.mkdir(parents=True, exist_ok=True)
        self._store_file.write_text(json.dumps({"items": self._jobs}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def _replace_job(self, next_job: Mapping[str, object]) -> dict[str, object]:
        job_id = str(next_job.get("id") or "").strip()
        next_job_dict = dict(next_job)
        for index, job in enumerate(self._jobs):
            if str(job.get("id") or "") != job_id:
                continue
            self._jobs[index] = next_job_dict
            self._save()
            return dict(next_job_dict)
        self._jobs.append(next_job_dict)
        self._save()
        return dict(next_job_dict)

    def list_jobs_for_user(self, user_id: str) -> list[dict[str, object]]:
        normalized_user_id = str(user_id or "").strip()
        with self._lock:
            items = [dict(job) for job in self._jobs if str(job.get("user_id") or "") == normalized_user_id]
        return sorted(items, key=lambda item: str(item.get("created_at") or ""), reverse=True)

    def list_unfinished_jobs(self) -> list[dict[str, object]]:
        with self._lock:
            items = [dict(job) for job in self._jobs if str(job.get("status") or "") in {"queued", "running"}]
        return sorted(items, key=lambda item: str(item.get("created_at") or ""))

    def get_job(self, job_id: str) -> dict[str, object] | None:
        normalized_job_id = str(job_id or "").strip()
        with self._lock:
            for job in self._jobs:
                if str(job.get("id") or "") == normalized_job_id:
                    return dict(job)
        return None

    def create_job(
        self,
        *,
        owner_role: str,
        user_id: str,
        username: str,
        conversation_id: str,
        conversation_title: str,
        prompt: str,
        mode: str,
        model: str,
        count: int,
        size: str,
        reference_images: list[dict[str, object]],
    ) -> dict[str, object]:
        now = _now_iso()
        job = {
            "id": uuid.uuid4().hex,
            "owner_role": "admin" if owner_role == "admin" else "user",
            "user_id": str(user_id or "").strip(),
            "username": str(username or "").strip(),
            "conversation_id": str(conversation_id or "").strip() or uuid.uuid4().hex,
            "conversation_title": str(conversation_title or "").strip(),
            "prompt": str(prompt or "").strip(),
            "mode": "edit" if mode == "edit" else "generate",
            "model": str(model or "auto").strip() or "auto",
            "count": max(1, int(count or 1)),
            "size": str(size or "1:1").strip() or "1:1",
            "status": "queued",
            "delivery_mode": "image_bed",
            "created_at": now,
            "updated_at": now,
            "error": None,
            "reference_images": reference_images,
            "result_images": [],
        }
        with self._lock:
            return self._replace_job(job)

    def update_job_status(self, job_id: str, *, status: str, error: str | None = None, result_images: list[dict[str, object]] | None = None) -> dict[str, object] | None:
        normalized_job_id = str(job_id or "").strip()
        with self._lock:
            for index, current in enumerate(self._jobs):
                if str(current.get("id") or "") != normalized_job_id:
                    continue
                next_job = dict(current)
                next_job["status"] = status
                next_job["updated_at"] = _now_iso()
                next_job["error"] = error.strip() if isinstance(error, str) and error.strip() else None
                if result_images is not None:
                    next_job["result_images"] = result_images
                self._jobs[index] = next_job
                self._save()
                return dict(next_job)
        return None

    def update_reference_images(self, job_id: str, reference_images: list[dict[str, object]]) -> dict[str, object] | None:
        normalized_job_id = str(job_id or "").strip()
        with self._lock:
            for index, current in enumerate(self._jobs):
                if str(current.get("id") or "") != normalized_job_id:
                    continue
                next_job = dict(current)
                next_job["reference_images"] = reference_images
                next_job["updated_at"] = _now_iso()
                self._jobs[index] = next_job
                self._save()
                return dict(next_job)
        return None

    def save_reference_images(self, job_id: str, files: list[tuple[bytes, str, str]]) -> list[dict[str, object]]:
        base_dir = self._inputs_dir / job_id
        base_dir.mkdir(parents=True, exist_ok=True)
        saved: list[dict[str, object]] = []
        for index, (image_data, file_name, mime_type) in enumerate(files, start=1):
            suffix = Path(file_name or f"image-{index}.png").suffix or ".png"
            target = base_dir / f"{index:02d}{suffix}"
            target.write_bytes(image_data)
            saved.append({
                "name": file_name or target.name,
                "type": mime_type or "image/png",
                "path": str(target),
            })
        return saved

    def build_processor_files(self, job: dict[str, object]) -> list[tuple[bytes, str, str]]:
        reference_images = job.get("reference_images")
        if not isinstance(reference_images, list):
            return []
        files: list[tuple[bytes, str, str]] = []
        for item in reference_images:
            normalized = _normalize_reference_input(item)
            if normalized is None:
                continue
            path = Path(str(normalized["path"]))
            if not path.is_file():
                continue
            files.append((path.read_bytes(), str(normalized["name"]), str(normalized["type"])))
        return files

    def cleanup_job_inputs(self, job_id: str) -> None:
        base_dir = self._inputs_dir / job_id
        if not base_dir.exists():
            return
        for child in base_dir.iterdir():
            if child.is_file():
                child.unlink(missing_ok=True)
        try:
            base_dir.rmdir()
        except OSError:
            pass

    def dispatch_job(self, job_id: str, processor: Callable[[str], None]) -> None:
        normalized_job_id = str(job_id or "").strip()
        if not normalized_job_id:
            return
        with self._lock:
            if normalized_job_id in self._running_jobs:
                return
            self._running_jobs.add(normalized_job_id)

        def worker() -> None:
            try:
                processor(normalized_job_id)
            finally:
                with self._lock:
                    self._running_jobs.discard(normalized_job_id)

        thread = Thread(target=worker, name=f"image-job-{normalized_job_id[:8]}", daemon=True)
        thread.start()


image_job_service = ImageJobService(IMAGE_JOBS_FILE, IMAGE_JOB_INPUTS_DIR)
