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


@dataclass(frozen=True)
class ImageResponseOptions:
    upstream_endpoint: str = DEFAULT_IMAGE_UPSTREAM_ENDPOINT
    canvas: str = DEFAULT_RESPONSE_CANVAS
    resolution: str = DEFAULT_RESPONSE_RESOLUTION
    quality: str = DEFAULT_RESPONSE_QUALITY


def normalize_image_response_options(
    upstream_endpoint: object,
    canvas: object,
    resolution: object,
    quality: object,
) -> ImageResponseOptions:
    return ImageResponseOptions(
        upstream_endpoint=normalize_image_upstream_endpoint(upstream_endpoint),
        canvas=normalize_response_canvas(canvas),
        resolution=normalize_response_resolution(resolution),
        quality=normalize_response_quality(quality),
    )
