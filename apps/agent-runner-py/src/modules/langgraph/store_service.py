"""psycopg3 기반 LangGraph PostgreSQL Store 서비스"""
import psycopg
from langgraph.store.postgres import AsyncPostgresStore

from src.config import settings

_store: AsyncPostgresStore | None = None


async def get_store() -> AsyncPostgresStore:
    global _store
    if _store is None:
        conn = await psycopg.AsyncConnection.connect(
            settings.DATABASE_URL,
            autocommit=True,
            prepare_threshold=0,
        )
        _store = AsyncPostgresStore(conn)
        await _store.setup()
    return _store
