from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from services.config import BASE_DIR


COS_CONFIG_FILE = BASE_DIR / "cos_config.json"


@dataclass(frozen=True)
class CosConfigData:
    region: str
    secret_id: str
    secret_key: str
    bucket: str

    @property
    def public_base_url(self) -> str:
        return f"https://{self.bucket}.cos.{self.region}.myqcloud.com"

    def to_dict(self) -> dict[str, str]:
        return {
            "Region": self.region,
            "SecretId": self.secret_id,
            "SecretKey": self.secret_key,
            "Bucket": self.bucket,
        }


def load_cos_config() -> CosConfigData | None:
    if not COS_CONFIG_FILE.exists() or COS_CONFIG_FILE.is_dir():
        return None
    try:
        raw = json.loads(COS_CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(raw, dict):
        return None
    region = str(raw.get("Region") or "").strip()
    secret_id = str(raw.get("SecretId") or "").strip()
    secret_key = str(raw.get("SecretKey") or "").strip()
    bucket = str(raw.get("Bucket") or "").strip()
    if not region or not secret_id or not secret_key or not bucket:
        return None
    return CosConfigData(region=region, secret_id=secret_id, secret_key=secret_key, bucket=bucket)


def save_cos_config(data: dict[str, object]) -> CosConfigData:
    cos_config = CosConfigData(
        region=str(data.get("Region") or "").strip(),
        secret_id=str(data.get("SecretId") or "").strip(),
        secret_key=str(data.get("SecretKey") or "").strip(),
        bucket=str(data.get("Bucket") or "").strip(),
    )
    if not cos_config.region or not cos_config.secret_id or not cos_config.secret_key or not cos_config.bucket:
        raise ValueError("Region、SecretId、SecretKey、Bucket 均为必填")
    COS_CONFIG_FILE.write_text(json.dumps(cos_config.to_dict(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cos_config
