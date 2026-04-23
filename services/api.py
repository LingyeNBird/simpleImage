from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from threading import Event, Thread
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
from services.version import get_app_version

BASE_DIR = Path(__file__).resolve().parents[1]
WEB_DIST_DIR = BASE_DIR / "web_dist"


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    model: str = "auto"
    n: int = Field(default=1, ge=1, le=4)
    response_format: str = "b64_json"
    history_disabled: bool = True


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
    return sum(1 for item in data if isinstance(item, dict) and str(item.get("b64_json") or "").strip())


def _ensure_user_quota_or_raise(context: AuthContext, required: int) -> dict[str, object] | None:
    if context.is_admin:
        return None
    user = context.user or {}
    quota = max(0, _safe_int(user.get("quota"), 0))
    if quota < required:
        raise HTTPException(status_code=403, detail={"error": "insufficient local quota"})
    return user


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


def create_app() -> FastAPI:
    chatgpt_service = ChatGPTService(account_service)
    app_version = get_app_version()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        stop_event = Event()
        thread = start_limited_account_watcher(stop_event)
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
        try:
            user = user_service.register_user(body.username, body.password, quota=0)
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
            return {"role": "admin", "version": app_version}
        return {"role": "user", "user": context.user}

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
        try:
            result = await run_in_threadpool(
                chatgpt_service.generate_with_pool, body.prompt, body.model, body.n, body.response_format, base_url
            )
        except ImageGenerationError as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc
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
    ):
        context = auth_service.require_authenticated(authorization)
        if n < 1 or n > 4:
            raise HTTPException(status_code=400, detail={"error": "n must be between 1 and 4"})
        _ensure_user_quota_or_raise(context, n)

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
                chatgpt_service.edit_with_pool, prompt, images, model, n, response_format, base_url
            )
        except ImageGenerationError as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc
        generated_count = _count_generated_images(result)
        updated_user = _consume_user_quota_after_success(context, generated_count)
        if updated_user is not None:
            return {**result, "user": updated_user}
        return result

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
        try:
            user = user_service.register_user(body.username, body.password, quota=body.quota)
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
