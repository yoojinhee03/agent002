"""Phase 8-1 스파이크 — 공식 `create_deep_agent(subagents=[...])` + `astream_events v2` 중첩 이벤트 검증.

목적:
  8.0.1 최소 재현 + 이벤트 덤프
  8.0.2 `on_tool_start`(name=`task`) payload 에서 실제 sub-agent 이름 추출 가능 키 확인
  8.0.3 sub-agent 내부 `on_chat_model_stream` / `on_tool_start` 가 부모 스트림에 포함되는지 확인

접근:
  - `FakeMessagesListChatModel` 로 main agent → `task` 도구 호출(sub-agent 이름 지정) → 최종 응답
  - sub-agent 도 FakeMessagesListChatModel 로 별도 모델 주입 → 특정 tool 호출 + 응답
  - astream_events(version="v2") 결과를 JSON Lines 로 파일에 저장, grep 으로 분석

실행:
  uv run python spikes/subagent_astream_events_spike.py
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.tools import tool

from deepagents import create_deep_agent


class BindableFakeModel(FakeMessagesListChatModel):
    """`bind_tools` no-op 을 구현한 FakeMessagesListChatModel — create_deep_agent 요구사항 충족."""

    def bind_tools(self, tools, **_kwargs):
        return self


OUT_DIR = Path(__file__).parent / "output"
OUT_DIR.mkdir(exist_ok=True)
DUMP_PATH = OUT_DIR / "events.jsonl"


@tool
def get_weather(city: str) -> str:
    """도시의 현재 날씨를 반환한다."""
    return f"{city} is sunny, 22°C"


def build_main_model() -> BindableFakeModel:
    """Main agent 가 `task` 도구를 호출하도록 하는 fake 모델.

    첫 응답: `task` tool_call(subagent_type='weather-bot', description=...).
    두 번째 응답: sub-agent 결과를 받은 뒤 최종 텍스트.
    """
    return BindableFakeModel(
        responses=[
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "task",
                        "args": {
                            "description": "get weather in Seoul",
                            "subagent_type": "weather-bot",
                        },
                        "id": "call_task_1",
                    }
                ],
            ),
            AIMessage(content="Seoul weather delivered via sub-agent."),
        ]
    )


def build_sub_model() -> BindableFakeModel:
    """Sub-agent 가 `get_weather` 도구를 호출한 뒤 응답하도록 하는 fake 모델."""
    return BindableFakeModel(
        responses=[
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "get_weather",
                        "args": {"city": "Seoul"},
                        "id": "call_weather_1",
                    }
                ],
            ),
            AIMessage(content="Seoul is sunny, 22°C."),
        ]
    )


async def run() -> dict[str, Any]:
    main_model = build_main_model()
    sub_model = build_sub_model()

    graph = create_deep_agent(
        model=main_model,
        tools=[],
        system_prompt="You coordinate. Delegate weather queries to weather-bot via task().",
        subagents=[
            {
                "name": "weather-bot",
                "description": "Returns weather for a given city.",
                "system_prompt": "Use get_weather to answer.",
                "tools": [get_weather],
                "model": sub_model,
            }
        ],
        permissions=[],
    )

    stats = {
        "total_events": 0,
        "event_kinds": {},
        "task_tool_starts": [],
        "nested_tool_starts": [],
        "nested_chat_streams": 0,
        "max_parent_depth": 0,
    }

    with DUMP_PATH.open("w", encoding="utf-8") as fp:
        async for ev in graph.astream_events(
            {"messages": [HumanMessage(content="What is the weather in Seoul?")]},
            config={"configurable": {"thread_id": "spike-thread"}, "recursion_limit": 25},
            version="v2",
        ):
            stats["total_events"] += 1
            kind = ev.get("event", "?")
            stats["event_kinds"][kind] = stats["event_kinds"].get(kind, 0) + 1

            parent_ids = ev.get("parent_ids") or []
            stats["max_parent_depth"] = max(stats["max_parent_depth"], len(parent_ids))

            name = ev.get("name")
            if kind == "on_tool_start" and name == "task":
                stats["task_tool_starts"].append(
                    {
                        "run_id": ev.get("run_id"),
                        "parent_ids": parent_ids,
                        "input": ev.get("data", {}).get("input"),
                    }
                )
            elif kind == "on_tool_start" and parent_ids:
                stats["nested_tool_starts"].append(
                    {
                        "name": name,
                        "parent_ids": parent_ids,
                        "input": ev.get("data", {}).get("input"),
                    }
                )
            elif kind == "on_chat_model_stream" and parent_ids:
                stats["nested_chat_streams"] += 1

            dump_ev = {
                "event": kind,
                "name": name,
                "run_id": ev.get("run_id"),
                "parent_ids": parent_ids,
                "tags": ev.get("tags"),
                "data_keys": list(ev.get("data", {}).keys()),
                "data_input": ev.get("data", {}).get("input") if kind.endswith("_start") else None,
                "data_output_type": type(ev.get("data", {}).get("output")).__name__
                if ev.get("data", {}).get("output") is not None
                else None,
            }
            fp.write(json.dumps(dump_ev, ensure_ascii=False, default=str) + "\n")

    return stats


def main() -> None:
    stats = asyncio.run(run())
    print("=" * 60)
    print("Phase 8-1 스파이크 결과")
    print("=" * 60)
    print(f"Total events: {stats['total_events']}")
    print(f"Max parent_ids depth: {stats['max_parent_depth']}")
    print("\nEvent kind 분포:")
    for k, v in sorted(stats["event_kinds"].items(), key=lambda x: -x[1]):
        print(f"  {k:35s} {v}")
    print(f"\n`task` tool_start 발견: {len(stats['task_tool_starts'])}")
    for i, t in enumerate(stats["task_tool_starts"], 1):
        print(f"  [{i}] input={t['input']!r}")
    print(f"\n부모있는 nested tool_start: {len(stats['nested_tool_starts'])}")
    for i, t in enumerate(stats["nested_tool_starts"], 1):
        print(f"  [{i}] name={t['name']} parent_depth={len(t['parent_ids'])} input={t['input']!r}")
    print(f"\n부모있는 nested on_chat_model_stream 개수: {stats['nested_chat_streams']}")
    print(f"\n덤프 경로: {DUMP_PATH}")


if __name__ == "__main__":
    main()
