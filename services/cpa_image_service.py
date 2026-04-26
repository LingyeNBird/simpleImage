from __future__ import annotations

import base64
from typing import Mapping

from curl_cffi import CurlMime
from curl_cffi.requests import Session

from services.config import config
from services.image_options import ImageResponseOptions
from services.image_result_service import build_result_data_from_bytes
from services.image_service import ImageGenerationError


def _resolve_cpa_base_url() -> str:
    base_url = config.cpa_image_base_url
    if not base_url:
        raise ImageGenerationError("CPA image base URL is not configured")
    return base_url.rstrip("/")


def _resolve_cpa_api_key() -> str:
    api_key = config.cpa_image_api_key
    if not api_key:
        raise ImageGenerationError("CPA image API key is not configured")
    return api_key


def _resolve_output_mime_type(output_format: str) -> str:
    normalized = str(output_format or "png").strip().lower()
    if normalized == "jpeg":
        return "image/jpeg"
    if normalized == "webp":
        return "image/webp"
    return "image/png"


def _new_session() -> Session:
    proxy = config.get_proxy_settings()
    if proxy:
        return Session(impersonate="chrome131", verify=True, proxy=proxy)
    return Session(impersonate="chrome131", verify=True)


def _build_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }


def _resolve_cpa_model(requested_model: str, options: ImageResponseOptions) -> str:
    tool_model = str(options.tool_model or "").strip()
    if tool_model and tool_model.lower() != "auto":
        return tool_model
    normalized_requested = str(requested_model or "").strip()
    if normalized_requested and normalized_requested.lower() != "auto":
        return normalized_requested
    return "gpt-image-2"


def _resolve_cpa_size(size: str | None, options: ImageResponseOptions) -> str | None:
    resolution = str(options.resolution or "").strip().lower()
    if resolution and resolution != "auto":
        return resolution

    normalized_size = str(size or "").strip().lower()
    if not normalized_size:
        return None
    if "x" in normalized_size:
        return normalized_size

    ratio_map = {
        "1:1": "1024x1024",
        "16:9": "1536x864",
        "9:16": "864x1536",
        "4:3": "1536x1152",
        "3:4": "1152x1536",
    }
    return ratio_map.get(normalized_size, normalized_size)


def _build_generation_payload(
    prompt: str,
    requested_model: str,
    count: int,
    response_format: str,
    size: str | None,
    options: ImageResponseOptions,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "model": _resolve_cpa_model(requested_model, options),
        "prompt": prompt,
        "response_format": response_format,
        "n": max(1, int(count or 1)),
    }
    resolved_size = _resolve_cpa_size(size, options)
    if resolved_size:
        payload["size"] = resolved_size
    if options.quality != "auto":
        payload["quality"] = options.quality
    if options.output_format:
        payload["output_format"] = options.output_format
    if options.output_compression is not None and options.output_format != "png":
        payload["output_compression"] = options.output_compression
    if options.moderation != "auto":
        payload["moderation"] = options.moderation
    if options.canvas != "auto":
        payload["background"] = options.canvas
    return payload


def _build_edit_form_payload(payload: Mapping[str, object]) -> dict[str, str]:
    return {key: str(value) for key, value in payload.items() if value is not None}


def _extract_error_text(response: object) -> str:
    status_code = getattr(response, "status_code", "unknown")
    try:
        body = str(getattr(response, "text", "") or "").strip()
    except Exception:
        body = ""
    return body[:1200] if body else f"CPA request failed: {status_code}"


def _public_cpa_error_message(kind: str = "generate") -> str:
    if kind == "edit":
        return "图片编辑失败，请稍后重试或联系管理员检查 CPA 图片服务配置"
    return "图片生成失败，请稍后重试或联系管理员检查 CPA 图片服务配置"


def _download_remote_image(session: Session, url: str, fallback_mime_type: str) -> tuple[bytes, str]:
    try:
        response = session.get(url, timeout=180)
    except Exception as exc:
        raise ImageGenerationError(
            f"failed to download CPA image url: {exc}",
            failure_log=f"download_url={url}\nerror={exc}",
            public_message="图片下载失败，请稍后重试或联系管理员",
        ) from exc
    if not response.ok:
        raise ImageGenerationError(
            f"failed to download CPA image url: {response.status_code}",
            failure_log=f"download_url={url}\nstatus_code={response.status_code}\nresponse_body:\n{_extract_error_text(response)}",
            public_message="图片下载失败，请稍后重试或联系管理员",
        )
    content = response.content
    if not content:
        raise ImageGenerationError("CPA image url returned empty body")
    mime_type = str(response.headers.get("content-type") or fallback_mime_type).split(";")[0].strip() or fallback_mime_type
    return content, mime_type


def _normalize_result_item(
    session: Session,
    item: dict[str, object],
    *,
    prompt: str,
    response_format: str,
    base_url: str | None,
    delivery_mode: str,
    output_mime_type: str,
) -> dict[str, str]:
    revised_prompt = str(item.get("revised_prompt") or prompt).strip() or prompt
    b64_json = str(item.get("b64_json") or "").strip()
    if b64_json:
        try:
            image_bytes = base64.b64decode(b64_json, validate=False)
        except Exception as exc:
            raise ImageGenerationError(f"decode CPA image failed: {exc}") from exc
        return build_result_data_from_bytes(
            image_bytes,
            prompt=prompt,
            response_format=response_format,
            base_url=base_url,
            delivery_mode=delivery_mode,
            mime_type=output_mime_type,
            revised_prompt=revised_prompt,
        )

    url = str(item.get("url") or "").strip()
    if not url:
        raise ImageGenerationError(
            "CPA image payload did not include b64_json or url",
            public_message="图片生成失败，请稍后重试或联系管理员",
        )
    if str(delivery_mode or "direct").strip() != "direct" or str(response_format or "b64_json").strip() != "url":
        image_bytes, mime_type = _download_remote_image(session, url, output_mime_type)
        return build_result_data_from_bytes(
            image_bytes,
            prompt=prompt,
            response_format=response_format,
            base_url=base_url,
            delivery_mode=delivery_mode,
            mime_type=mime_type,
            revised_prompt=revised_prompt,
        )
    return {
        "url": url,
        "revised_prompt": revised_prompt,
        "storage": "direct",
    }


def generate_image_result_via_cpa(
    prompt: str,
    model: str,
    count: int,
    response_format: str,
    base_url: str | None,
    delivery_mode: str,
    size: str | None,
    options: ImageResponseOptions,
) -> dict[str, object]:
    request_base_url = _resolve_cpa_base_url()
    api_key = _resolve_cpa_api_key()
    output_mime_type = _resolve_output_mime_type(options.output_format)
    payload = _build_generation_payload(prompt, model, count, response_format, size, options)
    session = _new_session()
    try:
        try:
            response = session.post(
                f"{request_base_url}/v1/images/generations",
                headers=_build_headers(api_key),
                json=payload,
                timeout=180,
            )
        except Exception as exc:
            raise ImageGenerationError(
                f"CPA transport request failed: {exc}",
                failure_log=f"request_url={request_base_url}/v1/images/generations\nerror={exc}",
                public_message=_public_cpa_error_message("generate"),
            ) from exc
        if not response.ok:
            raise ImageGenerationError(
                _extract_error_text(response),
                failure_log=(
                    f"status_code={response.status_code}\n"
                    f"request_url={request_base_url}/v1/images/generations\n"
                    f"response_body:\n{_extract_error_text(response)}"
                ),
                public_message=_public_cpa_error_message("generate"),
            )
        payload_data = response.json()
        data = payload_data.get("data") if isinstance(payload_data, dict) else None
        if not isinstance(data, list) or not data:
            raise ImageGenerationError("CPA image response is invalid", public_message=_public_cpa_error_message("generate"))
        result_items = [
            _normalize_result_item(
                session,
                item,
                prompt=prompt,
                response_format=response_format,
                base_url=base_url,
                delivery_mode=delivery_mode,
                output_mime_type=output_mime_type,
            )
            for item in data
            if isinstance(item, dict)
        ]
        if not result_items:
            raise ImageGenerationError("CPA image response returned no valid images", public_message=_public_cpa_error_message("generate"))
        return {"created": int(payload_data.get("created") or 0), "data": result_items}
    finally:
        session.close()


def edit_image_result_via_cpa(
    prompt: str,
    images: list[tuple[bytes, str, str]],
    model: str,
    count: int,
    response_format: str,
    base_url: str | None,
    delivery_mode: str,
    size: str | None,
    options: ImageResponseOptions,
) -> dict[str, object]:
    if not images:
        raise ImageGenerationError("image is required")
    request_base_url = _resolve_cpa_base_url()
    api_key = _resolve_cpa_api_key()
    output_mime_type = _resolve_output_mime_type(options.output_format)
    payload = _build_generation_payload(prompt, model, count, response_format, size, options)
    multipart = CurlMime.from_list(
        [
            {
                "name": "image[]",
                "filename": file_name or "image.png",
                "content_type": mime_type or "image/png",
                "data": image_bytes,
            }
            for image_bytes, file_name, mime_type in images
        ]
    )
    form_payload = _build_edit_form_payload(payload)
    session = _new_session()
    try:
        try:
            response = session.post(
                f"{request_base_url}/v1/images/edits",
                headers=_build_headers(api_key),
                data=form_payload,
                multipart=multipart,
                timeout=180,
            )
        except Exception as exc:
            raise ImageGenerationError(
                f"CPA transport request failed: {exc}",
                failure_log=f"request_url={request_base_url}/v1/images/edits\nerror={exc}",
                public_message=_public_cpa_error_message("edit"),
            ) from exc
        if not response.ok:
            raise ImageGenerationError(
                _extract_error_text(response),
                failure_log=(
                    f"status_code={response.status_code}\n"
                    f"request_url={request_base_url}/v1/images/edits\n"
                    f"response_body:\n{_extract_error_text(response)}"
                ),
                public_message=_public_cpa_error_message("edit"),
            )
        payload_data = response.json()
        data = payload_data.get("data") if isinstance(payload_data, dict) else None
        if not isinstance(data, list) or not data:
            raise ImageGenerationError("CPA image response is invalid", public_message=_public_cpa_error_message("edit"))
        result_items = [
            _normalize_result_item(
                session,
                item,
                prompt=prompt,
                response_format=response_format,
                base_url=base_url,
                delivery_mode=delivery_mode,
                output_mime_type=output_mime_type,
            )
            for item in data
            if isinstance(item, dict)
        ]
        if not result_items:
            raise ImageGenerationError("CPA image response returned no valid images", public_message=_public_cpa_error_message("edit"))
        return {"created": int(payload_data.get("created") or 0), "data": result_items}
    finally:
        session.close()
