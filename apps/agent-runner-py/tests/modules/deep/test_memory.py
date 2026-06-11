"""deep/memory.py 단위 테스트"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.modules.deep.memory import MemoryManager, ShortTermMemory, summarize_messages
from src.modules.deep.models import MemoryConfig


class TestShortTermMemory:
    @pytest.fixture
    def mock_redis(self):
        redis = AsyncMock()
        redis.get = AsyncMock(return_value=None)
        redis.set = AsyncMock()
        redis.delete = AsyncMock()
        redis.aclose = AsyncMock()
        return redis

    @pytest.fixture
    def stm(self, mock_redis):
        with patch("src.modules.deep.memory.aioredis") as mock_aioredis:
            mock_aioredis.from_url = MagicMock(return_value=mock_redis)
            mem = ShortTermMemory("redis://localhost:6380", ttl_seconds=60)
            return mem, mock_redis

    @pytest.mark.asyncio
    async def test_get_returns_empty_on_miss(self, stm):
        mem, redis = stm
        redis.get.return_value = None
        result = await mem.get("thread-1")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_returns_messages(self, stm):
        mem, redis = stm
        messages = [{"role": "user", "content": "hello"}]
        redis.get.return_value = json.dumps(messages)
        result = await mem.get("thread-1")
        assert result == messages

    @pytest.mark.asyncio
    async def test_set_calls_redis(self, stm):
        mem, redis = stm
        messages = [{"role": "assistant", "content": "hi"}]
        await mem.set("thread-1", messages)
        redis.set.assert_awaited_once()


class TestMemoryManager:
    def _make_manager(self, strategy: str = "raw_log") -> MemoryManager:
        config = MemoryConfig(
            strategy=strategy,
            short_term_backend="in_memory",
        )
        return MemoryManager(config=config, agent_id="agent-1")

    @pytest.mark.asyncio
    async def test_get_context_returns_empty_initially(self):
        mgr = self._make_manager()
        result = await mgr.get_context("thread-1")
        assert result == []

    @pytest.mark.asyncio
    async def test_add_and_get_messages(self):
        mgr = self._make_manager()
        msgs = [{"role": "user", "content": "hello"}]
        await mgr.add_messages("thread-1", msgs)
        result = await mgr.get_context("thread-1")
        assert result == msgs

    @pytest.mark.asyncio
    async def test_multiple_threads_isolated(self):
        mgr = self._make_manager()
        await mgr.add_messages("thread-A", [{"role": "user", "content": "A"}])
        await mgr.add_messages("thread-B", [{"role": "user", "content": "B"}])
        assert (await mgr.get_context("thread-A"))[0]["content"] == "A"
        assert (await mgr.get_context("thread-B"))[0]["content"] == "B"

    @pytest.mark.asyncio
    async def test_close_without_stm(self):
        mgr = self._make_manager()
        await mgr.close()

    @pytest.mark.asyncio
    async def test_retrieve_long_term_returns_empty_without_ltm(self):
        mgr = self._make_manager()
        result = await mgr.retrieve_long_term()
        assert result == []


class TestSummarizeMessages:
    @pytest.mark.asyncio
    async def test_returns_original_when_short(self):
        messages = [{"role": "user", "content": "hi"}]
        model = AsyncMock()
        summary, recent = await summarize_messages(messages, model, keep_recent=5)
        assert summary == ""
        assert recent == messages
        model.ainvoke.assert_not_called()

    @pytest.mark.asyncio
    async def test_summarizes_long_conversation(self):
        messages = [{"role": "user", "content": f"msg {i}"} for i in range(10)]
        model = AsyncMock()
        model.ainvoke.return_value = MagicMock(content="Summary of conversation")
        summary, recent = await summarize_messages(messages, model, keep_recent=3)
        assert summary == "Summary of conversation"
        assert len(recent) == 3
        model.ainvoke.assert_awaited_once()
