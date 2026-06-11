"""psycopg3 async 데이터베이스 클라이언트"""
import re
from typing import Any

import psycopg
import psycopg_pool

from src.config import settings

_pool: psycopg_pool.AsyncConnectionPool | None = None


async def connect() -> None:
    global _pool
    _pool = psycopg_pool.AsyncConnectionPool(
        settings.DATABASE_URL,
        min_size=2,
        max_size=10,
        open=False,
    )
    await _pool.open()


async def disconnect() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def _adapt(sql: str) -> str:
    """$N 위치 파라미터를 psycopg3 스타일(%s)로 변환한다."""
    return re.sub(r"\$\d+", "%s", sql)


def _get_pool() -> psycopg_pool.AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("Database not initialized — call connect() first")
    return _pool


async def fetch_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    async with _get_pool().connection() as conn:
        async with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            await cur.execute(_adapt(sql), params)
            return await cur.fetchone()


async def fetch_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    async with _get_pool().connection() as conn:
        async with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            await cur.execute(_adapt(sql), params)
            return await cur.fetchall()


async def execute(sql: str, params: tuple[Any, ...] = ()) -> None:
    async with _get_pool().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_adapt(sql), params)


async def execute_returning(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    async with _get_pool().connection() as conn:
        async with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            await cur.execute(_adapt(sql), params)
            return await cur.fetchone()
