from __future__ import annotations

from typing import Iterable

from fastapi import HTTPException

from services.account_service import AccountService
from services.cpa_image_service import edit_image_result_via_cpa, generate_image_result_via_cpa
from services.image_options import ImageResponseOptions, normalize_image_response_options
from services.image_service import ImageGenerationError, edit_image_result, generate_image_result, is_token_invalid_error
from services.utils import (
    build_chat_image_completion,
    extract_chat_images,
    extract_chat_prompt,
    extract_response_image_options,
    extract_image_from_message_content,
    extract_response_prompt,
    has_response_image_generation_tool,
    is_image_chat_request,
    parse_image_count,
)


def _extract_response_image(input_value: object) -> tuple[bytes, str] | None:
    if isinstance(input_value, dict):
        return extract_image_from_message_content(input_value.get("content"))
    if not isinstance(input_value, list):
        return None
    for item in reversed(input_value):
        if isinstance(item, dict):
            if str(item.get("type") or "").strip() == "input_image":
                import base64 as b64
                image_url = str(item.get("image_url") or "")
                if image_url.startswith("data:"):
                    header, _, data = image_url.partition(",")
                    mime = header.split(";")[0].removeprefix("data:")
                    return b64.b64decode(data), mime or "image/png"
            content = item.get("content")
            if content:
                result = extract_image_from_message_content(content)
                if result:
                    return result
    return None


class ChatGPTService:
    def __init__(self, account_service: AccountService):
        self.account_service = account_service

    def generate_with_pool(
        self,
        prompt: str,
        model: str,
        n: int,
        response_format: str = "b64_json",
        base_url: str | None = None,
        delivery_mode: str = "direct",
        size: str | None = None,
        response_options: ImageResponseOptions | None = None,
    ):
        normalized_response_options = response_options or normalize_image_response_options(None, None, None, None)
        if normalized_response_options.upstream_endpoint == "response":
            return generate_image_result_via_cpa(
                prompt,
                model,
                n,
                response_format,
                base_url,
                delivery_mode,
                size,
                normalized_response_options,
            )

        created = None
        image_items: list[dict[str, object]] = []
        failure_logs: list[str] = []

        for index in range(1, n + 1):
            while True:
                try:
                    request_token = self.account_service.get_available_access_token()
                except RuntimeError as exc:
                    print(f"[image-generate] stop index={index}/{n} error={exc}")
                    break

                print(f"[image-generate] start pooled token={request_token[:12]}... model={model} index={index}/{n}")
                try:
                    result = generate_image_result(request_token, prompt, model, response_format, base_url, delivery_mode, size)
                    account = self.account_service.mark_image_result(request_token, success=True)
                    if created is None:
                        created = result.get("created")
                    data = result.get("data")
                    if isinstance(data, list):
                        image_items.extend(item for item in data if isinstance(item, dict))
                    print(
                        f"[image-generate] success pooled token={request_token[:12]}... "
                        f"quota={account.get('quota') if account else 'unknown'} status={account.get('status') if account else 'unknown'}"
                    )
                    break
                except ImageGenerationError as exc:
                    account = self.account_service.mark_image_result(request_token, success=False)
                    message = str(exc)
                    failure_logs.append(
                        "\n".join(
                            part
                            for part in [
                                f"attempt={index}/{n}",
                                f"token={request_token[:12]}...",
                                f"model={model}",
                                f"delivery_mode={delivery_mode}",
                                f"upstream_endpoint={normalized_response_options.upstream_endpoint}",
                                f"error={message}",
                                getattr(exc, "failure_log", None),
                            ]
                            if part
                        )
                    )
                    print(
                        f"[image-generate] fail pooled token={request_token[:12]}... "
                        f"error={message} quota={account.get('quota') if account else 'unknown'} status={account.get('status') if account else 'unknown'}"
                    )
                    if is_token_invalid_error(message):
                        self.account_service.remove_token(request_token)
                        print(f"[image-generate] remove invalid token={request_token[:12]}...")
                        continue
                    break

        if not image_items:
            raise ImageGenerationError("image generation failed", failure_log="\n\n".join(failure_logs))

        return {
            "created": created,
            "data": image_items,
        }

    def edit_with_pool(
        self,
        prompt: str,
        images: Iterable[tuple[bytes, str, str]],
        model: str,
        n: int,
        response_format: str = "b64_json",
        base_url: str | None = None,
        delivery_mode: str = "direct",
        size: str | None = None,
        response_options: ImageResponseOptions | None = None,
    ):
        normalized_response_options = response_options or normalize_image_response_options(None, None, None, None)
        normalized_images = list(images)
        if not normalized_images:
            raise ImageGenerationError("image is required")
        if normalized_response_options.upstream_endpoint == "response":
            return edit_image_result_via_cpa(
                prompt,
                normalized_images,
                model,
                n,
                response_format,
                base_url,
                delivery_mode,
                size,
                normalized_response_options,
            )

        created = None
        image_items: list[dict[str, object]] = []
        failure_logs: list[str] = []

        for index in range(1, n + 1):
            while True:
                try:
                    request_token = self.account_service.get_available_access_token()
                except RuntimeError as exc:
                    print(f"[image-edit] stop index={index}/{n} error={exc}")
                    break

                print(
                    f"[image-edit] start pooled token={request_token[:12]}... "
                    f"model={model} index={index}/{n} images={len(normalized_images)}"
                )
                try:
                    result = edit_image_result(
                        request_token,
                        prompt,
                        normalized_images,
                        model,
                        response_format,
                        base_url,
                        delivery_mode,
                        size,
                    )
                    account = self.account_service.mark_image_result(request_token, success=True)
                    if created is None:
                        created = result.get("created")
                    data = result.get("data")
                    if isinstance(data, list):
                        image_items.extend(item for item in data if isinstance(item, dict))
                    print(
                        f"[image-edit] success pooled token={request_token[:12]}... "
                        f"quota={account.get('quota') if account else 'unknown'} status={account.get('status') if account else 'unknown'}"
                    )
                    break
                except ImageGenerationError as exc:
                    account = self.account_service.mark_image_result(request_token, success=False)
                    message = str(exc)
                    failure_logs.append(
                        "\n".join(
                            part
                            for part in [
                                f"attempt={index}/{n}",
                                f"token={request_token[:12]}...",
                                f"model={model}",
                                f"delivery_mode={delivery_mode}",
                                f"upstream_endpoint={normalized_response_options.upstream_endpoint}",
                                f"reference_image_count={len(normalized_images)}",
                                f"error={message}",
                                getattr(exc, "failure_log", None),
                            ]
                            if part
                        )
                    )
                    print(
                        f"[image-edit] fail pooled token={request_token[:12]}... "
                        f"error={message} quota={account.get('quota') if account else 'unknown'} status={account.get('status') if account else 'unknown'}"
                    )
                    if is_token_invalid_error(message):
                        self.account_service.remove_token(request_token)
                        print(f"[image-edit] remove invalid token={request_token[:12]}...")
                        continue
                    break

        if not image_items:
            raise ImageGenerationError("image edit failed", failure_log="\n\n".join(failure_logs))

        return {
            "created": created,
            "data": image_items,
        }

    def create_image_completion(self, body: dict[str, object]) -> dict[str, object]:
        if not is_image_chat_request(body):
            raise HTTPException(
                status_code=400,
                detail={"error": "only image generation requests are supported on this endpoint"},
            )

        if bool(body.get("stream")):
            raise HTTPException(status_code=400, detail={"error": "stream is not supported for image generation"})

        model = str(body.get("model") or "gpt-image-1").strip() or "gpt-image-1"
        n = parse_image_count(body.get("n"))
        prompt = extract_chat_prompt(body)
        size = str(body.get("size") or "1:1").strip() or "1:1"
        if not prompt:
            raise HTTPException(status_code=400, detail={"error": "prompt is required"})

        image_infos = extract_chat_images(body)
        try:
            if image_infos:
                files = [(image_data, f"image-{index + 1}.png", mime_type) for index, (image_data, mime_type) in enumerate(image_infos)]
                image_result = self.edit_with_pool(prompt, files, model, n, size=size)
            else:
                image_result = self.generate_with_pool(prompt, model, n, size=size)
        except ImageGenerationError as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

        return build_chat_image_completion(model, prompt, image_result)

    def create_response(self, body: dict[str, object]) -> dict[str, object]:
        if bool(body.get("stream")):
            raise HTTPException(status_code=400, detail={"error": "stream is not supported"})

        if not has_response_image_generation_tool(body):
            raise HTTPException(
                status_code=400,
                detail={"error": "only image_generation tool requests are supported on this endpoint"},
            )

        prompt = extract_response_prompt(body.get("input"))
        if not prompt:
            raise HTTPException(status_code=400, detail={"error": "input text is required"})

        image_info = _extract_response_image(body.get("input"))
        model = str(body.get("model") or "gpt-5").strip() or "gpt-5"
        response_options = extract_response_image_options(body)
        try:
            if image_info:
                image_data, mime_type = image_info
                image_result = self.edit_with_pool(
                    prompt,
                    [(image_data, "image.png", mime_type)],
                    "gpt-image-1",
                    1,
                    response_options=response_options,
                )
            else:
                image_result = self.generate_with_pool(prompt, "gpt-image-1", 1, response_options=response_options)
        except ImageGenerationError as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

        image_items = image_result.get("data")
        normalized_image_items = image_items if isinstance(image_items, list) else []
        output: list[dict[str, object]] = []
        for item in normalized_image_items:
            if not isinstance(item, dict):
                continue
            b64_json = str(item.get("b64_json") or "").strip()
            if not b64_json:
                continue
            output.append(
                {
                    "id": f"ig_{len(output) + 1}",
                    "type": "image_generation_call",
                    "status": "completed",
                    "result": b64_json,
                    "revised_prompt": str(item.get("revised_prompt") or prompt).strip(),
                }
            )

        if not output:
            raise HTTPException(status_code=502, detail={"error": "image generation failed"})

        created_raw = image_result.get("created")
        if isinstance(created_raw, bool):
            created = int(created_raw)
        elif isinstance(created_raw, int):
            created = created_raw
        elif isinstance(created_raw, float):
            created = int(created_raw)
        elif isinstance(created_raw, str):
            created = int(created_raw.strip() or "0")
        else:
            created = 0
        return {
            "id": f"resp_{created}",
            "object": "response",
            "created_at": created,
            "status": "completed",
            "error": None,
            "incomplete_details": None,
            "model": model,
            "output": output,
            "parallel_tool_calls": False,
        }
