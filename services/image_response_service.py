from __future__ import annotations

import base64
import json
from typing import Any

from curl_cffi.requests import Session

from services.config import config
from services.image_options import ImageResponseOptions
from services.image_result_service import build_result_data_from_bytes
from services.image_service import ImageGenerationError


CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
CODEX_USER_AGENT = "codex-tui/0.118.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9 (codex-tui; 0.118.0)"
DEFAULT_RESPONSES_MAIN_MODEL = "gpt-5.4-mini"
DEFAULT_RESPONSES_TOOL_MODEL = "gpt-image-2"


def _resolve_output_mime_type(output_format: str) -> str:
    if output_format == "jpeg":
        return "image/jpeg"
    if output_format == "webp":
        return "image/webp"
    return "image/png"


def _build_responses_headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "text/event-stream",
        "Connection": "Keep-Alive",
        "Content-Type": "application/json",
        "Originator": "codex-tui",
        "User-Agent": CODEX_USER_AGENT,
    }


def _new_responses_session() -> Session:
    proxy = config.get_proxy_settings()
    if proxy:
        return Session(impersonate="chrome131", verify=True, proxy=proxy)
    return Session(impersonate="chrome131", verify=True)


def _resolve_responses_tool_model(requested_model: str) -> str:
    normalized = str(requested_model or "").strip()
    if not normalized or normalized == "auto":
        return DEFAULT_RESPONSES_TOOL_MODEL
    return normalized


def _build_responses_tool(action: str, requested_model: str, options: ImageResponseOptions) -> dict[str, object]:
    tool: dict[str, object] = {
        "type": "image_generation",
        "action": action,
        "model": _resolve_responses_tool_model(requested_model),
        "output_format": options.output_format,
        "partial_images": 0,
    }
    if options.output_compression is not None and options.output_format != "png":
        tool["output_compression"] = options.output_compression
    if options.resolution != "auto":
        tool["size"] = options.resolution
    if options.quality != "auto":
        tool["quality"] = options.quality
    if options.canvas != "auto":
        tool["background"] = options.canvas
    if options.moderation != "auto":
        tool["moderation"] = options.moderation
    return tool


def _build_responses_request(
    *,
    prompt: str,
    requested_model: str,
    action: str,
    options: ImageResponseOptions,
    images: list[str] | None = None,
) -> dict[str, object]:
    content: list[dict[str, object]] = [{"type": "input_text", "text": prompt}]
    for image_url in images or []:
        if str(image_url or "").strip():
            content.append({"type": "input_image", "image_url": str(image_url).strip()})
    return {
        "instructions": "",
        "stream": True,
        "reasoning": {"effort": "medium", "summary": "auto"},
        "parallel_tool_calls": True,
        "include": ["reasoning.encrypted_content"],
        "model": DEFAULT_RESPONSES_MAIN_MODEL,
        "store": False,
        "tool_choice": {"type": "image_generation"},
        "input": [{"type": "message", "role": "user", "content": content}],
        "tools": [_build_responses_tool(action, requested_model, options)],
    }


def _iter_sse_payloads(response: Any) -> list[dict[str, object]]:
    payloads: list[dict[str, object]] = []
    for raw_line in response.iter_lines():
        if not raw_line:
            continue
        if isinstance(raw_line, bytes):
            raw_line = raw_line.decode("utf-8", errors="replace")
        line = raw_line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload in ("", "[DONE]"):
            continue
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            payloads.append(parsed)
    return payloads


def _patch_output_from_items(payloads: list[dict[str, object]], completed: dict[str, object]) -> dict[str, object]:
    response_payload = completed.get("response")
    if not isinstance(response_payload, dict):
        return completed
    output = response_payload.get("output")
    if isinstance(output, list) and output:
        return completed

    indexed: dict[int, dict[str, object]] = {}
    fallback: list[dict[str, object]] = []
    for payload in payloads:
        if str(payload.get("type") or "") != "response.output_item.done":
            continue
        item = payload.get("item")
        if not isinstance(item, dict):
            continue
        output_index = payload.get("output_index")
        if isinstance(output_index, int):
            indexed[output_index] = item
        else:
            fallback.append(item)

    if not indexed and not fallback:
        return completed

    patched_output = [item for _, item in sorted(indexed.items(), key=lambda pair: pair[0])]
    patched_output.extend(fallback)
    response_payload["output"] = patched_output
    return completed


def _extract_completed_response(payloads: list[dict[str, object]]) -> dict[str, object]:
    completed_event: dict[str, object] | None = None
    for payload in payloads:
        if str(payload.get("type") or "") == "response.completed":
            completed_event = payload
    if completed_event is None:
        raise ImageGenerationError("responses stream disconnected before completion")
    return _patch_output_from_items(payloads, completed_event)


def _extract_image_results(completed_event: dict[str, object]) -> tuple[list[dict[str, object]], int]:
    response_payload = completed_event.get("response")
    if not isinstance(response_payload, dict):
        raise ImageGenerationError("responses completion payload is invalid")

    created_at = int(response_payload.get("created_at") or 0)
    output = response_payload.get("output")
    if not isinstance(output, list):
        raise ImageGenerationError("responses output is invalid")

    results: list[dict[str, object]] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        if str(item.get("type") or "") != "image_generation_call":
            continue
        result = str(item.get("result") or "").strip()
        if not result:
            continue
        results.append(item)

    if not results:
        raise ImageGenerationError("responses upstream did not return image output")
    return results, created_at


def _result_item_to_image_bytes(item: dict[str, object]) -> bytes:
    try:
        return base64.b64decode(str(item.get("result") or ""), validate=False)
    except Exception as exc:  # pragma: no cover - defensive decode guard
        raise ImageGenerationError(f"decode responses image failed: {exc}") from exc


def _content_data_url(image_data: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(image_data).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def generate_image_result_via_responses(
    access_token: str,
    prompt: str,
    model: str,
    response_format: str,
    base_url: str | None,
    delivery_mode: str,
    options: ImageResponseOptions,
) -> dict[str, object]:
    session = _new_responses_session()
    output_mime_type = _resolve_output_mime_type(options.output_format)
    try:
        response = session.post(
            f"{CODEX_BASE_URL}/responses",
            headers=_build_responses_headers(access_token),
            json=_build_responses_request(prompt=prompt, requested_model=model, action="generate", options=options),
            stream=True,
            timeout=180,
        )
        if not response.ok:
            raise ImageGenerationError(response.text[:400] or f"responses request failed: {response.status_code}")

        payloads = _iter_sse_payloads(response)
        completed = _extract_completed_response(payloads)
        items, created_at = _extract_image_results(completed)
        data = []
        for item in items:
            data.append(
                build_result_data_from_bytes(
                    _result_item_to_image_bytes(item),
                    prompt=prompt,
                    response_format=response_format,
                    base_url=base_url,
                    delivery_mode=delivery_mode,
                    mime_type=output_mime_type,
                    revised_prompt=str(item.get("revised_prompt") or prompt).strip() or prompt,
                )
            )
        return {"created": created_at or 0, "data": data}
    finally:
        session.close()


def edit_image_result_via_responses(
    access_token: str,
    prompt: str,
    images: list[tuple[bytes, str, str]],
    model: str,
    response_format: str,
    base_url: str | None,
    delivery_mode: str,
    options: ImageResponseOptions,
) -> dict[str, object]:
    encoded_images = [_content_data_url(image_data, mime_type or "image/png") for image_data, _, mime_type in images if image_data]
    if not encoded_images:
        raise ImageGenerationError("image is required")

    session = _new_responses_session()
    output_mime_type = _resolve_output_mime_type(options.output_format)
    try:
        response = session.post(
            f"{CODEX_BASE_URL}/responses",
            headers=_build_responses_headers(access_token),
            json=_build_responses_request(
                prompt=prompt,
                requested_model=model,
                action="edit",
                options=options,
                images=encoded_images,
            ),
            stream=True,
            timeout=180,
        )
        if not response.ok:
            raise ImageGenerationError(response.text[:400] or f"responses request failed: {response.status_code}")

        payloads = _iter_sse_payloads(response)
        completed = _extract_completed_response(payloads)
        items, created_at = _extract_image_results(completed)
        data = []
        for item in items:
            data.append(
                build_result_data_from_bytes(
                    _result_item_to_image_bytes(item),
                    prompt=prompt,
                    response_format=response_format,
                    base_url=base_url,
                    delivery_mode=delivery_mode,
                    mime_type=output_mime_type,
                    revised_prompt=str(item.get("revised_prompt") or prompt).strip() or prompt,
                )
            )
        return {"created": created_at or 0, "data": data}
    finally:
        session.close()
