from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4

from services.config import DATA_DIR


PROMPT_LIBRARY_FILE = DATA_DIR / "image_prompt_library.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_tags(value: object) -> list[str]:
    raw_tags: list[str] = []
    if isinstance(value, list):
        raw_tags.extend(str(item or "").strip() for item in value)
    elif isinstance(value, str):
        raw_tags.extend(part.strip() for part in value.replace("，", ",").replace(";", ",").split(","))

    tags: list[str] = []
    seen: set[str] = set()
    for raw_tag in raw_tags:
        normalized = raw_tag.strip().lstrip("#")
        if not normalized:
            continue
        lowered = normalized.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        tags.append(normalized)
    return tags[:10]


def _normalize_prompt_item(raw: object) -> dict[str, object] | None:
    if not isinstance(raw, dict):
        return None

    prompt = str(raw.get("prompt") or "").strip()
    tags = _normalize_tags(raw.get("tags"))
    owner_role = str(raw.get("owner_role") or "user").strip()
    owner_id = str(raw.get("owner_id") or "").strip()
    owner_name = str(raw.get("owner_name") or "").strip()
    if not prompt or not tags or owner_role not in {"admin", "user"} or not owner_id or not owner_name:
        return None

    title = str(raw.get("title") or "").strip()
    now = _now_iso()
    return {
        "id": str(raw.get("id") or uuid4().hex).strip() or uuid4().hex,
        "title": title,
        "prompt": prompt,
        "tags": tags,
        "owner_role": owner_role,
        "owner_id": owner_id,
        "owner_name": owner_name,
        "created_at": str(raw.get("created_at") or now).strip() or now,
        "updated_at": str(raw.get("updated_at") or raw.get("created_at") or now).strip() or now,
    }


class PromptLibraryService:
    def __init__(self, store_file: Path):
        self._store_file = store_file
        self._lock = Lock()
        self._items = self._load()

    def _load(self) -> list[dict[str, object]]:
        if not self._store_file.exists():
            return []
        try:
            raw = json.loads(self._store_file.read_text(encoding="utf-8"))
        except Exception:
            return []
        items = raw.get("items") if isinstance(raw, dict) else raw
        if not isinstance(items, list):
            return []
        return [item for item in (_normalize_prompt_item(candidate) for candidate in items) if item is not None]

    def _save(self) -> None:
        self._store_file.parent.mkdir(parents=True, exist_ok=True)
        self._store_file.write_text(
            json.dumps({"items": self._items}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    def list_prompts(self, *, mine_only: bool = False, owner_role: str = "", owner_id: str = "", search: str = "") -> list[dict[str, object]]:
        normalized_search = str(search or "").strip().lower()
        normalized_owner_role = str(owner_role or "").strip()
        normalized_owner_id = str(owner_id or "").strip()
        with self._lock:
            items = [dict(item) for item in self._items]

        if mine_only:
            items = [
                item
                for item in items
                if str(item.get("owner_role") or "") == normalized_owner_role and str(item.get("owner_id") or "") == normalized_owner_id
            ]

        if normalized_search:
            filtered_items: list[dict[str, object]] = []
            for item in items:
                raw_tags = item.get("tags")
                searchable_tags = raw_tags if isinstance(raw_tags, list) else []
                if (
                    normalized_search in str(item.get("title") or "").lower()
                    or normalized_search in str(item.get("prompt") or "").lower()
                    or normalized_search in str(item.get("owner_name") or "").lower()
                    or any(normalized_search in str(tag).lower() for tag in searchable_tags)
                ):
                    filtered_items.append(item)
            items = filtered_items

        return sorted(items, key=lambda item: str(item.get("updated_at") or ""), reverse=True)

    def get_prompt(self, prompt_id: str) -> dict[str, object] | None:
        normalized_prompt_id = str(prompt_id or "").strip()
        if not normalized_prompt_id:
            return None
        with self._lock:
            for item in self._items:
                if str(item.get("id") or "") == normalized_prompt_id:
                    return dict(item)
        return None

    def create_prompt(
        self,
        *,
        title: str,
        prompt: str,
        tags: list[str],
        owner_role: str,
        owner_id: str,
        owner_name: str,
    ) -> dict[str, object]:
        normalized = _normalize_prompt_item(
            {
                "title": title,
                "prompt": prompt,
                "tags": tags,
                "owner_role": owner_role,
                "owner_id": owner_id,
                "owner_name": owner_name,
            }
        )
        if normalized is None:
            raise ValueError("prompt and tags are required")

        with self._lock:
            self._items.append(normalized)
            self._save()
            return dict(normalized)

    def update_prompt(self, prompt_id: str, *, title: str, prompt: str, tags: list[str]) -> dict[str, object] | None:
        normalized_prompt_id = str(prompt_id or "").strip()
        if not normalized_prompt_id:
            return None
        with self._lock:
            for index, current in enumerate(self._items):
                if str(current.get("id") or "") != normalized_prompt_id:
                    continue
                next_item = _normalize_prompt_item(
                    {
                        **current,
                        "title": title,
                        "prompt": prompt,
                        "tags": tags,
                        "updated_at": _now_iso(),
                    }
                )
                if next_item is None:
                    raise ValueError("prompt and tags are required")
                self._items[index] = next_item
                self._save()
                return dict(next_item)
        return None

    def delete_prompt(self, prompt_id: str) -> bool:
        normalized_prompt_id = str(prompt_id or "").strip()
        if not normalized_prompt_id:
            return False
        with self._lock:
            before = len(self._items)
            self._items = [item for item in self._items if str(item.get("id") or "") != normalized_prompt_id]
            if len(self._items) == before:
                return False
            self._save()
            return True


prompt_library_service = PromptLibraryService(PROMPT_LIBRARY_FILE)
