"""Phase 8 단위 테스트 — 공식 SubAgent 미들웨어 전환.

테스트 항목 (plan §4 Phase 8-3):
  8.11 build_subagents — spec 리스트 → deepagents subagents dict 리스트 변환
  8.12 이벤트 어댑터 task 이름 매핑 — on_tool_start/end/error 에서 subagent_type → step.* 이벤트
"""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel


class _BindableFakeModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **_kwargs):
        return self


def _fake_model_factory(*_args, **_kwargs) -> _BindableFakeModel:
    from langchain_core.messages import AIMessage
    return _BindableFakeModel(responses=[AIMessage(content="done")])


# ─────────────────────────────────────────────────────────────
# 8.11 build_subagents
# ─────────────────────────────────────────────────────────────


class TestBuildSubagents:
    def test_returns_empty_for_none_or_empty(self):
        from src.modules.agents.deepagent_bridge import build_subagents
        assert build_subagents(None) == []
        assert build_subagents([]) == []

    @patch("src.modules.agents.deepagent_bridge._create_model", side_effect=_fake_model_factory)
    def test_converts_spec_to_subagent_dict(self, _mock_create):
        from src.modules.agents.deepagent_bridge import build_subagents

        specs: list[dict[str, Any]] = [
            {
                "id": "sub-1",
                "name": "Weather Bot",
                "slug": "weather",
                "description": "Weather lookup",
                "systemPrompt": "Use get_weather",
                "modelId": "claude-sonnet-4-5",
                "providerSlug": "anthropic",
                "providerApiKey": None,
                "config": {},
                "guardrailsConfig": {},
                "hitlPolicy": {},
                "tools": [],
            }
        ]

        result = build_subagents(specs)
        assert len(result) == 1
        sub = result[0]
        assert sub["name"] == "weather"
        assert sub["description"] == "Weather lookup"
        assert sub["system_prompt"] == "Use get_weather"
        assert sub["tools"] == []
        assert sub["model"] is not None
        assert "interrupt_on" not in sub  # empty hitlPolicy → 포함되지 않음

    @patch("src.modules.agents.deepagent_bridge._create_model", side_effect=_fake_model_factory)
    def test_hitl_policy_converts_to_interrupt_on(self, _mock_create):
        from src.modules.agents.deepagent_bridge import build_subagents

        specs = [{
            "id": "sub-1",
            "name": "Bot",
            "slug": "bot",
            "description": "d",
            "systemPrompt": "",
            "modelId": "x",
            "providerSlug": "openai",
            "providerApiKey": None,
            "config": {},
            "hitlPolicy": {"tools": [{"toolName": "send_email"}, {"toolName": "delete_file"}]},
            "tools": [],
        }]
        result = build_subagents(specs)
        assert result[0]["interrupt_on"] == {"send_email": True, "delete_file": True}

    @patch("src.modules.agents.deepagent_bridge._create_model", side_effect=_fake_model_factory)
    def test_multiple_specs_preserve_order(self, _mock_create):
        from src.modules.agents.deepagent_bridge import build_subagents

        specs = [
            {
                "id": "a", "name": "A", "slug": "a", "description": "", "systemPrompt": "",
                "modelId": "m", "providerSlug": "openai", "providerApiKey": None,
                "config": {}, "hitlPolicy": {}, "tools": [],
            },
            {
                "id": "b", "name": "B", "slug": "b", "description": "", "systemPrompt": "",
                "modelId": "m", "providerSlug": "openai", "providerApiKey": None,
                "config": {}, "hitlPolicy": {}, "tools": [],
            },
        ]
        result = build_subagents(specs)
        assert [s["name"] for s in result] == ["a", "b"]

    @patch("src.modules.agents.deepagent_bridge._create_model", side_effect=RuntimeError("model build failed"))
    def test_skips_spec_when_model_creation_fails(self, _mock_create):
        from src.modules.agents.deepagent_bridge import build_subagents

        specs = [{
            "id": "bad", "name": "Bad", "slug": "bad", "description": "", "systemPrompt": "",
            "modelId": "x", "providerSlug": "openai", "providerApiKey": None,
            "config": {}, "hitlPolicy": {}, "tools": [],
        }]
        assert build_subagents(specs) == []


# ─────────────────────────────────────────────────────────────
# 8.12 이벤트 어댑터 — `task` 도구 이름 매핑
# ─────────────────────────────────────────────────────────────


class TestTaskEventMapping:
    def test_subagent_name_extracted_from_subagent_type(self):
        from src.modules.agents.deepagent_bridge import _task_subagent_name_from_input
        assert _task_subagent_name_from_input({"subagent_type": "weather-bot"}) == "weather-bot"

    def test_subagent_name_fallback_to_name_key(self):
        from src.modules.agents.deepagent_bridge import _task_subagent_name_from_input
        assert _task_subagent_name_from_input({"name": "helper"}) == "helper"

    def test_subagent_name_default_when_missing(self):
        from src.modules.agents.deepagent_bridge import _task_subagent_name_from_input
        assert _task_subagent_name_from_input({}) == "sub-agent"
        assert _task_subagent_name_from_input(None) == "sub-agent"
        assert _task_subagent_name_from_input("not a dict") == "sub-agent"


# ─────────────────────────────────────────────────────────────
# 8-D5 hitlPolicy → interrupt_on 단독 유닛
# ─────────────────────────────────────────────────────────────


class TestHitlPolicyToInterruptOn:
    def test_empty(self):
        from src.modules.agents.deepagent_bridge import _hitl_policy_to_interrupt_on
        assert _hitl_policy_to_interrupt_on({}) == {}
        assert _hitl_policy_to_interrupt_on({"tools": []}) == {}

    def test_ignores_non_list_tools(self):
        from src.modules.agents.deepagent_bridge import _hitl_policy_to_interrupt_on
        assert _hitl_policy_to_interrupt_on({"tools": "not a list"}) == {}

    def test_ignores_entries_without_tool_name(self):
        from src.modules.agents.deepagent_bridge import _hitl_policy_to_interrupt_on
        result = _hitl_policy_to_interrupt_on({
            "tools": [{"toolName": "send"}, {"other": "x"}, "invalid"]
        })
        assert result == {"send": True}
