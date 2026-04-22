from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from services.config import config
from services.user_service import user_service


def extract_bearer_token(authorization: str | None) -> str:
    scheme, _, value = str(authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return ""
    return value.strip()


@dataclass(frozen=True)
class AuthContext:
    role: str
    user: dict[str, object] | None = None

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_user(self) -> bool:
        return self.role == "user"


class AuthService:
    @staticmethod
    def resolve_context(authorization: str | None) -> AuthContext | None:
        token = extract_bearer_token(authorization)
        if not token:
            return None
        if token == str(config.auth_key or "").strip():
            return AuthContext(role="admin", user=None)

        user = user_service.get_user_by_session(token)
        if user is None:
            return None
        return AuthContext(role="user", user=user)

    def require_authenticated(self, authorization: str | None) -> AuthContext:
        context = self.resolve_context(authorization)
        if context is None:
            raise HTTPException(status_code=401, detail={"error": "authorization is invalid"})
        return context

    def require_admin(self, authorization: str | None) -> AuthContext:
        context = self.require_authenticated(authorization)
        if not context.is_admin:
            raise HTTPException(status_code=403, detail={"error": "admin only"})
        return context

    def require_user(self, authorization: str | None) -> AuthContext:
        context = self.require_authenticated(authorization)
        if not context.is_user or context.user is None:
            raise HTTPException(status_code=403, detail={"error": "user only"})
        return context

    @staticmethod
    def login_admin(authorization: str | None) -> bool:
        token = extract_bearer_token(authorization)
        return bool(token) and token == str(config.auth_key or "").strip()


auth_service = AuthService()
