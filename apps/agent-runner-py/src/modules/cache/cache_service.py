import time
from typing import Optional

import redis.asyncio as aioredis

from src.config import settings

_redis: aioredis.Redis | None = None


class CacheService:
    @classmethod
    async def initialize(cls) -> None:
        global _redis
        _redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )

    @classmethod
    async def close(cls) -> None:
        global _redis
        if _redis:
            await _redis.aclose()
            _redis = None

    @classmethod
    def _client(cls) -> aioredis.Redis:
        if _redis is None:
            raise RuntimeError("CacheService not initialized")
        return _redis

    @classmethod
    async def get(cls, key: str) -> Optional[str]:
        return await cls._client().get(key)

    @classmethod
    async def set(cls, key: str, value: str, ttl_seconds: Optional[int] = None) -> None:
        if ttl_seconds:
            await cls._client().set(key, value, ex=ttl_seconds)
        else:
            await cls._client().set(key, value)

    @classmethod
    async def delete(cls, key: str) -> None:
        await cls._client().delete(key)

    @classmethod
    async def delete_pattern(cls, pattern: str) -> None:
        keys = await cls._client().keys(pattern)
        if keys:
            await cls._client().delete(*keys)

    @classmethod
    async def check_rate_limit(
        cls,
        key: str,
        limit: int,
        window_seconds: int,
    ) -> dict[str, int | bool]:
        now = int(time.time() * 1000)
        window_start = now - window_seconds * 1000

        pipe = cls._client().pipeline()
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, window_seconds)
        results = await pipe.execute()

        count: int = results[2]
        allowed = count <= limit
        reset_at = now + window_seconds * 1000

        return {"allowed": allowed, "remaining": max(0, limit - count), "resetAt": reset_at}
