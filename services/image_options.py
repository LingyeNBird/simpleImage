from __future__ import annotations

from dataclasses import dataclass


IMAGE_UPSTREAM_ENDPOINT_CONVERSATION = "conversation"
IMAGE_UPSTREAM_ENDPOINT_RESPONSE = "response"
DEFAULT_IMAGE_UPSTREAM_ENDPOINT = IMAGE_UPSTREAM_ENDPOINT_CONVERSATION
ALLOWED_IMAGE_UPSTREAM_ENDPOINTS = {
    IMAGE_UPSTREAM_ENDPOINT_CONVERSATION,
    IMAGE_UPSTREAM_ENDPOINT_RESPONSE,
}

DEFAULT_IMAGE_SIZE = "1:1"
ALLOWED_IMAGE_SIZES = {"1:1", "16:9", "9:16", "4:3", "3:4"}

DEFAULT_RESPONSE_CANVAS = "auto"
DEFAULT_RESPONSE_RESOLUTION = "auto"
DEFAULT_RESPONSE_QUALITY = "auto"
DEFAULT_RESPONSE_OUTPUT_FORMAT = "png"
DEFAULT_RESPONSE_OUTPUT_COMPRESSION: int | None = None
DEFAULT_RESPONSE_MODERATION = "auto"

ALLOWED_RESPONSE_CANVASES = {"auto", "opaque", "transparent"}
ALLOWED_RESPONSE_RESOLUTIONS = {
    "auto",
    "1024x1024",
    "1536x1024",
    "1024x1536",
    "2048x2048",
    "2560x1440",
    "1440x2560",
    "3840x2160",
    "2160x3840",
}
ALLOWED_RESPONSE_QUALITIES = {"auto", "low", "medium", "high"}
ALLOWED_RESPONSE_OUTPUT_FORMATS = {"png", "jpeg", "webp"}
ALLOWED_RESPONSE_MODERATIONS = {"auto", "low"}


def normalize_image_upstream_endpoint(value: object) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ALLOWED_IMAGE_UPSTREAM_ENDPOINTS else DEFAULT_IMAGE_UPSTREAM_ENDPOINT


def normalize_image_size(value: object) -> str:
    normalized = str(value or "").strip()
    return normalized if normalized in ALLOWED_IMAGE_SIZES else DEFAULT_IMAGE_SIZE


def normalize_response_canvas(value: object) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ALLOWED_RESPONSE_CANVASES else DEFAULT_RESPONSE_CANVAS


def normalize_response_resolution(value: object) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ALLOWED_RESPONSE_RESOLUTIONS else DEFAULT_RESPONSE_RESOLUTION


def normalize_response_quality(value: object) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ALLOWED_RESPONSE_QUALITIES else DEFAULT_RESPONSE_QUALITY


def normalize_response_output_format(value: object) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ALLOWED_RESPONSE_OUTPUT_FORMATS else DEFAULT_RESPONSE_OUTPUT_FORMAT


def normalize_response_output_compression(value: object) -> int | None:
    if value is None:
        return DEFAULT_RESPONSE_OUTPUT_COMPRESSION
    normalized = str(value).strip().lower()
    if not normalized or normalized == "auto":
        return DEFAULT_RESPONSE_OUTPUT_COMPRESSION
    try:
        parsed = int(normalized)
    except (TypeError, ValueError):
        return DEFAULT_RESPONSE_OUTPUT_COMPRESSION
    if parsed < 0:
        return 0
    if parsed > 100:
        return 100
    return parsed


def normalize_response_moderation(value: object) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ALLOWED_RESPONSE_MODERATIONS else DEFAULT_RESPONSE_MODERATION


@dataclass(frozen=True)
class ImageResponseOptions:
    upstream_endpoint: str = DEFAULT_IMAGE_UPSTREAM_ENDPOINT
    canvas: str = DEFAULT_RESPONSE_CANVAS
    resolution: str = DEFAULT_RESPONSE_RESOLUTION
    quality: str = DEFAULT_RESPONSE_QUALITY
    output_format: str = DEFAULT_RESPONSE_OUTPUT_FORMAT
    output_compression: int | None = DEFAULT_RESPONSE_OUTPUT_COMPRESSION
    moderation: str = DEFAULT_RESPONSE_MODERATION


def normalize_image_response_options(
    upstream_endpoint: object,
    canvas: object,
    resolution: object,
    quality: object,
    output_format: object = None,
    output_compression: object = None,
    moderation: object = None,
) -> ImageResponseOptions:
    return ImageResponseOptions(
        upstream_endpoint=normalize_image_upstream_endpoint(upstream_endpoint),
        canvas=normalize_response_canvas(canvas),
        resolution=normalize_response_resolution(resolution),
        quality=normalize_response_quality(quality),
        output_format=normalize_response_output_format(output_format),
        output_compression=normalize_response_output_compression(output_compression),
        moderation=normalize_response_moderation(moderation),
    )
