from __future__ import annotations

import base64
import hashlib
import time
from dataclasses import dataclass
from pathlib import Path

from services.config import config
from services.cos_storage_service import build_signed_download_url, get_image_url_expires_at_iso, upload_file_and_verify


@dataclass(frozen=True)
class SavedImageFile:
    path: Path
    relative_path: str
    mime_type: str


def save_image_bytes(image_bytes: bytes, mime_type: str = "image/png", extension: str = ".png") -> SavedImageFile:
    file_hash = hashlib.md5(image_bytes).hexdigest()
    timestamp = int(time.time())
    filename = f"{timestamp}_{file_hash}{extension or '.png'}"
    relative_dir = Path(time.strftime("%Y"), time.strftime("%m"), time.strftime("%d"))
    file_path = config.images_dir / relative_dir / filename
    _ = file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(image_bytes)
    return SavedImageFile(
        path=file_path,
        relative_path=relative_dir.joinpath(filename).as_posix(),
        mime_type=mime_type,
    )


def build_local_image_url(saved_file: SavedImageFile, base_url: str | None = None) -> str:
    return f"{(base_url or config.base_url)}/images/{saved_file.relative_path}"


def build_result_data_from_bytes(
    image_bytes: bytes,
    prompt: str,
    response_format: str,
    base_url: str | None,
    delivery_mode: str,
    mime_type: str = "image/png",
    revised_prompt: str | None = None,
) -> dict[str, str]:
    normalized_delivery_mode = str(delivery_mode or "direct").strip() or "direct"
    normalized_response_format = str(response_format or "b64_json").strip() or "b64_json"
    normalized_prompt = str(revised_prompt or prompt or "").strip()

    if normalized_delivery_mode == "image_bed":
        saved_file = save_image_bytes(image_bytes, mime_type=mime_type)
        try:
            object_key = upload_file_and_verify(saved_file.path, saved_file.mime_type)
            image_url = build_signed_download_url(object_key)
            image_url_expires_at = get_image_url_expires_at_iso()
        finally:
            try:
                saved_file.path.unlink(missing_ok=True)
            except OSError:
                pass
        return {
            "url": image_url,
            "object_key": object_key,
            "url_expires_at": image_url_expires_at,
            "revised_prompt": normalized_prompt,
            "storage": "image_bed",
        }

    if normalized_response_format == "url":
        saved_file = save_image_bytes(image_bytes, mime_type=mime_type)
        return {
            "url": build_local_image_url(saved_file, base_url),
            "revised_prompt": normalized_prompt,
            "storage": "direct",
        }

    return {
        "b64_json": base64.b64encode(image_bytes).decode("ascii"),
        "revised_prompt": normalized_prompt,
        "storage": "direct",
    }
