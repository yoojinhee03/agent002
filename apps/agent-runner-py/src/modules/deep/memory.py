"""메모리 관리 — STM(Redis)/LTM(PostgreSQL)/요약 압축 — deepagent-sdk memory에서 이관"""
import json
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from src.modules.deep.models import MemoryConfig


# ---------------------------------------------------------------------------
# 단기 메모리 (Redis)
# ---------------------------------------------------------------------------

class ShortTermMemory:
    def __init__(self, redis_url: str, ttl_seconds: int = 3600):
        self._redis = aioredis.from_url(redis_url, encoding="utf-8", decode_responses=True)
        self._ttl = ttl_seconds

    def _key(self, thread_id: str) -> str:
        return f"deepagent:stm:{thread_id}"

    async def get(self, thread_id: str) -> list[dict[str, Any]]:
        raw = await self._redis.get(self._key(thread_id))
        if raw is None:
            return []
        return json.loads(raw)

    async def set(self, thread_id: str, messages: list[dict[str, Any]]) -> None:
        await self._redis.set(self._key(thread_id), json.dumps(messages), ex=self._ttl)

    async def append(self, thread_id: str, message: dict[str, Any]) -> None:
        messages = await self.get(thread_id)
        messages.append(message)
        await self.set(thread_id, messages)

    async def clear(self, thread_id: str) -> None:
        await self._redis.delete(self._key(thread_id))

    async def close(self) -> None:
        await self._redis.aclose()


# ---------------------------------------------------------------------------
# 장기 메모리 (PostgreSQL)
# ---------------------------------------------------------------------------

class LongTermMemory:
    def __init__(self, database_url: str, max_entries: int = 1000):
        self._db_url = database_url
        self._max_entries = max_entries

    async def _conn(self):
        import psycopg
        return await psycopg.AsyncConnection.connect(self._db_url)

    async def store(
        self,
        agent_id: str,
        thread_id: str,
        content: str,
        memory_type: str = "episodic",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        async with await self._conn() as conn:
            await conn.execute(
                """
                INSERT INTO deep_agent_memory (id, agent_id, thread_id, type, content, metadata, created_at, updated_at)
                VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, NOW(), NOW())
                """,
                (agent_id, thread_id, memory_type, content, json.dumps(metadata or {})),
            )
            await conn.execute(
                """
                DELETE FROM deep_agent_memory
                WHERE agent_id = %s AND id NOT IN (
                    SELECT id FROM deep_agent_memory
                    WHERE agent_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                )
                """,
                (agent_id, agent_id, self._max_entries),
            )

    async def retrieve(
        self,
        agent_id: str,
        thread_id: str | None = None,
        memory_type: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        conditions = ["agent_id = %s"]
        params: list[Any] = [agent_id]

        if thread_id:
            conditions.append("thread_id = %s")
            params.append(thread_id)
        if memory_type:
            conditions.append("type = %s")
            params.append(memory_type)

        params.append(limit)
        where = " AND ".join(conditions)

        async with await self._conn() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    f"SELECT id, type, content, metadata, created_at FROM deep_agent_memory WHERE {where} ORDER BY created_at DESC LIMIT %s",
                    params,
                )
                rows = await cur.fetchall()
                return [
                    {
                        "id": str(r[0]),
                        "type": r[1],
                        "content": r[2],
                        "metadata": r[3],
                        "createdAt": r[4].isoformat() if r[4] else None,
                    }
                    for r in rows
                ]


# ---------------------------------------------------------------------------
# 요약 압축
# ---------------------------------------------------------------------------

async def summarize_messages(
    messages: list[dict[str, Any]],
    model: BaseChatModel,
    keep_recent: int = 5,
) -> tuple[str, list[dict[str, Any]]]:
    if len(messages) <= keep_recent:
        return ("", messages)

    to_summarize = messages[:-keep_recent]
    recent = messages[-keep_recent:]

    conversation_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in to_summarize
    )

    prompt = SystemMessage(
        content="Summarize the following conversation concisely in a few sentences, preserving key facts and decisions."
    )
    human = HumanMessage(content=conversation_text)

    response = await model.ainvoke([prompt, human])
    summary = response.content if isinstance(response.content, str) else str(response.content)

    return (summary, recent)


# ---------------------------------------------------------------------------
# 메모리 매니저
# ---------------------------------------------------------------------------

class MemoryManager:
    def __init__(
        self,
        config: MemoryConfig,
        agent_id: str,
        redis_url: str | None = None,
        database_url: str | None = None,
        model: BaseChatModel | None = None,
    ):
        self._config = config
        self._agent_id = agent_id
        self._model = model

        self._stm: ShortTermMemory | None = None
        if config.short_term_backend == "redis" and redis_url:
            self._stm = ShortTermMemory(redis_url, config.short_term_ttl_seconds)
        else:
            self._in_memory: dict[str, list[dict[str, Any]]] = {}

        self._ltm: LongTermMemory | None = None
        if config.long_term_backend == "postgresql" and database_url:
            self._ltm = LongTermMemory(database_url, config.long_term_max_entries)

    async def get_context(self, thread_id: str) -> list[dict[str, Any]]:
        if self._stm:
            return await self._stm.get(thread_id)
        return self._in_memory.get(thread_id, [])

    async def add_messages(self, thread_id: str, messages: list[dict[str, Any]]) -> None:
        if self._stm:
            current = await self._stm.get(thread_id)
            current.extend(messages)
            await self._maybe_compress(thread_id, current)
        else:
            current = self._in_memory.get(thread_id, [])
            current.extend(messages)
            await self._maybe_compress_inmem(thread_id, current)

    async def _maybe_compress(self, thread_id: str, messages: list[dict[str, Any]]) -> None:
        strategy = self._config.strategy
        trigger = self._config.summary_trigger_count

        if strategy in ("summary", "hybrid") and len(messages) > trigger and self._model:
            summary, recent = await summarize_messages(messages, self._model)
            if summary and self._ltm:
                await self._ltm.store(
                    agent_id=self._agent_id,
                    thread_id=thread_id,
                    content=summary,
                    memory_type="summary",
                )
            compressed = (
                [{"role": "system", "content": f"[Previous conversation summary]: {summary}"}]
                + recent
                if summary
                else recent
            )
            if self._stm:
                await self._stm.set(thread_id, compressed)
        elif self._stm:
            await self._stm.set(thread_id, messages)

    async def _maybe_compress_inmem(self, thread_id: str, messages: list[dict[str, Any]]) -> None:
        strategy = self._config.strategy
        trigger = self._config.summary_trigger_count

        if strategy in ("summary", "hybrid") and len(messages) > trigger and self._model:
            summary, recent = await summarize_messages(messages, self._model)
            compressed = (
                [{"role": "system", "content": f"[Previous conversation summary]: {summary}"}]
                + recent
                if summary
                else recent
            )
            self._in_memory[thread_id] = compressed
        else:
            self._in_memory[thread_id] = messages

    async def store_episodic(self, thread_id: str, content: str) -> None:
        if self._ltm:
            await self._ltm.store(
                agent_id=self._agent_id,
                thread_id=thread_id,
                content=content,
                memory_type="episodic",
            )

    async def retrieve_long_term(
        self,
        thread_id: str | None = None,
        memory_type: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        if not self._ltm:
            return []
        return await self._ltm.retrieve(self._agent_id, thread_id, memory_type, limit)

    async def close(self) -> None:
        if self._stm:
            await self._stm.close()
