"""psycopg3 기반 LangGraph 체크포인트 서비스"""
import psycopg
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from src.config import settings

_saver: AsyncPostgresSaver | None = None


async def get_saver() -> AsyncPostgresSaver:
    global _saver
    if _saver is None:
        conn = await psycopg.AsyncConnection.connect(
            settings.DATABASE_URL,
            autocommit=True,
            prepare_threshold=0,
        )
        _saver = AsyncPostgresSaver(conn)
        await _saver.setup()
    return _saver
