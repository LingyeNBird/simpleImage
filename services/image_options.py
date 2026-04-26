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
DEFAULT_RESPONSE_MAIN_MODEL = "gpt-5.4-mini"
DEFAULT_RESPONSE_TOOL_MODEL = "auto"
DEFAULT_RESPONSE_INSTRUCTIONS = ""
DEFAULT_RESPONSE_REASONING_EFFORT = "medium"
DEFAULT_RESPONSE_REASONING_SUMMARY = "auto"
DEFAULT_RESPONSE_PARALLEL_TOOL_CALLS = True
DEFAULT_RESPONSE_INCLUDE_ENCRYPTED_REASONING = True
DEFAULT_RESPONSE_STORE = False
DEFAULT_RESPONSE_PARTIAL_IMAGES = 0
DEFAULT_RESPONSE_TOOL_CHOICE = "required"

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
ALLOWED_RESPONSE_REASONING_EFFORTS = {"low", "medium", "high"}
ALLOWED_RESPONSE_REASONING_SUMMARIES = {"auto", "concise", "detailed"}
ALLOWED_RESPONSE_TOOL_CHOICES = {"auto", "required"}


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


def normalize_response_main_model(value: object) -> str:
    normalized = str(value or "").strip()
    return normalized or DEFAULT_RESPONSE_MAIN_MODEL


def normalize_response_tool_model(value: object) -> str:
    normalized = str(value or "").strip()
    return normalized or DEFAULT_RESPONSE_TOOL_MODEL


def normalize_response_instructions(value: object) -> str:
    return str(value or "").strip()


def normalize_response_reasoning_effort(value: object) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ALLOWED_RESPONSE_REASONING_EFFORTS else DEFAULT_RESPONSE_REASONING_EFFORT


def normalize_response_reasoning_summary(value: object) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ALLOWED_RESPONSE_REASONING_SUMMARIES else DEFAULT_RESPONSE_REASONING_SUMMARY


def normalize_response_bool(value: object, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def normalize_response_partial_images(value: object) -> int:
    if value is None:
        return DEFAULT_RESPONSE_PARTIAL_IMAGES
    normalized = str(value).strip().lower()
    if not normalized or normalized == "auto":
        return DEFAULT_RESPONSE_PARTIAL_IMAGES
    try:
        parsed = int(normalized)
    except (TypeError, ValueError):
        return DEFAULT_RESPONSE_PARTIAL_IMAGES
    return max(0, parsed)


def normalize_response_tool_choice(value: object) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ALLOWED_RESPONSE_TOOL_CHOICES else DEFAULT_RESPONSE_TOOL_CHOICE


@dataclass(frozen=True)
class ImageResponseOptions:
    upstream_endpoint: str = DEFAULT_IMAGE_UPSTREAM_ENDPOINT
    canvas: str = DEFAULT_RESPONSE_CANVAS
    resolution: str = DEFAULT_RESPONSE_RESOLUTION
    quality: str = DEFAULT_RESPONSE_QUALITY
    output_format: str = DEFAULT_RESPONSE_OUTPUT_FORMAT
    output_compression: int | None = DEFAULT_RESPONSE_OUTPUT_COMPRESSION
    moderation: str = DEFAULT_RESPONSE_MODERATION
    main_model: str = DEFAULT_RESPONSE_MAIN_MODEL
    tool_model: str = DEFAULT_RESPONSE_TOOL_MODEL
    instructions: str = DEFAULT_RESPONSE_INSTRUCTIONS
    reasoning_effort: str = DEFAULT_RESPONSE_REASONING_EFFORT
    reasoning_summary: str = DEFAULT_RESPONSE_REASONING_SUMMARY
    parallel_tool_calls: bool = DEFAULT_RESPONSE_PARALLEL_TOOL_CALLS
    include_encrypted_reasoning: bool = DEFAULT_RESPONSE_INCLUDE_ENCRYPTED_REASONING
    store: bool = DEFAULT_RESPONSE_STORE
    partial_images: int = DEFAULT_RESPONSE_PARTIAL_IMAGES
    tool_choice: str = DEFAULT_RESPONSE_TOOL_CHOICE


def normalize_image_response_options(
    upstream_endpoint: object,
    canvas: object,
    resolution: object,
    quality: object,
    output_format: object = None,
    output_compression: object = None,
    moderation: object = None,
    main_model: object = None,
    tool_model: object = None,
    instructions: object = None,
    reasoning_effort: object = None,
    reasoning_summary: object = None,
    parallel_tool_calls: object = None,
    include_encrypted_reasoning: object = None,
    store: object = None,
    partial_images: object = None,
    tool_choice: object = None,
) -> ImageResponseOptions:
    return ImageResponseOptions(
        upstream_endpoint=normalize_image_upstream_endpoint(upstream_endpoint),
        canvas=normalize_response_canvas(canvas),
        resolution=normalize_response_resolution(resolution),
        quality=normalize_response_quality(quality),
        output_format=normalize_response_output_format(output_format),
        output_compression=normalize_response_output_compression(output_compression),
        moderation=normalize_response_moderation(moderation),
        main_model=normalize_response_main_model(main_model),
        tool_model=normalize_response_tool_model(tool_model),
        instructions=normalize_response_instructions(instructions),
        reasoning_effort=normalize_response_reasoning_effort(reasoning_effort),
        reasoning_summary=normalize_response_reasoning_summary(reasoning_summary),
        parallel_tool_calls=normalize_response_bool(parallel_tool_calls, DEFAULT_RESPONSE_PARALLEL_TOOL_CALLS),
        include_encrypted_reasoning=normalize_response_bool(
            include_encrypted_reasoning,
            DEFAULT_RESPONSE_INCLUDE_ENCRYPTED_REASONING,
        ),
        store=normalize_response_bool(store, DEFAULT_RESPONSE_STORE),
        partial_images=normalize_response_partial_images(partial_images),
        tool_choice=normalize_response_tool_choice(tool_choice),
    )
