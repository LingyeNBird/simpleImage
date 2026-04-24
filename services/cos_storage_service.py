from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import quote

from qcloud_cos import CosConfig, CosS3Client

from services.config import config
from services.cos_config import load_cos_config


PROJECT_IMAGE_PREFIX = "chatgpt2api-generated"


class CosStorageError(Exception):
    pass


def _safe_int(value: object, default: int) -> int:
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


def _build_client() -> tuple[CosS3Client, str]:
    cos_config = load_cos_config()
    if cos_config is None:
        raise CosStorageError("cos_config.json 未配置完整")
    client = CosS3Client(
        CosConfig(
            Region=cos_config.region,
            SecretId=cos_config.secret_id,
            SecretKey=cos_config.secret_key,
            Scheme="https",
        )
    )
    return client, cos_config.bucket


def is_cos_storage_ready() -> bool:
    return load_cos_config() is not None


def build_public_url(object_key: str) -> str:
    cos_config = load_cos_config()
    if cos_config is None:
        raise CosStorageError("cos_config.json 未配置完整")
    return f"{cos_config.public_base_url}/{object_key}"


def get_image_url_expire_seconds() -> int:
    cleanup_days = max(1, _safe_int(config.data.get("image_bed_cleanup_days"), 3))
    return max(60, cleanup_days * 24 * 60 * 60)


def get_image_url_expires_at_iso(expire_seconds: int | None = None) -> str:
    seconds = max(60, int(expire_seconds or get_image_url_expire_seconds()))
    return (datetime.now(UTC) + timedelta(seconds=seconds)).isoformat()


def is_project_image_object_key(object_key: str) -> bool:
    normalized_key = str(object_key or "").strip().lstrip("/")
    return normalized_key.startswith(f"{PROJECT_IMAGE_PREFIX}/")


def build_signed_download_url(object_key: str, expire_seconds: int | None = None) -> str:
    client, bucket = _build_client()
    normalized_key = str(object_key or "").strip()
    if not normalized_key:
        raise CosStorageError("object key is required")
    if not is_project_image_object_key(normalized_key):
        raise CosStorageError("object key is outside project image prefix")
    return str(
        client.get_presigned_download_url(
            Bucket=bucket,
            Key=normalized_key,
            Expired=max(60, int(expire_seconds or get_image_url_expire_seconds())),
        )
        or ""
    ).strip()


def build_object_key(local_file: Path) -> str:
    relative_parts = local_file.relative_to(config.images_dir).parts
    encoded_relative_path = "/".join(quote(part, safe="-_.~/") for part in relative_parts)
    return f"{PROJECT_IMAGE_PREFIX}/{encoded_relative_path}"


def _parse_last_modified(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def cleanup_expired_images() -> int:
    client, bucket = _build_client()
    cleanup_days = max(1, _safe_int(config.data.get("image_bed_cleanup_days"), 3))
    expire_before = datetime.now(UTC) - timedelta(days=cleanup_days)
    marker = ""
    deleted = 0

    while True:
        response = client.list_objects(Bucket=bucket, Prefix=f"{PROJECT_IMAGE_PREFIX}/", Marker=marker, MaxKeys=1000)
        contents = response.get("Contents") or []
        stale_keys: list[dict[str, str]] = []
        for item in contents:
            if not isinstance(item, dict):
                continue
            key = str(item.get("Key") or "").strip()
            last_modified = _parse_last_modified(item.get("LastModified"))
            if not key or last_modified is None or last_modified >= expire_before:
                continue
            stale_keys.append({"Key": key})
        if stale_keys:
            client.delete_objects(Bucket=bucket, Delete={"Object": stale_keys, "Quiet": "true"})
            deleted += len(stale_keys)

        if str(response.get("IsTruncated") or "").lower() != "true":
            break
        next_marker = str(response.get("NextMarker") or "").strip()
        if next_marker:
            marker = next_marker
            continue
        if not contents:
            break
        marker = str(contents[-1].get("Key") or "").strip()
        if not marker:
            break

    return deleted


def count_project_images() -> int:
    client, bucket = _build_client()
    marker = ""
    total = 0
    while True:
        response = client.list_objects(Bucket=bucket, Prefix=f"{PROJECT_IMAGE_PREFIX}/", Marker=marker, MaxKeys=1000)
        contents = response.get("Contents") or []
        total += sum(1 for item in contents if isinstance(item, dict) and str(item.get("Key") or "").strip())
        if str(response.get("IsTruncated") or "").lower() != "true":
            break
        next_marker = str(response.get("NextMarker") or "").strip()
        if next_marker:
            marker = next_marker
            continue
        if not contents:
            break
        marker = str(contents[-1].get("Key") or "").strip()
        if not marker:
            break
    return total


def test_connection() -> dict[str, object]:
    client, bucket = _build_client()
    response = client.list_objects(Bucket=bucket, Prefix=f"{PROJECT_IMAGE_PREFIX}/", MaxKeys=1)
    return {
        "ok": True,
        "bucket": bucket,
        "prefix": f"{PROJECT_IMAGE_PREFIX}/",
        "sample_count": len(response.get("Contents") or []),
    }


def upload_file_and_verify(local_file: Path, mime_type: str = "image/png") -> str:
    client, bucket = _build_client()
    if not local_file.is_file():
        raise CosStorageError("待上传图片不存在")
    object_key = build_object_key(local_file)
    with local_file.open("rb") as file_obj:
        client.put_object(Bucket=bucket, Body=file_obj, Key=object_key, ContentType=mime_type)
    client.head_object(Bucket=bucket, Key=object_key)
    cleanup_expired_images()
    return object_key
