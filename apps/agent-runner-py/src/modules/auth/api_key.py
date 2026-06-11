import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from src.config import settings
from src.database.client import fetch_one
from src.modules.cache.cache_service import CacheService

_CACHE_TTL = 300  # 5분


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


async def verify_api_key(raw_key: str) -> dict[str, Any]:
    if raw_key == settings.INTERNAL_SERVICE_KEY:
        return {"id": "internal", "projectId": None, "enabled": True}

    key_hash = _hash_key(raw_key)
    cache_key = f"apikey:{key_hash}"

    cached = await CacheService.get(cache_key)
    if cached:
        api_key_data: dict[str, Any] = json.loads(cached)
    else:
        record = await fetch_one(
            "SELECT id, project_id, enabled, valid_from, expires_at FROM api_keys WHERE key_hash = $1 LIMIT 1",
            (key_hash,),
        )
        if record is None:
            raise HTTPException(status_code=401, detail="Invalid API key")
        api_key_data = {
            "id": record["id"],
            "projectId": record["project_id"],
            "enabled": record["enabled"],
            "validFrom": record["valid_from"].isoformat() if record["valid_from"] else None,
            "expiresAt": record["expires_at"].isoformat() if record["expires_at"] else None,
        }
        await CacheService.set(cache_key, json.dumps(api_key_data), _CACHE_TTL)

    if not api_key_data.get("enabled"):
        raise HTTPException(status_code=401, detail="API key is disabled")

    now = datetime.now(timezone.utc)
    valid_from = api_key_data.get("validFrom")
    expires_at = api_key_data.get("expiresAt")

    if valid_from and datetime.fromisoformat(valid_from) > now:
        raise HTTPException(status_code=401, detail="API key is not yet valid")
    if expires_at and datetime.fromisoformat(expires_at) < now:
        raise HTTPException(status_code=401, detail="API key has expired")

    return api_key_data
