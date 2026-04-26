from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from threading import Event, Thread
import traceback
from typing import Mapping

from fastapi import APIRouter, FastAPI, File, Form, Header, Request, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from services.account_service import account_service
from services.auth_service import AuthContext, auth_service
from services.chatgpt_service import ChatGPTService
from services.config import config
from services.cos_config import load_cos_config, save_cos_config
from services.cos_storage_service import build_signed_download_url, get_image_url_expires_at_iso, is_cos_storage_ready, is_project_image_object_key
from services.cos_storage_service import count_project_images, test_connection as test_cos_connection
from services.cpa_service import cpa_config, cpa_import_service, list_remote_files
from services.user_service import user_service
from services.proxy_service import test_proxy
from services.sub2api_service import (
    list_remote_accounts as sub2api_list_remote_accounts,
    list_remote_groups as sub2api_list_remote_groups,
    sub2api_config,
    sub2api_import_service,
)

from services.image_service import ImageGenerationError
from services.image_options import (
    DEFAULT_IMAGE_SIZE,
    DEFAULT_IMAGE_UPSTREAM_ENDPOINT,
    DEFAULT_RESPONSE_CANVAS,
    DEFAULT_RESPONSE_MODERATION,
    DEFAULT_RESPONSE_MAIN_MODEL,
    DEFAULT_RESPONSE_TOOL_MODEL,
    DEFAULT_RESPONSE_INSTRUCTIONS,
    DEFAULT_RESPONSE_REASONING_EFFORT,
    DEFAULT_RESPONSE_REASONING_SUMMARY,
    DEFAULT_RESPONSE_PARALLEL_TOOL_CALLS,
    DEFAULT_RESPONSE_INCLUDE_ENCRYPTED_REASONING,
    DEFAULT_RESPONSE_STORE,
    DEFAULT_RESPONSE_PARTIAL_IMAGES,
    DEFAULT_RESPONSE_TOOL_CHOICE,
    DEFAULT_RESPONSE_OUTPUT_FORMAT,
    DEFAULT_RESPONSE_QUALITY,
    DEFAULT_RESPONSE_OUTPUT_COMPRESSION,
    DEFAULT_RESPONSE_RESOLUTION,
    normalize_image_response_options,
    normalize_image_size,
)
from services.image_job_service import image_job_service
from services.prompt_library_service import prompt_library_service
from services.version import get_app_version

BASE_DIR = Path(__file__).resolve().parents[1]
WEB_DIST_DIR = BASE_DIR / "web_dist"


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    model: str = "auto"
    n: int = Field(default=1, ge=1, le=4)
    size: str = DEFAULT_IMAGE_SIZE
    response_format: str = "b64_json"
    history_disabled: bool = True
    delivery_mode: str = "direct"
    upstream_endpoint: str = DEFAULT_IMAGE_UPSTREAM_ENDPOINT
    response_canvas: str = DEFAULT_RESPONSE_CANVAS
    response_resolution: str = DEFAULT_RESPONSE_RESOLUTION
    response_quality: str = DEFAULT_RESPONSE_QUALITY
    response_output_format: str = DEFAULT_RESPONSE_OUTPUT_FORMAT
    response_output_compression: int | None = DEFAULT_RESPONSE_OUTPUT_COMPRESSION
    response_moderation: str = DEFAULT_RESPONSE_MODERATION
    response_main_model: str = DEFAULT_RESPONSE_MAIN_MODEL
    response_tool_model: str = DEFAULT_RESPONSE_TOOL_MODEL
    response_instructions: str = DEFAULT_RESPONSE_INSTRUCTIONS
    response_reasoning_effort: str = DEFAULT_RESPONSE_REASONING_EFFORT
    response_reasoning_summary: str = DEFAULT_RESPONSE_REASONING_SUMMARY
    response_parallel_tool_calls: bool = DEFAULT_RESPONSE_PARALLEL_TOOL_CALLS
    response_include_encrypted_reasoning: bool = DEFAULT_RESPONSE_INCLUDE_ENCRYPTED_REASONING
    response_store: bool = DEFAULT_RESPONSE_STORE
    response_partial_images: int = DEFAULT_RESPONSE_PARTIAL_IMAGES
    response_tool_choice: str = DEFAULT_RESPONSE_TOOL_CHOICE


class AccountCreateRequest(BaseModel):
    tokens: list[str] = Field(default_factory=list)


class AccountDeleteRequest(BaseModel):
    tokens: list[str] = Field(default_factory=list)


class AccountRefreshRequest(BaseModel):
    access_tokens: list[str] = Field(default_factory=list)


class AccountUpdateRequest(BaseModel):
    access_token: str = Field(default="")
    type: str | None = None
    status: str | None = None
    quota: int | None = None


class LocalLoginRequest(BaseModel):
    username: str | None = None
    password: str | None = None


class LocalRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)


class UserQuotaUpdateRequest(BaseModel):
    quota: int | None = None
    delta: int | None = None


class AdminUserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    quota: int = Field(default=0, ge=0)
    allow_direct_mode: bool = True
    allow_image_bed_mode: bool = True
    allow_view_image_failure_log: bool = False


class UserImageModeUpdateRequest(BaseModel):
    allow_direct_mode: bool = True
    allow_image_bed_mode: bool = True
    allow_view_image_failure_log: bool = False


class ImageJobCreateRequest(BaseModel):
    conversation_id: str = ""
    conversation_title: str = ""
    prompt: str = Field(..., min_length=1)
    mode: str = "generate"
    model: str = "auto"
    n: int = Field(default=1, ge=1, le=4)
    size: str = DEFAULT_IMAGE_SIZE
    upstream_endpoint: str = DEFAULT_IMAGE_UPSTREAM_ENDPOINT
    response_canvas: str = DEFAULT_RESPONSE_CANVAS
    response_resolution: str = DEFAULT_RESPONSE_RESOLUTION
    response_quality: str = DEFAULT_RESPONSE_QUALITY
    response_output_format: str = DEFAULT_RESPONSE_OUTPUT_FORMAT
    response_output_compression: int | None = DEFAULT_RESPONSE_OUTPUT_COMPRESSION
    response_moderation: str = DEFAULT_RESPONSE_MODERATION
    response_main_model: str = DEFAULT_RESPONSE_MAIN_MODEL
    response_tool_model: str = DEFAULT_RESPONSE_TOOL_MODEL
    response_instructions: str = DEFAULT_RESPONSE_INSTRUCTIONS
    response_reasoning_effort: str = DEFAULT_RESPONSE_REASONING_EFFORT
    response_reasoning_summary: str = DEFAULT_RESPONSE_REASONING_SUMMARY
    response_parallel_tool_calls: bool = DEFAULT_RESPONSE_PARALLEL_TOOL_CALLS
    response_include_encrypted_reasoning: bool = DEFAULT_RESPONSE_INCLUDE_ENCRYPTED_REASONING
    response_store: bool = DEFAULT_RESPONSE_STORE
    response_partial_images: int = DEFAULT_RESPONSE_PARTIAL_IMAGES
    response_tool_choice: str = DEFAULT_RESPONSE_TOOL_CHOICE


class RedeemKeyGenerateRequest(BaseModel):
    amount: int = Field(..., ge=1)
    quantity: int = Field(default=1, ge=1, le=1000)


class UserRedeemRequest(BaseModel):
    keys: list[str] = Field(default_factory=list)
    content: str | None = None


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: str | None = None
    prompt: str | None = None
    n: int | None = None
    stream: bool | None = None
    modalities: list[str] | None = None
    messages: list[dict[str, object]] | None = None


class ResponseCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: str | None = None
    input: object | None = None
    tools: list[dict[str, object]] | None = None
    tool_choice: object | None = None
    stream: bool | None = None


class CPAPoolCreateRequest(BaseModel):
    name: str = ""
    base_url: str = ""
    secret_key: str = ""


class CPAPoolUpdateRequest(BaseModel):
    name: str | None = None
    base_url: str | None = None
    secret_key: str | None = None


class CPAImportRequest(BaseModel):
    names: list[str] = Field(default_factory=list)


class SettingsUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")


class CosConfigRequest(BaseModel):
    Region: str = ""
    SecretId: str = ""
    SecretKey: str = ""
    Bucket: str = ""


class Sub2APIServerCreateRequest(BaseModel):
    name: str = ""
    base_url: str = ""
    email: str = ""
    password: str = ""
    api_key: str = ""
    group_id: str = ""


class Sub2APIServerUpdateRequest(BaseModel):
    name: str | None = None
    base_url: str | None = None
    email: str | None = None
    password: str | None = None
    api_key: str | None = None
    group_id: str | None = None


class Sub2APIImportRequest(BaseModel):
    account_ids: list[str] = Field(default_factory=list)


class ProxyUpdateRequest(BaseModel):
    enabled: bool | None = None
    url: str | None = None


class ProxyTestRequest(BaseModel):
    url: str = ""


class PromptLibraryCreateRequest(BaseModel):
    title: str = ""
    prompt: str = Field(..., min_length=1)
    tags: list[str] = Field(default_factory=list)


class PromptLibraryUpdateRequest(BaseModel):
    title: str = ""
    prompt: str = Field(..., min_length=1)
    tags: list[str] = Field(default_factory=list)


def build_model_item(model_id: str) -> dict[str, object]:
    return {
        "id": model_id,
        "object": "model",
        "created": 0,
        "owned_by": "chatgpt2api",
    }


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


def sanitize_cpa_pool(pool: dict[str, object] | None) -> dict[str, object] | None:
    if not isinstance(pool, dict):
        return None
    return {
        key: value
        for key, value in pool.items()
        if key != "secret_key"
    }


def sanitize_cpa_pools(pools: list[dict[str, object]]) -> list[dict[str, object]]:
    return [sanitized for pool in pools if (sanitized := sanitize_cpa_pool(pool)) is not None]


def _extract_redeem_keys(body: UserRedeemRequest) -> list[str]:
    keys: list[str] = []
    keys.extend(str(item or "").strip() for item in body.keys)
    content = str(body.content or "")
    if content:
        for line in content.replace("\r\n", "\n").split("\n"):
            value = line.strip()
            if value:
                keys.append(value)
    seen = set()
    deduped: list[str] = []
    for key in keys:
        if key and key not in seen:
            seen.add(key)
            deduped.append(key)
    return deduped


_SUB2API_HIDDEN_FIELDS = {"password", "api_key"}


def sanitize_sub2api_server(server: dict[str, object] | None) -> dict[str, object] | None:
    if not isinstance(server, dict):
        return None
    sanitized = {key: value for key, value in server.items() if key not in _SUB2API_HIDDEN_FIELDS}
    sanitized["has_api_key"] = bool(str(server.get("api_key") or "").strip())
    return sanitized


def sanitize_sub2api_servers(servers: list[dict[str, object]]) -> list[dict[str, object]]:
    return [sanitized for server in servers if (sanitized := sanitize_sub2api_server(server)) is not None]


def _count_generated_images(result: Mapping[str, object]) -> int:
    data = result.get("data")
    if not isinstance(data, list):
        return 0
    return sum(
        1
        for item in data
        if isinstance(item, dict) and (str(item.get("b64_json") or "").strip() or str(item.get("url") or "").strip())
    )


def _get_allowed_delivery_modes(context: AuthContext) -> list[str]:
    if context.is_admin:
        return ["direct", "image_bed"] if is_cos_storage_ready() else ["direct"]
    user = context.user or {}
    allowed_modes: list[str] = []
    if bool(user.get("allow_direct_mode", True)):
        allowed_modes.append("direct")
    if bool(user.get("allow_image_bed_mode", True)) and is_cos_storage_ready():
        allowed_modes.append("image_bed")
    return allowed_modes or ["direct"]


def _resolve_delivery_mode(context: AuthContext, requested_mode: object) -> str:
    normalized_mode = str(requested_mode or "direct").strip() or "direct"
    if normalized_mode not in {"direct", "image_bed"}:
        raise HTTPException(status_code=400, detail={"error": "delivery_mode is invalid"})
    allowed_modes = _get_allowed_delivery_modes(context)
    if normalized_mode not in allowed_modes:
        raise HTTPException(status_code=403, detail={"error": "delivery mode is not allowed"})
    return normalized_mode


def _ensure_at_least_one_user_image_mode(allow_direct_mode: bool, allow_image_bed_mode: bool) -> None:
    if allow_direct_mode or allow_image_bed_mode:
        return
    raise HTTPException(status_code=400, detail={"error": "at least one image mode must be enabled"})


def _get_register_user_image_mode_defaults() -> tuple[bool, bool]:
    allow_direct_mode = bool(config.data.get("register_user_allow_direct_mode", True))
    allow_image_bed_mode = bool(config.data.get("register_user_allow_image_bed_mode", True))
    if not allow_direct_mode and not allow_image_bed_mode:
        return True, False
    return allow_direct_mode, allow_image_bed_mode


def _ensure_user_quota_or_raise(context: AuthContext, required: int) -> dict[str, object] | None:
    if context.is_admin:
        return None
    user = context.user or {}
    quota = max(0, _safe_int(user.get("quota"), 0))
    if quota < required:
        raise HTTPException(status_code=403, detail={"error": "insufficient local quota"})
    return user


def _can_view_image_failure_log(context: AuthContext) -> bool:
    if context.is_admin:
        return True
    user = context.user or {}
    return bool(user.get("allow_view_image_failure_log", False))


def _build_image_failure_log(
    exc: Exception,
    *,
    stage: str,
    mode: str,
    delivery_mode: str,
    upstream_endpoint: str,
    model: str,
    count: int,
    size: str | None = None,
    reference_image_count: int | None = None,
) -> str:
    sections = [
        "[image-failure]",
        f"stage={stage}",
        f"mode={mode}",
        f"delivery_mode={delivery_mode}",
        f"upstream_endpoint={upstream_endpoint}",
        f"model={model}",
        f"count={count}",
    ]
    if size:
        sections.append(f"size={size}")
    if reference_image_count is not None:
        sections.append(f"reference_image_count={reference_image_count}")
    sections.extend(
        part
        for part in [
            f"error={str(exc)}",
            getattr(exc, "failure_log", None),
            "traceback:\n" + traceback.format_exc(),
        ]
        if part
    )
    return "\n\n".join(sections)


def _consume_user_quota_after_success(context: AuthContext, generated_count: int) -> dict[str, object] | None:
    if context.is_admin:
        return None
    if generated_count <= 0:
        return context.user
    user = context.user or {}
    user_id = str(user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail={"error": "authorization is invalid"})
    updated_user = user_service.consume_user_quota(user_id, generated_count)
    if updated_user is None:
        raise HTTPException(status_code=409, detail={"error": "failed to deduct local quota"})
    return updated_user


def resolve_image_base_url(request: Request) -> str:
    return config.base_url or f"{request.url.scheme}://{request.headers.get('host', request.url.netloc)}"


def start_limited_account_watcher(stop_event: Event) -> Thread:
    interval_seconds = config.refresh_account_interval_minute * 60

    def worker() -> None:
        while not stop_event.is_set():
            try:
                limited_tokens = account_service.list_limited_tokens()
                if limited_tokens:
                    print(f"[account-limited-watcher] checking {len(limited_tokens)} limited accounts")
                    account_service.refresh_accounts(limited_tokens)
            except Exception as exc:
                print(f"[account-limited-watcher] fail {exc}")
            stop_event.wait(interval_seconds)

    thread = Thread(target=worker, name="limited-account-watcher", daemon=True)
    thread.start()
    return thread


def resolve_web_asset(requested_path: str) -> Path | None:
    if not WEB_DIST_DIR.exists():
        return None

    clean_path = requested_path.strip("/")
    if not clean_path:
        candidates = [WEB_DIST_DIR / "index.html"]
    else:
        relative_path = Path(clean_path)
        candidates = [
            WEB_DIST_DIR / relative_path,
            WEB_DIST_DIR / relative_path / "index.html",
            WEB_DIST_DIR / f"{clean_path}.html",
        ]

    for candidate in candidates:
        try:
            candidate.relative_to(WEB_DIST_DIR)
        except ValueError:
            continue
        if candidate.is_file():
            return candidate

    return None


def _sanitize_image_job(job: Mapping[str, object], *, include_failure_log: bool = False) -> dict[str, object]:
    result_images = job.get("result_images")
    reference_images = job.get("reference_images")
    response_options = normalize_image_response_options(
        job.get("upstream_endpoint"),
        job.get("response_canvas"),
        job.get("response_resolution"),
        job.get("response_quality"),
        job.get("response_output_format"),
        job.get("response_output_compression"),
        job.get("response_moderation"),
        job.get("response_main_model"),
        job.get("response_tool_model"),
        job.get("response_instructions"),
        job.get("response_reasoning_effort"),
        job.get("response_reasoning_summary"),
        job.get("response_parallel_tool_calls"),
        job.get("response_include_encrypted_reasoning"),
        job.get("response_store"),
        job.get("response_partial_images"),
        job.get("response_tool_choice"),
    )
    sanitized_result_images = []
    if isinstance(result_images, list):
        for item in result_images:
            if not isinstance(item, dict):
                continue
            object_key = str(item.get("object_key") or "").strip()
            image_url = str(item.get("url") or "").strip()
            if object_key:
                if not is_project_image_object_key(object_key):
                    continue
                try:
                    image_url = build_signed_download_url(object_key)
                    url_expires_at = get_image_url_expires_at_iso()
                except Exception:
                    url_expires_at = str(item.get("url_expires_at") or "").strip()
            else:
                url_expires_at = str(item.get("url_expires_at") or "").strip()
            if not image_url:
                continue
            sanitized_item = {
                "id": str(item.get("id") or "").strip(),
                "url": image_url,
                "storage": "image_bed",
            }
            if object_key:
                sanitized_item["object_key"] = object_key
            if url_expires_at:
                sanitized_item["url_expires_at"] = url_expires_at
            sanitized_result_images.append(sanitized_item)
    return {
        "id": str(job.get("id") or "").strip(),
        "conversation_id": str(job.get("conversation_id") or "").strip(),
        "conversation_title": str(job.get("conversation_title") or "").strip(),
        "prompt": str(job.get("prompt") or "").strip(),
        "mode": str(job.get("mode") or "generate").strip() or "generate",
        "model": str(job.get("model") or "auto").strip() or "auto",
        "count": _safe_int(job.get("count"), 1),
        "size": normalize_image_size(job.get("size")),
        "upstream_endpoint": response_options.upstream_endpoint,
        "response_canvas": response_options.canvas,
        "response_resolution": response_options.resolution,
        "response_quality": response_options.quality,
        "response_output_format": response_options.output_format,
        "response_output_compression": response_options.output_compression,
        "response_moderation": response_options.moderation,
        "response_main_model": response_options.main_model,
        "response_tool_model": response_options.tool_model,
        "response_instructions": response_options.instructions,
        "response_reasoning_effort": response_options.reasoning_effort,
        "response_reasoning_summary": response_options.reasoning_summary,
        "response_parallel_tool_calls": response_options.parallel_tool_calls,
        "response_include_encrypted_reasoning": response_options.include_encrypted_reasoning,
        "response_store": response_options.store,
        "response_partial_images": response_options.partial_images,
        "response_tool_choice": response_options.tool_choice,
        "status": str(job.get("status") or "queued").strip() or "queued",
        "delivery_mode": "image_bed",
        "created_at": str(job.get("created_at") or "").strip(),
        "updated_at": str(job.get("updated_at") or "").strip(),
        "error": str(job.get("error") or "").strip() or None,
        "failure_log": (str(job.get("failure_log") or "").strip() or None) if include_failure_log else None,
        "result_images": sanitized_result_images,
        "reference_images": [
            {"name": str(item.get("name") or "").strip(), "type": str(item.get("type") or "image/png").strip() or "image/png"}
            for item in reference_images
            if isinstance(item, dict)
        ] if isinstance(reference_images, list) else [],
}


def _resolve_image_job_owner(context: AuthContext) -> tuple[str, str]:
    if context.is_admin:
        return "admin", "admin"
    user = context.user or {}
    user_id = str(user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail={"error": "authorization is invalid"})
    return "user", user_id


def _resolve_prompt_owner(context: AuthContext) -> tuple[str, str, str]:
    if context.is_admin:
        return "admin", "admin", "admin"
    user = context.user or {}
    user_id = str(user.get("id") or "").strip()
    username = str(user.get("username") or "").strip()
    if not user_id or not username:
        raise HTTPException(status_code=401, detail={"error": "authorization is invalid"})
    return "user", user_id, username


def _can_manage_prompt(context: AuthContext, item: Mapping[str, object]) -> bool:
    if context.is_admin:
        return True
    user = context.user or {}
    return (
        str(item.get("owner_role") or "") == "user"
        and str(item.get("owner_id") or "") == str(user.get("id") or "").strip()
    )


def _sanitize_prompt_library_item(context: AuthContext, item: Mapping[str, object]) -> dict[str, object]:
    raw_tags = item.get("tags")
    return {
        "id": str(item.get("id") or "").strip(),
        "title": str(item.get("title") or "").strip(),
        "prompt": str(item.get("prompt") or "").strip(),
        "tags": [str(tag).strip() for tag in raw_tags if str(tag).strip()] if isinstance(raw_tags, list) else [],
        "owner_role": str(item.get("owner_role") or "").strip(),
        "owner_id": str(item.get("owner_id") or "").strip(),
        "owner_name": str(item.get("owner_name") or "").strip(),
        "created_at": str(item.get("created_at") or "").strip(),
        "updated_at": str(item.get("updated_at") or "").strip(),
        "can_edit": _can_manage_prompt(context, item),
        "can_delete": _can_manage_prompt(context, item),
    }


def create_app() -> FastAPI:
    chatgpt_service = ChatGPTService(account_service)
    app_version = get_app_version()

    def process_image_bed_job(job_id: str) -> None:
        job = image_job_service.get_job(job_id)
        if job is None:
            return
        image_job_service.update_job_status(job_id, status="running")
        model = str(job.get("model") or "auto").strip() or "auto"
        count = max(1, _safe_int(job.get("count"), 1))
        size = normalize_image_size(job.get("size"))
        response_options = normalize_image_response_options(
            job.get("upstream_endpoint"),
            job.get("response_canvas"),
            job.get("response_resolution"),
            job.get("response_quality"),
            job.get("response_output_format"),
            job.get("response_output_compression"),
            job.get("response_moderation"),
            job.get("response_main_model"),
            job.get("response_tool_model"),
            job.get("response_instructions"),
            job.get("response_reasoning_effort"),
            job.get("response_reasoning_summary"),
            job.get("response_parallel_tool_calls"),
            job.get("response_include_encrypted_reasoning"),
            job.get("response_store"),
            job.get("response_partial_images"),
            job.get("response_tool_choice"),
        )
        mode = str(job.get("mode") or "generate").strip()
        try:
            prompt = str(job.get("prompt") or "").strip()
            if mode == "edit":
                files = image_job_service.build_processor_files(job)
                result = chatgpt_service.edit_with_pool(
                    prompt,
                    files,
                    model,
                    count,
                    "b64_json",
                    None,
                    "image_bed",
                    size,
                    response_options,
                )
            else:
                result = chatgpt_service.generate_with_pool(
                    prompt,
                    model,
                    count,
                    "b64_json",
                    None,
                    "image_bed",
                    size,
                    response_options,
                )
            data = result.get("data") if isinstance(result, dict) else []
            result_images = []
            if isinstance(data, list):
                for index, item in enumerate(data, start=1):
                    if not isinstance(item, dict):
                        continue
                    object_key = str(item.get("object_key") or "").strip()
                    image_url = str(item.get("url") or "").strip()
                    if not object_key and not image_url:
                        continue
                    result_item = {"id": f"{job_id}-{index}", "storage": "image_bed"}
                    if object_key:
                        result_item["object_key"] = object_key
                    if image_url:
                        result_item["url"] = image_url
                    if object_key:
                        result_item["url_expires_at"] = get_image_url_expires_at_iso()
                    result_images.append(result_item)
            if not result_images:
                raise RuntimeError("未返回图床图片")
            owner_role = str(job.get("owner_role") or "user").strip() or "user"
            user_id = str(job.get("user_id") or "").strip()
            if owner_role != "admin" and user_id:
                updated_user = user_service.consume_user_quota(user_id, len(result_images))
                if updated_user is None:
                    raise RuntimeError("failed to deduct local quota")
            image_job_service.update_job_status(job_id, status="success", result_images=result_images, failure_log=None)
        except Exception as exc:
            image_job_service.update_job_status(
                job_id,
                status="error",
                error=str(exc),
                failure_log=_build_image_failure_log(
                    exc,
                    stage="async_job",
                    mode=mode,
                    delivery_mode="image_bed",
                    upstream_endpoint=response_options.upstream_endpoint,
                    model=model,
                    count=count,
                    size=size,
                    reference_image_count=len(image_job_service.build_processor_files(job)) if mode == "edit" else 0,
                ),
            )
        finally:
            image_job_service.cleanup_job_inputs(job_id)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        stop_event = Event()
        thread = start_limited_account_watcher(stop_event)
        for queued_job in image_job_service.list_unfinished_jobs():
            image_job_service.dispatch_job(str(queued_job.get("id") or ""), process_image_bed_job)
        try:
            yield
        finally:
            stop_event.set()
            thread.join(timeout=1)

    app = FastAPI(title="chatgpt2api", version=app_version, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    router = APIRouter()

    @router.get("/v1/models")
    async def list_models():
        return {
            "object": "list",
            "data": [
                build_model_item("gpt-image-1"),
                build_model_item("gpt-image-2"),
            ],
        }

    @router.post("/auth/login")
    async def login(body: LocalLoginRequest | None = None, authorization: str | None = Header(default=None)):
        if auth_service.login_admin(authorization):
            return {"ok": True, "role": "admin", "version": app_version}

        username = str((body.username if body else "") or "").strip()
        password = str((body.password if body else "") or "")
        user = user_service.authenticate_user(username, password)
        if user is None:
            raise HTTPException(status_code=401, detail={"error": "username or password is invalid"})
        token = user_service.create_session(username)
        authed_user = user_service.get_user_by_username(username)
        return {"ok": True, "role": "user", "token": token, "user": authed_user, "version": app_version}

    @router.post("/auth/register")
    async def register(body: LocalRegisterRequest):
        allow_direct_mode, allow_image_bed_mode = _get_register_user_image_mode_defaults()
        try:
            user = user_service.register_user(
                body.username,
                body.password,
                quota=0,
                allow_direct_mode=allow_direct_mode,
                allow_image_bed_mode=allow_image_bed_mode,
            )
        except ValueError as exc:
            message = str(exc)
            status = 409 if "already exists" in message else 400
            raise HTTPException(status_code=status, detail={"error": message}) from exc
        token = user_service.create_session(body.username)
        return {"ok": True, "role": "user", "token": token, "user": user}

    @router.get("/auth/me")
    async def me(authorization: str | None = Header(default=None)):
        context = auth_service.require_authenticated(authorization)
        if context.is_admin:
            return {"role": "admin", "version": app_version, "image_delivery_modes": _get_allowed_delivery_modes(context)}
        return {"role": "user", "user": context.user, "image_delivery_modes": _get_allowed_delivery_modes(context)}

    @router.post("/auth/redeem")
    async def redeem(body: UserRedeemRequest, authorization: str | None = Header(default=None)):
        context = auth_service.require_user(authorization)
        user = context.user or {}
        username = str(user.get("username") or "").strip()
        if not username:
            raise HTTPException(status_code=401, detail={"error": "authorization is invalid"})
        keys = _extract_redeem_keys(body)
        try:
            result = user_service.redeem_keys(username, keys)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        return result

    @router.get("/version")
    async def get_version():
        return {"version": app_version}

    @router.get("/api/settings")
    async def get_settings(authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        return {"config": config.get()}

    @router.get("/api/cos-config")
    async def get_cos_config(authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        loaded = load_cos_config()
        project_image_count = 0
        if loaded:
            try:
                project_image_count = await run_in_threadpool(count_project_images)
            except Exception:
                project_image_count = 0
        return {
            "config": loaded.to_dict() if loaded else {"Region": "", "SecretId": "", "SecretKey": "", "Bucket": ""},
            "project_image_count": project_image_count,
            "ready": loaded is not None,
        }

    @router.post("/api/cos-config")
    async def update_cos_config(body: CosConfigRequest, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        try:
            saved = save_cos_config(body.model_dump(mode="python"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        return {"config": saved.to_dict(), "ready": True}

    @router.post("/api/cos-config/test")
    async def test_cos_config(authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        try:
            result = await run_in_threadpool(test_cos_connection)
            image_count = await run_in_threadpool(count_project_images)
        except Exception as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc
        return {"result": {**result, "project_image_count": image_count}}

    @router.post("/api/settings")
    async def save_settings(
            body: SettingsUpdateRequest,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        return {"config": config.update(body.model_dump(mode="python"))}

    @router.get("/api/accounts")
    async def get_accounts(authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        return {"items": account_service.list_accounts()}

    @router.post("/api/accounts")
    async def create_accounts(body: AccountCreateRequest, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        tokens = [str(token or "").strip() for token in body.tokens if str(token or "").strip()]
        if not tokens:
            raise HTTPException(status_code=400, detail={"error": "tokens is required"})
        result = account_service.add_accounts(tokens)
        refresh_result = account_service.refresh_accounts(tokens)
        return {
            **result,
            "refreshed": refresh_result.get("refreshed", 0),
            "errors": refresh_result.get("errors", []),
            "items": refresh_result.get("items", result.get("items", [])),
        }

    @router.delete("/api/accounts")
    async def delete_accounts(body: AccountDeleteRequest, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        tokens = [str(token or "").strip() for token in body.tokens if str(token or "").strip()]
        if not tokens:
            raise HTTPException(status_code=400, detail={"error": "tokens is required"})
        return account_service.delete_accounts(tokens)

    @router.post("/api/accounts/refresh")
    async def refresh_accounts(body: AccountRefreshRequest, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        access_tokens = [str(token or "").strip() for token in body.access_tokens if str(token or "").strip()]
        if not access_tokens:
            access_tokens = account_service.list_tokens()
        if not access_tokens:
            raise HTTPException(status_code=400, detail={"error": "access_tokens is required"})
        return account_service.refresh_accounts(access_tokens)

    @router.post("/api/accounts/update")
    async def update_account(body: AccountUpdateRequest, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        access_token = str(body.access_token or "").strip()
        if not access_token:
            raise HTTPException(status_code=400, detail={"error": "access_token is required"})

        updates = {
            key: value
            for key, value in {
                "type": body.type,
                "status": body.status,
                "quota": body.quota,
            }.items()
            if value is not None
        }
        if not updates:
            raise HTTPException(status_code=400, detail={"error": "no updates provided"})

        account = account_service.update_account(access_token, updates)
        if account is None:
            raise HTTPException(status_code=404, detail={"error": "account not found"})
        return {"item": account, "items": account_service.list_accounts()}

    @router.post("/v1/images/generations")
    async def generate_images(
            body: ImageGenerationRequest,
            request: Request,
            authorization: str | None = Header(default=None)
    ):
        context = auth_service.require_authenticated(authorization)
        _ensure_user_quota_or_raise(context, body.n)
        base_url = resolve_image_base_url(request)
        delivery_mode = _resolve_delivery_mode(context, body.delivery_mode)
        response_options = normalize_image_response_options(
            body.upstream_endpoint,
            body.response_canvas,
            body.response_resolution,
            body.response_quality,
            body.response_output_format,
            body.response_output_compression,
            body.response_moderation,
            body.response_main_model,
            body.response_tool_model,
            body.response_instructions,
            body.response_reasoning_effort,
            body.response_reasoning_summary,
            body.response_parallel_tool_calls,
            body.response_include_encrypted_reasoning,
            body.response_store,
            body.response_partial_images,
            body.response_tool_choice,
        )
        try:
            result = await run_in_threadpool(
                chatgpt_service.generate_with_pool,
                body.prompt,
                body.model,
                body.n,
                body.response_format,
                base_url,
                delivery_mode,
                normalize_image_size(body.size),
                response_options,
            )
        except ImageGenerationError as exc:
            detail = {"error": str(exc)}
            if _can_view_image_failure_log(context):
                detail["failure_log"] = _build_image_failure_log(
                    exc,
                    stage="direct_request",
                    mode="generate",
                    delivery_mode=delivery_mode,
                    upstream_endpoint=response_options.upstream_endpoint,
                    model=body.model,
                    count=body.n,
                    size=normalize_image_size(body.size),
                )
            raise HTTPException(status_code=502, detail=detail) from exc
        generated_count = _count_generated_images(result)
        updated_user = _consume_user_quota_after_success(context, generated_count)
        if updated_user is not None:
            return {**result, "user": updated_user}
        return result

    @router.post("/v1/images/edits")
    async def edit_images(
            request: Request,
            authorization: str | None = Header(default=None),
            image: list[UploadFile] | None = File(default=None),
            image_list: list[UploadFile] | None = File(default=None, alias="image[]"),
            prompt: str = Form(...),
            model: str = Form(default="gpt-image-1"),
            n: int = Form(default=1),
            response_format: str = Form(default="b64_json"),
            delivery_mode: str = Form(default="direct"),
            size: str = Form(default=DEFAULT_IMAGE_SIZE),
            upstream_endpoint: str = Form(default=DEFAULT_IMAGE_UPSTREAM_ENDPOINT),
            response_canvas: str = Form(default=DEFAULT_RESPONSE_CANVAS),
            response_resolution: str = Form(default=DEFAULT_RESPONSE_RESOLUTION),
            response_quality: str = Form(default=DEFAULT_RESPONSE_QUALITY),
            response_output_format: str = Form(default=DEFAULT_RESPONSE_OUTPUT_FORMAT),
            response_output_compression: int | None = Form(default=DEFAULT_RESPONSE_OUTPUT_COMPRESSION),
            response_moderation: str = Form(default=DEFAULT_RESPONSE_MODERATION),
            response_main_model: str = Form(default=DEFAULT_RESPONSE_MAIN_MODEL),
            response_tool_model: str = Form(default=DEFAULT_RESPONSE_TOOL_MODEL),
            response_instructions: str = Form(default=DEFAULT_RESPONSE_INSTRUCTIONS),
            response_reasoning_effort: str = Form(default=DEFAULT_RESPONSE_REASONING_EFFORT),
            response_reasoning_summary: str = Form(default=DEFAULT_RESPONSE_REASONING_SUMMARY),
            response_parallel_tool_calls: bool = Form(default=DEFAULT_RESPONSE_PARALLEL_TOOL_CALLS),
            response_include_encrypted_reasoning: bool = Form(default=DEFAULT_RESPONSE_INCLUDE_ENCRYPTED_REASONING),
            response_store: bool = Form(default=DEFAULT_RESPONSE_STORE),
            response_partial_images: int = Form(default=DEFAULT_RESPONSE_PARTIAL_IMAGES),
            response_tool_choice: str = Form(default=DEFAULT_RESPONSE_TOOL_CHOICE),
    ):
        context = auth_service.require_authenticated(authorization)
        if n < 1 or n > 4:
            raise HTTPException(status_code=400, detail={"error": "n must be between 1 and 4"})
        _ensure_user_quota_or_raise(context, n)
        normalized_delivery_mode = _resolve_delivery_mode(context, delivery_mode)
        response_options = normalize_image_response_options(
            upstream_endpoint,
            response_canvas,
            response_resolution,
            response_quality,
            response_output_format,
            response_output_compression,
            response_moderation,
            response_main_model,
            response_tool_model,
            response_instructions,
            response_reasoning_effort,
            response_reasoning_summary,
            response_parallel_tool_calls,
            response_include_encrypted_reasoning,
            response_store,
            response_partial_images,
            response_tool_choice,
        )

        uploads = [*(image or []), *(image_list or [])]
        if not uploads:
            raise HTTPException(status_code=400, detail={"error": "image file is required"})

        base_url = resolve_image_base_url(request)

        images: list[tuple[bytes, str, str]] = []
        for upload in uploads:
            image_data = await upload.read()
            if not image_data:
                raise HTTPException(status_code=400, detail={"error": "image file is empty"})

            file_name = upload.filename or "image.png"
            mime_type = upload.content_type or "image/png"
            images.append((image_data, file_name, mime_type))

        try:
            result = await run_in_threadpool(
                chatgpt_service.edit_with_pool,
                prompt,
                images,
                model,
                n,
                response_format,
                base_url,
                normalized_delivery_mode,
                normalize_image_size(size),
                response_options,
            )
        except ImageGenerationError as exc:
            detail = {"error": str(exc)}
            if _can_view_image_failure_log(context):
                detail["failure_log"] = _build_image_failure_log(
                    exc,
                    stage="direct_request",
                    mode="edit",
                    delivery_mode=normalized_delivery_mode,
                    upstream_endpoint=response_options.upstream_endpoint,
                    model=model,
                    count=n,
                    size=normalize_image_size(size),
                    reference_image_count=len(images),
                )
            raise HTTPException(status_code=502, detail=detail) from exc
        generated_count = _count_generated_images(result)
        updated_user = _consume_user_quota_after_success(context, generated_count)
        if updated_user is not None:
            return {**result, "user": updated_user}
        return result

    @router.get("/api/image-jobs")
    async def list_image_jobs(authorization: str | None = Header(default=None)):
        context = auth_service.require_authenticated(authorization)
        _, owner_id = _resolve_image_job_owner(context)
        items = image_job_service.list_jobs_for_user(owner_id)
        include_failure_log = _can_view_image_failure_log(context)
        return {"items": [_sanitize_image_job(item, include_failure_log=include_failure_log) for item in items]}

    @router.post("/api/image-jobs")
    async def create_image_job(
            authorization: str | None = Header(default=None),
            image: list[UploadFile] | None = File(default=None),
            image_list: list[UploadFile] | None = File(default=None, alias="image[]"),
            prompt: str = Form(...),
            conversation_id: str = Form(default=""),
            conversation_title: str = Form(default=""),
            mode: str = Form(default="generate"),
            model: str = Form(default="auto"),
            n: int = Form(default=1),
            delivery_mode: str = Form(default="image_bed"),
            size: str = Form(default=DEFAULT_IMAGE_SIZE),
            upstream_endpoint: str = Form(default=DEFAULT_IMAGE_UPSTREAM_ENDPOINT),
            response_canvas: str = Form(default=DEFAULT_RESPONSE_CANVAS),
            response_resolution: str = Form(default=DEFAULT_RESPONSE_RESOLUTION),
            response_quality: str = Form(default=DEFAULT_RESPONSE_QUALITY),
            response_output_format: str = Form(default=DEFAULT_RESPONSE_OUTPUT_FORMAT),
            response_output_compression: int | None = Form(default=DEFAULT_RESPONSE_OUTPUT_COMPRESSION),
            response_moderation: str = Form(default=DEFAULT_RESPONSE_MODERATION),
            response_main_model: str = Form(default=DEFAULT_RESPONSE_MAIN_MODEL),
            response_tool_model: str = Form(default=DEFAULT_RESPONSE_TOOL_MODEL),
            response_instructions: str = Form(default=DEFAULT_RESPONSE_INSTRUCTIONS),
            response_reasoning_effort: str = Form(default=DEFAULT_RESPONSE_REASONING_EFFORT),
            response_reasoning_summary: str = Form(default=DEFAULT_RESPONSE_REASONING_SUMMARY),
            response_parallel_tool_calls: bool = Form(default=DEFAULT_RESPONSE_PARALLEL_TOOL_CALLS),
            response_include_encrypted_reasoning: bool = Form(default=DEFAULT_RESPONSE_INCLUDE_ENCRYPTED_REASONING),
            response_store: bool = Form(default=DEFAULT_RESPONSE_STORE),
            response_partial_images: int = Form(default=DEFAULT_RESPONSE_PARTIAL_IMAGES),
            response_tool_choice: str = Form(default=DEFAULT_RESPONSE_TOOL_CHOICE),
    ):
        context = auth_service.require_authenticated(authorization)
        normalized_delivery_mode = _resolve_delivery_mode(context, delivery_mode)
        if normalized_delivery_mode != "image_bed":
            raise HTTPException(status_code=400, detail={"error": "only image_bed mode can create async jobs"})
        if n < 1 or n > 4:
            raise HTTPException(status_code=400, detail={"error": "n must be between 1 and 4"})
        normalized_mode = "edit" if mode == "edit" else "generate"
        response_options = normalize_image_response_options(
            upstream_endpoint,
            response_canvas,
            response_resolution,
            response_quality,
            response_output_format,
            response_output_compression,
            response_moderation,
            response_main_model,
            response_tool_model,
            response_instructions,
            response_reasoning_effort,
            response_reasoning_summary,
            response_parallel_tool_calls,
            response_include_encrypted_reasoning,
            response_store,
            response_partial_images,
            response_tool_choice,
        )
        _ensure_user_quota_or_raise(context, n)
        owner_role, user_id = _resolve_image_job_owner(context)
        user = context.user or {}
        username = "admin" if context.is_admin else str(user.get("username") or "").strip()
        if not user_id or not username:
            raise HTTPException(status_code=401, detail={"error": "authorization is invalid"})

        uploads = [*(image or []), *(image_list or [])]
        saved_reference_images: list[dict[str, object]] = []
        if normalized_mode == "edit":
            if not uploads:
                raise HTTPException(status_code=400, detail={"error": "image file is required"})

        job = image_job_service.create_job(
            owner_role=owner_role,
            user_id=user_id,
            username=username,
            conversation_id=conversation_id,
            conversation_title=conversation_title,
            prompt=prompt,
            mode=normalized_mode,
            model=model,
            count=n,
            size=normalize_image_size(size),
            upstream_endpoint=response_options.upstream_endpoint,
            response_canvas=response_options.canvas,
            response_resolution=response_options.resolution,
            response_quality=response_options.quality,
            response_output_format=response_options.output_format,
            response_output_compression=response_options.output_compression,
            response_moderation=response_options.moderation,
            response_main_model=response_options.main_model,
            response_tool_model=response_options.tool_model,
            response_instructions=response_options.instructions,
            response_reasoning_effort=response_options.reasoning_effort,
            response_reasoning_summary=response_options.reasoning_summary,
            response_parallel_tool_calls=response_options.parallel_tool_calls,
            response_include_encrypted_reasoning=response_options.include_encrypted_reasoning,
            response_store=response_options.store,
            response_partial_images=response_options.partial_images,
            response_tool_choice=response_options.tool_choice,
            reference_images=[],
        )

        if uploads:
            upload_items: list[tuple[bytes, str, str]] = []
            for upload in uploads:
                image_data = await upload.read()
                if not image_data:
                    raise HTTPException(status_code=400, detail={"error": "image file is empty"})
                upload_items.append((image_data, upload.filename or "image.png", upload.content_type or "image/png"))
            saved_reference_images = image_job_service.save_reference_images(str(job.get("id") or ""), upload_items)
            job = image_job_service.update_reference_images(str(job.get("id") or ""), saved_reference_images) or job

        image_job_service.dispatch_job(str(job.get("id") or ""), process_image_bed_job)
        return {"item": _sanitize_image_job(job, include_failure_log=_can_view_image_failure_log(context)), "user": context.user}

    @router.post("/v1/chat/completions")
    async def create_chat_completion(body: ChatCompletionRequest, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        return await run_in_threadpool(chatgpt_service.create_image_completion, body.model_dump(mode="python"))

    @router.post("/v1/responses")
    async def create_response(body: ResponseCreateRequest, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        return await run_in_threadpool(chatgpt_service.create_response, body.model_dump(mode="python"))

    @router.get("/api/users")
    async def list_users(authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        return {"items": user_service.list_users()}

    @router.post("/api/users")
    async def create_user(body: AdminUserCreateRequest, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        _ensure_at_least_one_user_image_mode(body.allow_direct_mode, body.allow_image_bed_mode)
        try:
            user = user_service.register_user(
                body.username,
                body.password,
                quota=body.quota,
                allow_direct_mode=body.allow_direct_mode,
                allow_image_bed_mode=body.allow_image_bed_mode,
                allow_view_image_failure_log=body.allow_view_image_failure_log,
            )
        except ValueError as exc:
            message = str(exc)
            status = 409 if "already exists" in message else 400
            raise HTTPException(status_code=status, detail={"error": message}) from exc
        return {"item": user, "items": user_service.list_users()}

    @router.delete("/api/users/{user_id}")
    async def delete_user(user_id: str, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        if not user_service.delete_user(user_id):
            raise HTTPException(status_code=404, detail={"error": "user not found"})
        return {"items": user_service.list_users()}

    @router.post("/api/users/{user_id}/quota")
    async def update_user_quota(
            user_id: str,
            body: UserQuotaUpdateRequest,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        if body.quota is None and body.delta is None:
            raise HTTPException(status_code=400, detail={"error": "quota or delta is required"})
        if body.quota is not None and body.delta is not None:
            raise HTTPException(status_code=400, detail={"error": "provide quota or delta, not both"})

        if body.quota is not None:
            user = user_service.set_user_quota(user_id, body.quota)
        else:
            user = user_service.add_user_quota(user_id, int(body.delta or 0))
        if user is None:
            raise HTTPException(status_code=404, detail={"error": "user not found"})
        return {"item": user, "items": user_service.list_users()}

    @router.post("/api/users/{user_id}/image-modes")
    async def update_user_image_modes(
            user_id: str,
            body: UserImageModeUpdateRequest,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        _ensure_at_least_one_user_image_mode(body.allow_direct_mode, body.allow_image_bed_mode)
        user = user_service.set_user_image_mode_permissions(
            user_id,
            allow_direct_mode=body.allow_direct_mode,
            allow_image_bed_mode=body.allow_image_bed_mode,
            allow_view_image_failure_log=body.allow_view_image_failure_log,
        )
        if user is None:
            raise HTTPException(status_code=404, detail={"error": "user not found"})
        return {"item": user, "items": user_service.list_users()}

    @router.post("/api/redeem-keys/generate")
    async def generate_redeem_keys(body: RedeemKeyGenerateRequest, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        try:
            items = user_service.generate_redeem_keys(body.amount, body.quantity, created_by="admin")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        return {"items": items}

    @router.get("/api/redeem-keys")
    async def list_redeem_keys(authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        return {"items": user_service.list_redeem_keys()}

    @router.get("/api/image-prompts")
    async def list_image_prompts(
            authorization: str | None = Header(default=None),
            mine: bool = False,
            search: str = "",
    ):
        context = auth_service.require_authenticated(authorization)
        owner_role, owner_id, _ = _resolve_prompt_owner(context)
        items = prompt_library_service.list_prompts(mine_only=mine, owner_role=owner_role, owner_id=owner_id, search=search)
        return {"items": [_sanitize_prompt_library_item(context, item) for item in items]}

    @router.post("/api/image-prompts")
    async def create_image_prompt(body: PromptLibraryCreateRequest, authorization: str | None = Header(default=None)):
        context = auth_service.require_authenticated(authorization)
        owner_role, owner_id, owner_name = _resolve_prompt_owner(context)
        try:
            item = prompt_library_service.create_prompt(
                title=body.title,
                prompt=body.prompt,
                tags=body.tags,
                owner_role=owner_role,
                owner_id=owner_id,
                owner_name=owner_name,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        return {"item": _sanitize_prompt_library_item(context, item)}

    @router.post("/api/image-prompts/{prompt_id}")
    async def update_image_prompt(
            prompt_id: str,
            body: PromptLibraryUpdateRequest,
            authorization: str | None = Header(default=None),
    ):
        context = auth_service.require_authenticated(authorization)
        current = prompt_library_service.get_prompt(prompt_id)
        if current is None:
            raise HTTPException(status_code=404, detail={"error": "prompt not found"})
        if not _can_manage_prompt(context, current):
            raise HTTPException(status_code=403, detail={"error": "forbidden"})
        try:
            item = prompt_library_service.update_prompt(prompt_id, title=body.title, prompt=body.prompt, tags=body.tags)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        if item is None:
            raise HTTPException(status_code=404, detail={"error": "prompt not found"})
        return {"item": _sanitize_prompt_library_item(context, item)}

    @router.delete("/api/image-prompts/{prompt_id}")
    async def delete_image_prompt(prompt_id: str, authorization: str | None = Header(default=None)):
        context = auth_service.require_authenticated(authorization)
        current = prompt_library_service.get_prompt(prompt_id)
        if current is None:
            raise HTTPException(status_code=404, detail={"error": "prompt not found"})
        if not _can_manage_prompt(context, current):
            raise HTTPException(status_code=403, detail={"error": "forbidden"})
        if not prompt_library_service.delete_prompt(prompt_id):
            raise HTTPException(status_code=404, detail={"error": "prompt not found"})
        return {"ok": True}

    # ── CPA multi-pool endpoints ────────────────────────────────────

    @router.get("/api/cpa/pools")
    async def list_cpa_pools(authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        return {"pools": sanitize_cpa_pools(cpa_config.list_pools())}

    @router.post("/api/cpa/pools")
    async def create_cpa_pool(
            body: CPAPoolCreateRequest,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        if not body.base_url.strip():
            raise HTTPException(status_code=400, detail={"error": "base_url is required"})
        if not body.secret_key.strip():
            raise HTTPException(status_code=400, detail={"error": "secret_key is required"})
        pool = cpa_config.add_pool(
            name=body.name,
            base_url=body.base_url,
            secret_key=body.secret_key,
        )
        return {"pool": sanitize_cpa_pool(pool), "pools": sanitize_cpa_pools(cpa_config.list_pools())}

    @router.post("/api/cpa/pools/{pool_id}")
    async def update_cpa_pool(
            pool_id: str,
            body: CPAPoolUpdateRequest,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        pool = cpa_config.update_pool(pool_id, body.model_dump(exclude_none=True))
        if pool is None:
            raise HTTPException(status_code=404, detail={"error": "pool not found"})
        return {"pool": sanitize_cpa_pool(pool), "pools": sanitize_cpa_pools(cpa_config.list_pools())}

    @router.delete("/api/cpa/pools/{pool_id}")
    async def delete_cpa_pool(
            pool_id: str,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        if not cpa_config.delete_pool(pool_id):
            raise HTTPException(status_code=404, detail={"error": "pool not found"})
        return {"pools": sanitize_cpa_pools(cpa_config.list_pools())}

    @router.get("/api/cpa/pools/{pool_id}/files")
    async def cpa_pool_files(
            pool_id: str,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        pool = cpa_config.get_pool(pool_id)
        if pool is None:
            raise HTTPException(status_code=404, detail={"error": "pool not found"})
        files = await run_in_threadpool(list_remote_files, pool)
        return {"pool_id": pool_id, "files": files}

    @router.post("/api/cpa/pools/{pool_id}/import")
    async def cpa_pool_import(
            pool_id: str,
            body: CPAImportRequest,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        pool = cpa_config.get_pool(pool_id)
        if pool is None:
            raise HTTPException(status_code=404, detail={"error": "pool not found"})
        try:
            job = cpa_import_service.start_import(pool, body.names)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        return {"import_job": job}

    @router.get("/api/cpa/pools/{pool_id}/import")
    async def cpa_pool_import_progress(pool_id: str, authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        pool = cpa_config.get_pool(pool_id)
        if pool is None:
            raise HTTPException(status_code=404, detail={"error": "pool not found"})
        return {"import_job": pool.get("import_job")}

    # ── Sub2API endpoints ─────────────────────────────────────────────

    @router.get("/api/sub2api/servers")
    async def list_sub2api_servers(authorization: str | None = Header(default=None)):
        auth_service.require_admin(authorization)
        return {"servers": sanitize_sub2api_servers(sub2api_config.list_servers())}

    @router.post("/api/sub2api/servers")
    async def create_sub2api_server(
            body: Sub2APIServerCreateRequest,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        if not body.base_url.strip():
            raise HTTPException(status_code=400, detail={"error": "base_url is required"})
        has_login = body.email.strip() and body.password.strip()
        has_api_key = bool(body.api_key.strip())
        if not has_login and not has_api_key:
            raise HTTPException(
                status_code=400,
                detail={"error": "email+password or api_key is required"},
            )
        server = sub2api_config.add_server(
            name=body.name,
            base_url=body.base_url,
            email=body.email,
            password=body.password,
            api_key=body.api_key,
            group_id=body.group_id,
        )
        return {
            "server": sanitize_sub2api_server(server),
            "servers": sanitize_sub2api_servers(sub2api_config.list_servers()),
        }

    @router.post("/api/sub2api/servers/{server_id}")
    async def update_sub2api_server(
            server_id: str,
            body: Sub2APIServerUpdateRequest,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        server = sub2api_config.update_server(server_id, body.model_dump(exclude_none=True))
        if server is None:
            raise HTTPException(status_code=404, detail={"error": "server not found"})
        return {
            "server": sanitize_sub2api_server(server),
            "servers": sanitize_sub2api_servers(sub2api_config.list_servers()),
        }

    @router.delete("/api/sub2api/servers/{server_id}")
    async def delete_sub2api_server(
            server_id: str,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        if not sub2api_config.delete_server(server_id):
            raise HTTPException(status_code=404, detail={"error": "server not found"})
        return {"servers": sanitize_sub2api_servers(sub2api_config.list_servers())}

    @router.get("/api/sub2api/servers/{server_id}/groups")
    async def sub2api_server_groups(
            server_id: str,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        server = sub2api_config.get_server(server_id)
        if server is None:
            raise HTTPException(status_code=404, detail={"error": "server not found"})
        try:
            groups = await run_in_threadpool(sub2api_list_remote_groups, server)
        except Exception as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc
        return {"server_id": server_id, "groups": groups}

    @router.get("/api/sub2api/servers/{server_id}/accounts")
    async def sub2api_server_accounts(
            server_id: str,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        server = sub2api_config.get_server(server_id)
        if server is None:
            raise HTTPException(status_code=404, detail={"error": "server not found"})
        try:
            accounts = await run_in_threadpool(sub2api_list_remote_accounts, server)
        except Exception as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc
        return {"server_id": server_id, "accounts": accounts}

    @router.post("/api/sub2api/servers/{server_id}/import")
    async def sub2api_server_import(
            server_id: str,
            body: Sub2APIImportRequest,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        server = sub2api_config.get_server(server_id)
        if server is None:
            raise HTTPException(status_code=404, detail={"error": "server not found"})
        try:
            job = sub2api_import_service.start_import(server, body.account_ids)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        return {"import_job": job}

    @router.get("/api/sub2api/servers/{server_id}/import")
    async def sub2api_server_import_progress(
            server_id: str,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        server = sub2api_config.get_server(server_id)
        if server is None:
            raise HTTPException(status_code=404, detail={"error": "server not found"})
        return {"import_job": server.get("import_job")}

    # ── Upstream proxy endpoints ─────────────────────────────────────

    @router.post("/api/proxy/test")
    async def test_proxy_endpoint(
            body: ProxyTestRequest,
            authorization: str | None = Header(default=None),
    ):
        auth_service.require_admin(authorization)
        candidate = (body.url or "").strip()
        if not candidate:
            candidate = config.get_proxy_settings()
        if not candidate:
            raise HTTPException(status_code=400, detail={"error": "proxy url is required"})
        result = await run_in_threadpool(test_proxy, candidate)
        return {"result": result}

    app.include_router(router)

    # 挂载静态图片目录
    if config.images_dir.exists():
        app.mount("/images", StaticFiles(directory=str(config.images_dir)), name="images")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_web(full_path: str):
        asset = resolve_web_asset(full_path)
        if asset is not None:
            return FileResponse(asset)

        # Static assets (_next/*) must not fallback to HTML — return 404
        if full_path.strip("/").startswith("_next/"):
            raise HTTPException(status_code=404, detail="Not Found")

        fallback = resolve_web_asset("")
        if fallback is None:
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(fallback)

    return app
