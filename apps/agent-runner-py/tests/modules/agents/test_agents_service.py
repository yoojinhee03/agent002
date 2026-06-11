"""agents_service.py 단위 테스트 — _parse_thinking_stream 회귀 검증 (6.7)"""
import pytest

from src.modules.agents.agents_service import _parse_thinking_stream


async def _stream(*chunks: dict) -> list[dict]:
    """헬퍼: 청크 목록을 async generator로 변환하고 결과 이벤트를 수집."""
    async def _gen():
        for c in chunks:
            yield c

    return [e async for e in _parse_thinking_stream(_gen())]


class TestParseThinkingStream:
    """6.7 회귀: _parse_thinking_stream 이벤트 변환 검증."""

    @pytest.mark.asyncio
    async def test_plain_token_passthrough(self):
        """사고 태그 없는 일반 토큰은 그대로 token 이벤트로 통과한다."""
        events = await _stream(
            {"event": "token", "data": {"token": "Hello", "runStepId": "s1"}},
            {"event": "token", "data": {"token": " World", "runStepId": "s1"}},
        )
        token_events = [e for e in events if e["event"] == "token" and e["data"]["token"]]
        combined = "".join(e["data"]["token"] for e in token_events)
        assert "Hello" in combined
        assert "World" in combined

    @pytest.mark.asyncio
    async def test_non_token_events_pass_through(self):
        """token 이외 이벤트(run.completed, step.update 등)는 변환 없이 그대로 통과한다."""
        events = await _stream(
            {"event": "run.completed", "data": {"messages": [], "state": {}}},
            {"event": "step.update", "data": {"node": "agent", "update": {}}},
        )
        assert any(e["event"] == "run.completed" for e in events)
        assert any(e["event"] == "step.update" for e in events)

    @pytest.mark.asyncio
    async def test_thinking_tag_splits_to_reasoning_token(self):
        """<thinking>...</thinking> 블록이 reasoning.token 이벤트로 분리된다."""
        events = await _stream(
            {"event": "token", "data": {"token": "before<thinking>think content</thinking>after", "runStepId": "s1"}},
        )
        reasoning_events = [e for e in events if e["event"] == "reasoning.token"]
        token_events = [e for e in events if e["event"] == "token" and e["data"]["token"]]

        reasoning_text = "".join(e["data"]["token"] for e in reasoning_events)
        token_text = "".join(e["data"]["token"] for e in token_events)

        assert "think content" in reasoning_text
        assert "before" in token_text
        assert "after" in token_text

    @pytest.mark.asyncio
    async def test_thinking_tag_done_flag_emitted(self):
        """<thinking> 블록 종료 시 done=True인 reasoning.token 이벤트가 발행된다."""
        events = await _stream(
            {"event": "token", "data": {"token": "<thinking>내용</thinking>", "runStepId": "s1"}},
        )
        done_events = [
            e for e in events
            if e["event"] == "reasoning.token" and e["data"].get("done") is True
        ]
        assert len(done_events) >= 1

    @pytest.mark.asyncio
    async def test_error_event_passes_through(self):
        """error 이벤트는 변환 없이 그대로 통과한다."""
        events = await _stream(
            {"event": "error", "data": {"message": "LLM error", "type": "runtime"}},
        )
        assert any(e["event"] == "error" for e in events)

    @pytest.mark.asyncio
    async def test_empty_stream_emits_done_token(self):
        """빈 스트림도 완료 표시 token 이벤트를 발행한다."""
        events = await _stream()
        done_token_events = [
            e for e in events
            if e["event"] in ("token", "reasoning.token") and e["data"].get("done") is True
        ]
        assert len(done_token_events) >= 1

    @pytest.mark.asyncio
    async def test_plan_created_event_passes_through(self):
        """plan.created 이벤트는 변환 없이 통과한다."""
        events = await _stream(
            {"event": "plan.created", "data": {"todos": '[{"text":"Step 1"}]'}},
        )
        assert any(e["event"] == "plan.created" for e in events)

    @pytest.mark.asyncio
    async def test_multiple_thinking_blocks(self):
        """여러 <thinking> 블록이 각각 별도 reasoning.token 세트로 분리된다."""
        events = await _stream(
            {"event": "token", "data": {"token": "<thinking>1차 사고</thinking>중간<thinking>2차 사고</thinking>끝", "runStepId": "s1"}},
        )
        reasoning_events = [e for e in events if e["event"] == "reasoning.token"]
        done_flags = [e for e in reasoning_events if e["data"].get("done") is True]
        assert len(done_flags) >= 2
