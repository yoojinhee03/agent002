"""deepagent_bridge.py 단위 테스트 — 이벤트 어댑터 mock 기반 검증"""
import pytest
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessageChunk, AIMessage, HumanMessage, ToolMessage

from src.modules.agents.deepagent_bridge import (
    _apply_tool_policies,
    _build_guardrails_cfg,
    _serialize_messages,
)
from src.modules.deep.models import GuardrailsConfig


# ---------------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------------

def _make_loaded(
    guardrails_raw: dict | None = None,
    reasoning_raw: dict | None = None,
    memory_raw: dict | None = None,
    tool_permissions: dict | None = None,
) -> dict:
    return {
        "id": "agent-001",
        "name": "TestAgent",
        "slug": "test-agent",
        "description": "test",
        "architecture": "react",
        "systemPrompt": "You are a test agent.",
        "modelId": "claude-sonnet-4-6",
        "providerSlug": "anthropic",
        "providerApiKey": "test-key",
        "config": {},
        "planningConfig": {},
        "reasoningConfig": reasoning_raw or {},
        "memoryConfig": memory_raw or {},
        "guardrailsConfig": guardrails_raw or {},
        "toolPermissions": tool_permissions or {},
        "tools": [],
    }


# ---------------------------------------------------------------------------
# _build_guardrails_cfg
# ---------------------------------------------------------------------------

class TestBuildGuardrailsCfg:
    def test_builds_from_raw(self):
        raw = {
            "blockedTopics": ["hacking"],
            "outputFilters": [r"\bpassword\b"],
            "piiDetection": True,
            "safetyLevel": "high",
        }
        cfg = _build_guardrails_cfg(raw)
        assert cfg.blocked_topics == ["hacking"]
        assert cfg.pii_detection is True
        assert cfg.safety_level == "high"

    def test_defaults_on_empty(self):
        cfg = _build_guardrails_cfg({})
        assert cfg.blocked_topics == []
        assert cfg.pii_detection is False
        assert cfg.safety_level == "medium"


# ---------------------------------------------------------------------------
# _apply_tool_policies
# ---------------------------------------------------------------------------

class TestApplyToolPolicies:
    def _make_tool(self, name: str):
        from langchain_core.tools import StructuredTool

        async def _run(**kwargs):
            return "ok"

        return StructuredTool.from_function(coroutine=_run, name=name, description="test")

    def test_disabled_tool_excluded(self):
        tools = [self._make_tool("dangerous_tool")]
        wrapped, interrupt_on = _apply_tool_policies(tools, {"dangerous_tool": "disabled"})
        assert len(wrapped) == 0
        assert interrupt_on == {}

    def test_requires_approval_adds_interrupt_on(self):
        tools = [self._make_tool("deploy_tool")]
        wrapped, interrupt_on = _apply_tool_policies(tools, {"deploy_tool": "requires_approval"})
        assert len(wrapped) == 1
        assert "deploy_tool" in interrupt_on

    def test_restricted_wraps_tool(self):
        tools = [self._make_tool("read_tool")]
        wrapped, interrupt_on = _apply_tool_policies(tools, {"read_tool": "restricted"})
        assert len(wrapped) == 1
        assert "[RESTRICTED]" in wrapped[0].description
        assert interrupt_on == {}

    def test_auto_passes_through(self):
        tools = [self._make_tool("search_tool")]
        wrapped, interrupt_on = _apply_tool_policies(tools, {"search_tool": "auto"})
        assert wrapped[0].name == "search_tool"
        assert interrupt_on == {}

    def test_unknown_policy_treated_as_auto(self):
        tools = [self._make_tool("my_tool")]
        wrapped, interrupt_on = _apply_tool_policies(tools, {"my_tool": "unknown"})
        assert len(wrapped) == 1
        assert interrupt_on == {}

    def test_mixed_policies(self):
        tools = [
            self._make_tool("ok_tool"),
            self._make_tool("bad_tool"),
            self._make_tool("review_tool"),
        ]
        permissions = {
            "ok_tool": "auto",
            "bad_tool": "disabled",
            "review_tool": "requires_approval",
        }
        wrapped, interrupt_on = _apply_tool_policies(tools, permissions)
        names = [t.name for t in wrapped]
        assert "ok_tool" in names
        assert "bad_tool" not in names
        assert "review_tool" in names
        assert "review_tool" in interrupt_on


# ---------------------------------------------------------------------------
# stream_with_deepagent — 이벤트 어댑터 (mock 기반)
# ---------------------------------------------------------------------------

class TestStreamWithDeepagent:
    def _make_stream_chunks(self):
        """LangGraph astream이 반환하는 (mode, data) 청크 목록을 생성."""
        token_chunk = AIMessageChunk(content="Hello")
        token_meta = {"langgraph_node": "agent"}

        tool_msg = ToolMessage(content='[{"text":"Task 1"}]', tool_call_id="tc-1", name="write_todos")

        return [
            ("messages", (token_chunk, token_meta)),
            ("updates", {"tools": {"messages": [tool_msg]}}),
            ("updates", {"agent": {"messages": []}}),
        ]

    @pytest.mark.asyncio
    async def test_emits_token_event(self):
        from src.modules.agents.deepagent_bridge import stream_with_deepagent

        loaded = _make_loaded()
        chunks = self._make_stream_chunks()

        final_state = MagicMock()
        final_state.values = {"messages": []}

        mock_graph = MagicMock()
        mock_graph.astream = MagicMock(return_value=self._async_iter(chunks))
        mock_graph.aget_state = AsyncMock(return_value=final_state)

        with (
            patch("src.modules.agents.deepagent_bridge.create_deep_agent", return_value=mock_graph),
            patch("src.modules.agents.deepagent_bridge.get_saver", new_callable=AsyncMock),
            patch("src.modules.agents.deepagent_bridge._create_model", return_value=MagicMock()),
            patch("src.modules.agents.deepagent_bridge.resolve_system_prompt", return_value="system"),
            patch("src.modules.agents.deepagent_bridge.MemoryManager") as mock_mm,
        ):
            mock_mm.return_value.get_context = AsyncMock(return_value=[])
            mock_mm.return_value.close = AsyncMock()

            events = [e async for e in stream_with_deepagent(loaded, "thread-1", "hi", [])]

        token_events = [e for e in events if e["event"] == "token"]
        assert len(token_events) >= 1
        assert token_events[0]["data"]["token"] == "Hello"

    @pytest.mark.asyncio
    async def test_emits_plan_created_on_write_todos(self):
        from src.modules.agents.deepagent_bridge import stream_with_deepagent

        loaded = _make_loaded()
        chunks = self._make_stream_chunks()

        final_state = MagicMock()
        final_state.values = {"messages": []}

        mock_graph = MagicMock()
        mock_graph.astream = MagicMock(return_value=self._async_iter(chunks))
        mock_graph.aget_state = AsyncMock(return_value=final_state)

        with (
            patch("src.modules.agents.deepagent_bridge.create_deep_agent", return_value=mock_graph),
            patch("src.modules.agents.deepagent_bridge.get_saver", new_callable=AsyncMock),
            patch("src.modules.agents.deepagent_bridge._create_model", return_value=MagicMock()),
            patch("src.modules.agents.deepagent_bridge.resolve_system_prompt", return_value="system"),
            patch("src.modules.agents.deepagent_bridge.MemoryManager") as mock_mm,
        ):
            mock_mm.return_value.get_context = AsyncMock(return_value=[])
            mock_mm.return_value.close = AsyncMock()

            events = [e async for e in stream_with_deepagent(loaded, "thread-1", "hi", [])]

        plan_events = [e for e in events if e["event"] == "plan.created"]
        assert len(plan_events) == 1

    @pytest.mark.asyncio
    async def test_emits_run_completed(self):
        from src.modules.agents.deepagent_bridge import stream_with_deepagent

        loaded = _make_loaded()

        final_state = MagicMock()
        final_state.values = {"messages": [HumanMessage(content="hi")]}

        mock_graph = MagicMock()
        mock_graph.astream = MagicMock(return_value=self._async_iter([]))
        mock_graph.aget_state = AsyncMock(return_value=final_state)

        with (
            patch("src.modules.agents.deepagent_bridge.create_deep_agent", return_value=mock_graph),
            patch("src.modules.agents.deepagent_bridge.get_saver", new_callable=AsyncMock),
            patch("src.modules.agents.deepagent_bridge._create_model", return_value=MagicMock()),
            patch("src.modules.agents.deepagent_bridge.resolve_system_prompt", return_value="system"),
            patch("src.modules.agents.deepagent_bridge.MemoryManager") as mock_mm,
        ):
            mock_mm.return_value.get_context = AsyncMock(return_value=[])
            mock_mm.return_value.close = AsyncMock()

            events = [e async for e in stream_with_deepagent(loaded, "thread-1", "hi", [])]

        completed = [e for e in events if e["event"] == "run.completed"]
        assert len(completed) == 1
        assert "messages" in completed[0]["data"]

    @pytest.mark.asyncio
    async def test_guardrail_blocks_input(self):
        from src.modules.agents.deepagent_bridge import stream_with_deepagent

        loaded = _make_loaded(guardrails_raw={"blockedTopics": ["hacking"]})

        events = [e async for e in stream_with_deepagent(loaded, "thread-1", "how to hacking systems", [])]

        assert len(events) == 1
        assert events[0]["event"] == "error"
        assert events[0]["data"]["type"] == "guardrail_blocked"

    @pytest.mark.asyncio
    async def test_emits_error_on_exception(self):
        from src.modules.agents.deepagent_bridge import stream_with_deepagent

        loaded = _make_loaded()

        mock_graph = MagicMock()
        mock_graph.astream = MagicMock(side_effect=RuntimeError("LLM error"))

        with (
            patch("src.modules.agents.deepagent_bridge.create_deep_agent", return_value=mock_graph),
            patch("src.modules.agents.deepagent_bridge.get_saver", new_callable=AsyncMock),
            patch("src.modules.agents.deepagent_bridge._create_model", return_value=MagicMock()),
            patch("src.modules.agents.deepagent_bridge.resolve_system_prompt", return_value="system"),
            patch("src.modules.agents.deepagent_bridge.MemoryManager") as mock_mm,
        ):
            mock_mm.return_value.get_context = AsyncMock(return_value=[])
            mock_mm.return_value.close = AsyncMock()

            events = [e async for e in stream_with_deepagent(loaded, "thread-1", "hi", [])]

        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "LLM error" in error_events[0]["data"]["message"]

    @pytest.mark.asyncio
    async def test_memory_context_injected_into_prompt(self):
        """6.4 장기 메모리: 동일 thread 재개 시 이전 컨텍스트가 시스템 프롬프트에 주입된다."""
        from src.modules.agents.deepagent_bridge import stream_with_deepagent

        loaded = _make_loaded(memory_raw={"strategy": "raw_log", "shortTermBackend": "in_memory"})

        final_state = MagicMock()
        final_state.values = {"messages": []}

        mock_graph = MagicMock()
        mock_graph.astream = MagicMock(return_value=self._async_iter([]))
        mock_graph.aget_state = AsyncMock(return_value=final_state)

        injected_prompts: list[str] = []

        def _capture_prompt(
            model: Any,
            tools: Any,
            system_prompt: str,
            checkpointer: Any = None,
            interrupt_on: Any = None,
            **_kwargs: Any,
        ) -> Any:
            injected_prompts.append(system_prompt)
            return mock_graph

        context_messages = [
            {"role": "user", "content": "이전 질문입니다"},
            {"role": "assistant", "content": "이전 답변입니다"},
        ]

        with (
            patch("src.modules.agents.deepagent_bridge.create_deep_agent", side_effect=_capture_prompt),
            patch("src.modules.agents.deepagent_bridge.get_saver", new_callable=AsyncMock),
            patch("src.modules.agents.deepagent_bridge._create_model", return_value=MagicMock()),
            patch("src.modules.agents.deepagent_bridge.resolve_system_prompt", return_value="base_prompt"),
            patch("src.modules.agents.deepagent_bridge.MemoryManager") as mock_mm,
        ):
            mock_mm.return_value.get_context = AsyncMock(return_value=context_messages)
            mock_mm.return_value.close = AsyncMock()

            events = [e async for e in stream_with_deepagent(loaded, "thread-resume-1", "새 질문", [])]

        assert len(injected_prompts) == 1
        assert "[이전 대화 컨텍스트]" in injected_prompts[0]
        assert "이전 질문입니다" in injected_prompts[0]

    @pytest.mark.asyncio
    async def test_memory_context_empty_no_injection(self):
        """6.4 장기 메모리: 이전 컨텍스트가 없으면 프롬프트에 주입되지 않는다."""
        from src.modules.agents.deepagent_bridge import stream_with_deepagent

        loaded = _make_loaded()

        final_state = MagicMock()
        final_state.values = {"messages": []}

        mock_graph = MagicMock()
        mock_graph.astream = MagicMock(return_value=self._async_iter([]))
        mock_graph.aget_state = AsyncMock(return_value=final_state)

        injected_prompts: list[str] = []

        def _capture_prompt(
            model: Any,
            tools: Any,
            system_prompt: str,
            checkpointer: Any = None,
            interrupt_on: Any = None,
            **_kwargs: Any,
        ) -> Any:
            injected_prompts.append(system_prompt)
            return mock_graph

        with (
            patch("src.modules.agents.deepagent_bridge.create_deep_agent", side_effect=_capture_prompt),
            patch("src.modules.agents.deepagent_bridge.get_saver", new_callable=AsyncMock),
            patch("src.modules.agents.deepagent_bridge._create_model", return_value=MagicMock()),
            patch("src.modules.agents.deepagent_bridge.resolve_system_prompt", return_value="base_prompt"),
            patch("src.modules.agents.deepagent_bridge.MemoryManager") as mock_mm,
        ):
            mock_mm.return_value.get_context = AsyncMock(return_value=[])
            mock_mm.return_value.close = AsyncMock()

            [e async for e in stream_with_deepagent(loaded, "thread-new", "새 질문", [])]

        assert len(injected_prompts) == 1
        assert "[이전 대화 컨텍스트]" not in injected_prompts[0]

    @pytest.mark.asyncio
    async def test_hitl_interrupt_on_registered(self):
        """6.2 HITL: requires_approval 도구가 interrupt_on에 등록된 채로 create_deep_agent에 전달된다."""
        from src.modules.agents.deepagent_bridge import stream_with_deepagent
        from langchain_core.tools import StructuredTool

        async def _deploy(**kwargs: Any) -> str:
            return "deployed"

        deploy_tool = StructuredTool.from_function(
            coroutine=_deploy, name="deploy_prod", description="배포 도구"
        )

        loaded = _make_loaded(tool_permissions={"deploy_prod": "requires_approval"})

        final_state = MagicMock()
        final_state.values = {"messages": []}

        mock_graph = MagicMock()
        mock_graph.astream = MagicMock(return_value=self._async_iter([]))
        mock_graph.aget_state = AsyncMock(return_value=final_state)

        captured_interrupt_on: list[Any] = []

        def _capture_interrupt(
            model: Any,
            tools: Any,
            system_prompt: str,
            checkpointer: Any = None,
            interrupt_on: Any = None,
            **_kwargs: Any,
        ) -> Any:
            captured_interrupt_on.append(interrupt_on)
            return mock_graph

        with (
            patch("src.modules.agents.deepagent_bridge.create_deep_agent", side_effect=_capture_interrupt),
            patch("src.modules.agents.deepagent_bridge.get_saver", new_callable=AsyncMock),
            patch("src.modules.agents.deepagent_bridge._create_model", return_value=MagicMock()),
            patch("src.modules.agents.deepagent_bridge.resolve_system_prompt", return_value="system"),
            patch("src.modules.agents.deepagent_bridge.MemoryManager") as mock_mm,
        ):
            mock_mm.return_value.get_context = AsyncMock(return_value=[])
            mock_mm.return_value.close = AsyncMock()

            [e async for e in stream_with_deepagent(loaded, "thread-hitl-1", "배포해줘", [deploy_tool])]

        assert len(captured_interrupt_on) == 1
        assert captured_interrupt_on[0] is not None
        assert "deploy_prod" in captured_interrupt_on[0]

    @pytest.mark.asyncio
    async def test_resume_stream_with_deepagent_emits_run_completed(self):
        """6.2 HITL: resume_stream_with_deepagent 가 Command(resume=) 으로 재개 후 run.completed 를 yield 한다."""
        from src.modules.agents.deepagent_bridge import resume_stream_with_deepagent

        loaded = _make_loaded()

        final_state = MagicMock()
        final_state.values = {
            "messages": [
                HumanMessage(content="승인하겠습니다"),
                AIMessage(content="배포가 완료되었습니다."),
            ]
        }
        final_state.tasks = []

        async def _empty_events(*args, **kwargs):
            return
            yield  # pragma: no cover

        mock_graph = MagicMock()
        mock_graph.astream_events = _empty_events
        mock_graph.aget_state = AsyncMock(return_value=final_state)

        with (
            patch("src.modules.agents.deepagent_bridge.create_deep_agent", return_value=mock_graph),
            patch("src.modules.agents.deepagent_bridge.get_saver", new_callable=AsyncMock),
            patch("src.modules.agents.deepagent_bridge._create_model", return_value=MagicMock()),
            patch("src.modules.agents.deepagent_bridge.resolve_system_prompt", return_value="system"),
        ):
            events = [
                e async for e in resume_stream_with_deepagent(
                    loaded, "thread-hitl-1", [{"type": "approve"}], []
                )
            ]

        completed = [e for e in events if e["event"] == "run.completed"]
        assert len(completed) == 1
        messages = completed[0]["data"]["messages"]
        assert messages[-1]["content"] == "배포가 완료되었습니다."

    @pytest.mark.asyncio
    async def test_subagent_delegation_step_update(self):
        """6.3 서브에이전트: task 도구 호출 시 step.update 이벤트가 포함된다."""
        from src.modules.agents.deepagent_bridge import stream_with_deepagent

        loaded = _make_loaded()

        tool_msg = ToolMessage(
            content="sub-agent result",
            tool_call_id="tc-sub-1",
            name="agent_sub_worker",
        )

        chunks = [
            ("updates", {"tools": {"messages": [tool_msg]}}),
        ]

        final_state = MagicMock()
        final_state.values = {"messages": []}

        mock_graph = MagicMock()
        mock_graph.astream = MagicMock(return_value=self._async_iter(chunks))
        mock_graph.aget_state = AsyncMock(return_value=final_state)

        with (
            patch("src.modules.agents.deepagent_bridge.create_deep_agent", return_value=mock_graph),
            patch("src.modules.agents.deepagent_bridge.get_saver", new_callable=AsyncMock),
            patch("src.modules.agents.deepagent_bridge._create_model", return_value=MagicMock()),
            patch("src.modules.agents.deepagent_bridge.resolve_system_prompt", return_value="system"),
            patch("src.modules.agents.deepagent_bridge.MemoryManager") as mock_mm,
        ):
            mock_mm.return_value.get_context = AsyncMock(return_value=[])
            mock_mm.return_value.close = AsyncMock()

            events = [e async for e in stream_with_deepagent(loaded, "thread-sub-1", "위임해줘", [])]

        step_events = [e for e in events if e["event"] == "step.update"]
        assert len(step_events) >= 1
        assert step_events[0]["data"]["node"] == "tools"

    @pytest.mark.asyncio
    async def test_disabled_tool_excluded_before_graph(self):
        """6.6 도구 권한: disabled 도구는 create_deep_agent에 전달되지 않는다."""
        from src.modules.agents.deepagent_bridge import stream_with_deepagent
        from langchain_core.tools import StructuredTool

        async def _safe(**kwargs: Any) -> str:
            return "safe"

        async def _danger(**kwargs: Any) -> str:
            return "danger"

        safe_tool = StructuredTool.from_function(coroutine=_safe, name="safe_tool", description="안전 도구")
        danger_tool = StructuredTool.from_function(coroutine=_danger, name="danger_tool", description="위험 도구")

        loaded = _make_loaded(tool_permissions={"danger_tool": "disabled"})

        final_state = MagicMock()
        final_state.values = {"messages": []}

        captured_tools: list[list[Any]] = []

        mock_graph = MagicMock()
        mock_graph.astream = MagicMock(return_value=self._async_iter([]))
        mock_graph.aget_state = AsyncMock(return_value=final_state)

        def _capture_tools(
            model: Any,
            tools: Any,
            system_prompt: str,
            checkpointer: Any = None,
            interrupt_on: Any = None,
            **_kwargs: Any,
        ) -> Any:
            captured_tools.append(list(tools))
            return mock_graph

        with (
            patch("src.modules.agents.deepagent_bridge.create_deep_agent", side_effect=_capture_tools),
            patch("src.modules.agents.deepagent_bridge.get_saver", new_callable=AsyncMock),
            patch("src.modules.agents.deepagent_bridge._create_model", return_value=MagicMock()),
            patch("src.modules.agents.deepagent_bridge.resolve_system_prompt", return_value="system"),
            patch("src.modules.agents.deepagent_bridge.MemoryManager") as mock_mm,
        ):
            mock_mm.return_value.get_context = AsyncMock(return_value=[])
            mock_mm.return_value.close = AsyncMock()

            [e async for e in stream_with_deepagent(
                loaded, "thread-perm-1", "실행해줘", [safe_tool, danger_tool]
            )]

        assert len(captured_tools) == 1
        tool_names = [t.name for t in captured_tools[0]]
        assert "safe_tool" in tool_names
        assert "danger_tool" not in tool_names

    @staticmethod
    async def _async_iter(items):
        for item in items:
            yield item
