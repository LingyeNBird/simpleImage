from __future__ import annotations

import hashlib
import time
import uuid
from collections.abc import Mapping

from fastapi import HTTPException

from services.image_options import ImageResponseOptions, normalize_image_response_options


IMAGE_MODELS = {"gpt-image-1", "gpt-image-2"}


def anonymize_token(token: object) -> str:
    value = str(token or "").strip()
    if not value:
        return "token:empty"
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:10]
    return f"token:{digest}"


def is_image_chat_request(body: dict[str, object]) -> bool:
    model = str(body.get("model") or "").strip()
    modalities = body.get("modalities")
    if model in IMAGE_MODELS:
        return True
    if isinstance(modalities, list):
        normalized = {str(item or "").strip().lower() for item in modalities}
        return "image" in normalized
    return False


def extract_response_prompt(input_value: object) -> str:
    if isinstance(input_value, str):
        return input_value.strip()

    if isinstance(input_value, dict):
        role = str(input_value.get("role") or "").strip().lower()
        if role and role != "user":
            return ""
        return extract_prompt_from_message_content(input_value.get("content"))

    if not isinstance(input_value, list):
        return ""

    prompt_parts: list[str] = []
    for item in input_value:
        if isinstance(item, dict) and str(item.get("type") or "").strip() == "input_text":
            text = str(item.get("text") or "").strip()
            if text:
                prompt_parts.append(text)
            continue
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role and role != "user":
            continue
        prompt = extract_prompt_from_message_content(item.get("content"))
        if prompt:
            prompt_parts.append(prompt)
    return "\n".join(prompt_parts).strip()


def has_response_image_generation_tool(body: dict[str, object]) -> bool:
    tools = body.get("tools")
    if isinstance(tools, list):
        for tool in tools:
            if isinstance(tool, dict) and str(tool.get("type") or "").strip() == "image_generation":
                return True

    tool_choice = body.get("tool_choice")
    if isinstance(tool_choice, dict) and str(tool_choice.get("type") or "").strip() == "image_generation":
        return True
    return False


def extract_response_image_options(body: dict[str, object]) -> ImageResponseOptions:
    tool_payload: dict[str, object] | None = None
    reasoning = body.get("reasoning")
    reasoning_payload = reasoning if isinstance(reasoning, dict) else None
    include = body.get("include")
    include_payload = include if isinstance(include, list) else None
    tool_choice = body.get("tool_choice")
    tool_choice_payload = tool_choice if isinstance(tool_choice, dict) else None
    tools = body.get("tools")
    if isinstance(tools, list):
        for tool in tools:
            if isinstance(tool, dict) and str(tool.get("type") or "").strip() == "image_generation":
                tool_payload = tool
                break

    return normalize_image_response_options(
        "response",
        tool_payload.get("background") if tool_payload else None,
        tool_payload.get("size") if tool_payload else None,
        tool_payload.get("quality") if tool_payload else None,
        tool_payload.get("output_format") if tool_payload else None,
        tool_payload.get("output_compression") if tool_payload else None,
        tool_payload.get("moderation") if tool_payload else None,
        body.get("model"),
        tool_payload.get("model") if tool_payload else None,
        body.get("instructions"),
        reasoning_payload.get("effort") if reasoning_payload else None,
        reasoning_payload.get("summary") if reasoning_payload else None,
        body.get("parallel_tool_calls"),
        "reasoning.encrypted_content" in include_payload if include_payload is not None else None,
        body.get("store"),
        tool_payload.get("partial_images") if tool_payload else None,
        "required"
        if tool_choice_payload and str(tool_choice_payload.get("type") or "") == "image_generation"
        else body.get("tool_choice"),
    )


def extract_prompt_from_message_content(content: object) -> str:
    if isinstance(content, str):
        return content.strip()
    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type") or "").strip()
        if item_type == "text":
            text = str(item.get("text") or "").strip()
            if text:
                parts.append(text)
            continue
        if item_type == "input_text":
            text = str(item.get("text") or item.get("input_text") or "").strip()
            if text:
                parts.append(text)
    return "\n".join(parts).strip()


def extract_images_from_message_content(content: object) -> list[tuple[bytes, str]]:
    import base64 as b64

    if not isinstance(content, list):
        return []

    images: list[tuple[bytes, str]] = []

    for item in content:
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type") or "").strip()
        if item_type == "image_url":
            url_obj = item.get("image_url") or item
            url = str(url_obj.get("url") or "") if isinstance(url_obj, dict) else str(url_obj)
            if url.startswith("data:"):
                header, _, data = url.partition(",")
                mime = header.split(";")[0].removeprefix("data:")
                images.append((b64.b64decode(data), mime or "image/png"))
        if item_type == "input_image":
            image_url = str(item.get("image_url") or "")
            if image_url.startswith("data:"):
                header, _, data = image_url.partition(",")
                mime = header.split(";")[0].removeprefix("data:")
                images.append((b64.b64decode(data), mime or "image/png"))
    return images


def extract_image_from_message_content(content: object) -> tuple[bytes, str] | None:
    images = extract_images_from_message_content(content)
    return images[0] if images else None


def extract_chat_image(body: dict[str, object]) -> tuple[bytes, str] | None:
    images = extract_chat_images(body)
    return images[0] if images else None


def extract_chat_images(body: dict[str, object]) -> list[tuple[bytes, str]]:
    messages = body.get("messages")
    if not isinstance(messages, list):
        return []

    all_images: list[tuple[bytes, str]] = []

    for message in reversed(messages):
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or "").strip().lower()
        if role != "user":
            continue
        all_images.extend(extract_images_from_message_content(message.get("content")))
    return all_images


def extract_chat_prompt(body: dict[str, object]) -> str:
    direct_prompt = str(body.get("prompt") or "").strip()
    if direct_prompt:
        return direct_prompt

    messages = body.get("messages")
    if not isinstance(messages, list):
        return ""

    prompt_parts: list[str] = []
    for message in messages:
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or "").strip().lower()
        if role != "user":
            continue
        prompt = extract_prompt_from_message_content(message.get("content"))
        if prompt:
            prompt_parts.append(prompt)

    return "\n".join(prompt_parts).strip()


def parse_image_count(raw_value: object) -> int:
    try:
        if raw_value is None:
            value = 1
        elif isinstance(raw_value, bool):
            value = int(raw_value)
        elif isinstance(raw_value, int):
            value = raw_value
        elif isinstance(raw_value, float):
            value = int(raw_value)
        elif isinstance(raw_value, str):
            value = int(raw_value.strip() or "1")
        else:
            raise TypeError("n must be an integer")
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail={"error": "n must be an integer"}) from exc
    if value < 1 or value > 4:
        raise HTTPException(status_code=400, detail={"error": "n must be between 1 and 4"})
    return value


def build_chat_image_completion(
    model: str,
    prompt: str,
    image_result: Mapping[str, object],
) -> dict[str, object]:
    created_raw = image_result.get("created")
    if isinstance(created_raw, bool):
        created = int(created_raw)
    elif isinstance(created_raw, int):
        created = created_raw
    elif isinstance(created_raw, float):
        created = int(created_raw)
    elif isinstance(created_raw, str):
        created = int(created_raw.strip() or int(time.time()))
    else:
        created = int(time.time())

    image_items_raw = image_result.get("data")
    image_items = image_items_raw if isinstance(image_items_raw, list) else []

    markdown_images: list[str] = []

    for index, item in enumerate(image_items, start=1):
        if not isinstance(item, dict):
            continue
        b64_json = str(item.get("b64_json") or "").strip()
        if not b64_json:
            continue
        image_data_url = f"data:image/png;base64,{b64_json}"
        markdown_images.append(f"![image_{index}]({image_data_url})")

    text_content = "\n\n".join(markdown_images) if markdown_images else "Image generation completed."

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": text_content,
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
    }
