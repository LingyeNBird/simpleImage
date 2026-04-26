from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
from pathlib import Path
import secrets
from threading import Lock
from typing import Any
from uuid import uuid4


def _now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _as_int(value: object, default: int = 0) -> int:
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
        return default
    except (TypeError, ValueError):
        return default


def _as_bool(value: object, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return default


@dataclass(frozen=True)
class LocalUserPublic:
    id: str
    username: str
    role: str
    quota: int
    allow_direct_mode: bool
    allow_image_bed_mode: bool
    allow_view_image_failure_log: bool
    created_at: str | None
    updated_at: str | None
    last_login_at: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "quota": self.quota,
            "allow_direct_mode": self.allow_direct_mode,
            "allow_image_bed_mode": self.allow_image_bed_mode,
            "allow_view_image_failure_log": self.allow_view_image_failure_log,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "last_login_at": self.last_login_at,
        }


class UserService:
    def __init__(self, users_file: Path, redeem_keys_file: Path):
        self.users_file = users_file
        self.redeem_keys_file = redeem_keys_file
        self._lock = Lock()
        self._users = self._load_users()
        self._redeem_keys = self._load_redeem_keys()

    @staticmethod
    def _normalize_username(username: Any) -> str:
        return str(username or "").strip().lower()

    @staticmethod
    def _hash_password(password: str, salt_hex: str) -> str:
        salt = bytes.fromhex(salt_hex)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120000)
        return digest.hex()

    def _normalize_user(self, item: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(item, dict):
            return None
        user_id = str(item.get("id") or "").strip() or str(uuid4())
        username = self._normalize_username(item.get("username"))
        password_hash = str(item.get("password_hash") or "").strip()
        password_salt = str(item.get("password_salt") or "").strip()
        if not username or not password_hash or not password_salt:
            return None
        sessions = item.get("sessions")
        if not isinstance(sessions, list):
            sessions = []
        normalized_sessions = []
        for session in sessions:
            if not isinstance(session, dict):
                continue
            token = str(session.get("token") or "").strip()
            if not token:
                continue
            normalized_sessions.append(
                {
                    "token": token,
                    "created_at": str(session.get("created_at") or "").strip() or None,
                    "last_used_at": str(session.get("last_used_at") or "").strip() or None,
                }
            )
        quota = _as_int(item.get("quota"), 0)
        if quota < 0:
            quota = 0
        return {
            "id": user_id,
            "username": username,
            "password_hash": password_hash,
            "password_salt": password_salt,
            "role": "user",
            "quota": quota,
            "allow_direct_mode": _as_bool(item.get("allow_direct_mode"), True),
            "allow_image_bed_mode": _as_bool(item.get("allow_image_bed_mode"), True),
            "allow_view_image_failure_log": _as_bool(item.get("allow_view_image_failure_log"), False),
            "sessions": normalized_sessions,
            "created_at": str(item.get("created_at") or "").strip() or None,
            "updated_at": str(item.get("updated_at") or "").strip() or None,
            "last_login_at": str(item.get("last_login_at") or "").strip() or None,
        }

    def _normalize_redeem_key(self, item: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(item, dict):
            return None
        key = str(item.get("key") or "").strip()
        if not key:
            return None
        amount = _as_int(item.get("amount"), 0)
        if amount <= 0:
            return None
        redeemed_by = self._normalize_username(item.get("redeemed_by")) or None
        return {
            "key": key,
            "amount": amount,
            "created_at": str(item.get("created_at") or "").strip() or None,
            "created_by": str(item.get("created_by") or "").strip() or None,
            "redeemed_by": redeemed_by,
            "redeemed_at": str(item.get("redeemed_at") or "").strip() or None,
        }

    def _load_users(self) -> list[dict[str, Any]]:
        if not self.users_file.exists():
            return []
        try:
            loaded = json.loads(self.users_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        if isinstance(loaded, dict):
            items = loaded.get("users")
        else:
            items = loaded
        if not isinstance(items, list):
            return []
        return [normalized for item in items if (normalized := self._normalize_user(item)) is not None]

    def _load_redeem_keys(self) -> list[dict[str, Any]]:
        if not self.redeem_keys_file.exists():
            return []
        try:
            loaded = json.loads(self.redeem_keys_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        if isinstance(loaded, dict):
            items = loaded.get("items")
        else:
            items = loaded
        if not isinstance(items, list):
            return []
        return [normalized for item in items if (normalized := self._normalize_redeem_key(item)) is not None]

    def _save_users(self) -> None:
        self.users_file.parent.mkdir(parents=True, exist_ok=True)
        self.users_file.write_text(
            json.dumps({"users": self._users}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    def _save_redeem_keys(self) -> None:
        self.redeem_keys_file.parent.mkdir(parents=True, exist_ok=True)
        self.redeem_keys_file.write_text(
            json.dumps({"items": self._redeem_keys}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    @staticmethod
    def _to_public_user(item: dict[str, Any]) -> LocalUserPublic:
        return LocalUserPublic(
            id=str(item.get("id") or ""),
            username=str(item.get("username") or ""),
            role="user",
            quota=max(0, int(item.get("quota") or 0)),
            allow_direct_mode=_as_bool(item.get("allow_direct_mode"), True),
            allow_image_bed_mode=_as_bool(item.get("allow_image_bed_mode"), True),
            allow_view_image_failure_log=_as_bool(item.get("allow_view_image_failure_log"), False),
            created_at=item.get("created_at"),
            updated_at=item.get("updated_at"),
            last_login_at=item.get("last_login_at"),
        )

    def list_users(self) -> list[dict[str, object]]:
        with self._lock:
            return [self._to_public_user(item).to_dict() for item in self._users]

    def get_user_by_id(self, user_id: str) -> dict[str, object] | None:
        normalized_id = str(user_id or "").strip()
        if not normalized_id:
            return None
        with self._lock:
            for user in self._users:
                if str(user.get("id") or "") == normalized_id:
                    return self._to_public_user(user).to_dict()
        return None

    def get_user_by_username(self, username: str) -> dict[str, object] | None:
        normalized_username = self._normalize_username(username)
        if not normalized_username:
            return None
        with self._lock:
            for user in self._users:
                if self._normalize_username(user.get("username")) == normalized_username:
                    return self._to_public_user(user).to_dict()
        return None

    def register_user(
        self,
        username: str,
        password: str,
        quota: int = 0,
        *,
        allow_direct_mode: bool = True,
        allow_image_bed_mode: bool = True,
        allow_view_image_failure_log: bool = False,
    ) -> dict[str, object]:
        normalized_username = self._normalize_username(username)
        plain_password = str(password or "")
        if not normalized_username:
            raise ValueError("username is required")
        if len(normalized_username) < 3:
            raise ValueError("username must be at least 3 characters")
        if len(plain_password) < 6:
            raise ValueError("password must be at least 6 characters")
        clean_quota = max(0, int(quota or 0))

        with self._lock:
            if any(self._normalize_username(item.get("username")) == normalized_username for item in self._users):
                raise ValueError("username already exists")
            now = _now_text()
            salt_hex = secrets.token_bytes(16).hex()
            user = {
                "id": str(uuid4()),
                "username": normalized_username,
                "password_salt": salt_hex,
                "password_hash": self._hash_password(plain_password, salt_hex),
                "role": "user",
                "quota": clean_quota,
                "allow_direct_mode": bool(allow_direct_mode),
                "allow_image_bed_mode": bool(allow_image_bed_mode),
                "allow_view_image_failure_log": bool(allow_view_image_failure_log),
                "sessions": [],
                "created_at": now,
                "updated_at": now,
                "last_login_at": None,
            }
            self._users.append(user)
            self._save_users()
            return self._to_public_user(user).to_dict()

    def authenticate_user(self, username: str, password: str) -> dict[str, object] | None:
        normalized_username = self._normalize_username(username)
        plain_password = str(password or "")
        if not normalized_username or not plain_password:
            return None

        with self._lock:
            for user in self._users:
                if self._normalize_username(user.get("username")) != normalized_username:
                    continue
                expected = self._hash_password(plain_password, str(user.get("password_salt") or ""))
                if not secrets.compare_digest(expected, str(user.get("password_hash") or "")):
                    return None
                return self._to_public_user(user).to_dict()
        return None

    def create_session(self, username: str) -> str:
        normalized_username = self._normalize_username(username)
        if not normalized_username:
            raise ValueError("username is required")
        with self._lock:
            for user in self._users:
                if self._normalize_username(user.get("username")) != normalized_username:
                    continue
                token = f"user_{secrets.token_urlsafe(36)}"
                now = _now_text()
                sessions = user.get("sessions")
                if not isinstance(sessions, list):
                    sessions = []
                sessions.append({"token": token, "created_at": now, "last_used_at": now})
                user["sessions"] = sessions
                user["last_login_at"] = now
                user["updated_at"] = now
                self._save_users()
                return token
        raise ValueError("user not found")

    def get_user_by_session(self, session_token: str) -> dict[str, object] | None:
        token = str(session_token or "").strip()
        if not token:
            return None
        with self._lock:
            now = _now_text()
            for user in self._users:
                sessions = user.get("sessions")
                if not isinstance(sessions, list):
                    continue
                for session in sessions:
                    if not isinstance(session, dict):
                        continue
                    if str(session.get("token") or "").strip() != token:
                        continue
                    session["last_used_at"] = now
                    user["updated_at"] = now
                    self._save_users()
                    return self._to_public_user(user).to_dict()
        return None

    def delete_user(self, user_id: str) -> bool:
        normalized_id = str(user_id or "").strip()
        if not normalized_id:
            return False
        with self._lock:
            before = len(self._users)
            self._users = [user for user in self._users if str(user.get("id") or "") != normalized_id]
            removed = before - len(self._users)
            if removed:
                self._save_users()
            return bool(removed)

    def set_user_quota(self, user_id: str, quota: int) -> dict[str, object] | None:
        normalized_id = str(user_id or "").strip()
        if not normalized_id:
            return None
        safe_quota = max(0, int(quota or 0))
        with self._lock:
            for user in self._users:
                if str(user.get("id") or "") != normalized_id:
                    continue
                user["quota"] = safe_quota
                user["updated_at"] = _now_text()
                self._save_users()
                return self._to_public_user(user).to_dict()
        return None

    def set_user_image_mode_permissions(
        self,
        user_id: str,
        *,
        allow_direct_mode: bool,
        allow_image_bed_mode: bool,
        allow_view_image_failure_log: bool | None = None,
    ) -> dict[str, object] | None:
        normalized_id = str(user_id or "").strip()
        if not normalized_id:
            return None
        with self._lock:
            for user in self._users:
                if str(user.get("id") or "") != normalized_id:
                    continue
                user["allow_direct_mode"] = bool(allow_direct_mode)
                user["allow_image_bed_mode"] = bool(allow_image_bed_mode)
                if allow_view_image_failure_log is not None:
                    user["allow_view_image_failure_log"] = bool(allow_view_image_failure_log)
                user["updated_at"] = _now_text()
                self._save_users()
                return self._to_public_user(user).to_dict()
        return None

    def add_user_quota(self, user_id: str, amount: int) -> dict[str, object] | None:
        normalized_id = str(user_id or "").strip()
        if not normalized_id:
            return None
        clean_amount = int(amount or 0)
        with self._lock:
            for user in self._users:
                if str(user.get("id") or "") != normalized_id:
                    continue
                current = max(0, int(user.get("quota") or 0))
                user["quota"] = max(0, current + clean_amount)
                user["updated_at"] = _now_text()
                self._save_users()
                return self._to_public_user(user).to_dict()
        return None

    def consume_user_quota(self, user_id: str, amount: int) -> dict[str, object] | None:
        normalized_id = str(user_id or "").strip()
        clean_amount = max(0, int(amount or 0))
        if not normalized_id:
            return None
        with self._lock:
            for user in self._users:
                if str(user.get("id") or "") != normalized_id:
                    continue
                current = max(0, int(user.get("quota") or 0))
                if clean_amount > current:
                    return None
                user["quota"] = current - clean_amount
                user["updated_at"] = _now_text()
                self._save_users()
                return self._to_public_user(user).to_dict()
        return None

    def generate_redeem_keys(self, amount: int, quantity: int, created_by: str | None = None) -> list[dict[str, object]]:
        clean_amount = int(amount or 0)
        clean_quantity = int(quantity or 0)
        if clean_amount <= 0:
            raise ValueError("amount must be greater than 0")
        if clean_quantity <= 0:
            raise ValueError("quantity must be greater than 0")
        if clean_quantity > 1000:
            raise ValueError("quantity must be less than or equal to 1000")

        with self._lock:
            now = _now_text()
            generated: list[dict[str, object]] = []
            for _ in range(clean_quantity):
                key = f"rk_{secrets.token_urlsafe(36)}"
                item = {
                    "key": key,
                    "amount": clean_amount,
                    "created_at": now,
                    "created_by": str(created_by or "").strip() or "admin",
                    "redeemed_by": None,
                    "redeemed_at": None,
                }
                self._redeem_keys.append(item)
                generated.append({"key": key, "amount": clean_amount})
            self._save_redeem_keys()
            return generated

    def list_redeem_keys(self) -> list[dict[str, object]]:
        with self._lock:
            items = []
            for item in reversed(self._redeem_keys):
                if not isinstance(item, dict):
                    continue
                redeemed_by = self._normalize_username(item.get("redeemed_by")) or None
                items.append(
                    {
                        "key": str(item.get("key") or "").strip(),
                        "amount": max(0, int(item.get("amount") or 0)),
                        "redeemed": bool(redeemed_by),
                        "redeemed_by": redeemed_by,
                        "created_at": str(item.get("created_at") or "").strip() or None,
                        "redeemed_at": str(item.get("redeemed_at") or "").strip() or None,
                    }
                )
            return items

    def redeem_keys(self, username: str, raw_keys: list[str]) -> dict[str, object]:
        normalized_username = self._normalize_username(username)
        if not normalized_username:
            raise ValueError("username is required")
        clean_keys = []
        seen = set()
        for value in raw_keys:
            key = str(value or "").strip()
            if key and key not in seen:
                seen.add(key)
                clean_keys.append(key)

        if not clean_keys:
            raise ValueError("keys is required")

        with self._lock:
            user_ref = None
            for user in self._users:
                if self._normalize_username(user.get("username")) == normalized_username:
                    user_ref = user
                    break
            if user_ref is None:
                raise ValueError("user not found")

            now = _now_text()
            total_amount = 0
            redeemed_keys: list[str] = []
            invalid_keys: list[str] = []
            used_keys: list[str] = []
            redeem_key_index = {str(item.get("key") or "").strip(): item for item in self._redeem_keys if isinstance(item, dict)}

            for key in clean_keys:
                item = redeem_key_index.get(key)
                if item is None:
                    invalid_keys.append(key)
                    continue
                if item.get("redeemed_by"):
                    used_keys.append(key)
                    continue
                amount = max(0, int(item.get("amount") or 0))
                if amount <= 0:
                    invalid_keys.append(key)
                    continue
                item["redeemed_by"] = normalized_username
                item["redeemed_at"] = now
                redeemed_keys.append(key)
                total_amount += amount

            if total_amount > 0:
                user_ref["quota"] = max(0, int(user_ref.get("quota") or 0)) + total_amount
                user_ref["updated_at"] = now
                self._save_users()
            if redeemed_keys:
                self._save_redeem_keys()

            return {
                "redeemed": len(redeemed_keys),
                "amount": total_amount,
                "redeemed_keys": redeemed_keys,
                "invalid_keys": invalid_keys,
                "used_keys": used_keys,
                "user": self._to_public_user(user_ref).to_dict(),
            }


from services.config import config


user_service = UserService(config.users_file, config.redeem_keys_file)
