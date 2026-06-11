from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from langchain_core.messages import BaseMessage
from langchain_core.tools import BaseTool
from langgraph.types import Command

from src.modules.langgraph.graph_builder import build_graph
from src.modules.langgraph.prompt_resolver import resolve_system_prompt


def _map_role(msg: BaseMessage) -> str:
    t = msg.type
    mapping = {"human": "user", "ai": "assistant", "system": "system", "tool": "tool"}
    return mapping.get(t, "assistant")


def _serialize_messages(messages: list[BaseMessage]) -> list[dict[str, Any]]:
    result = []
    for msg in messages:
        content = msg.content if isinstance(msg.content, str) else str(msg.content)
        entry: dict[str, Any] = {
            "role": _map_role(msg),
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            entry["toolCalls"] = msg.tool_calls
        result.append(entry)
    return result


async def invoke(
    *,
    agent_id: str,
    agent_name: str,
    agent_slug: str = "",
    agent_type: str = "single",
    agent_description: str = "",
    architecture: str,
    system_prompt: str,
    model_id: str,
    provider_slug: str,
    provider_api_key: str | None,
    tools: list[BaseTool],
    config: dict[str, Any],
    planning_config: dict[str, Any] | None = None,
    reasoning_config: dict[str, Any] | None = None,
    guardrails_config: dict[str, Any] | None = None,
    sub_agent_names: list[str] | None = None,
    thread_id: str,
    message: str,
) -> dict[str, Any]:
    from langchain_core.messages import HumanMessage, SystemMessage

    compiled = await build_graph(
        agent_id, agent_name, architecture, system_prompt,
        model_id, provider_slug, provider_api_key, tools, config,
    )

    run_config = {"configurable": {"thread_id": thread_id}}
    state = await compiled.aget_state(run_config)
    history = state.values.get("messages", [])
    
    # 이미 시스템 메시지가 이력에 포함되어 있는지 확인
    has_system_msg = any(isinstance(m, SystemMessage) for m in history)

    new_messages = []
    if not history and not has_system_msg:
        resolved_prompt = resolve_system_prompt(
            system_prompt,
            agent_id=agent_id,
            agent_name=agent_name,
            agent_slug=agent_slug,
            agent_type=agent_type,
            agent_description=agent_description,
            architecture=architecture,
            model_id=model_id,
            user_message=message,
            tools=tools,
            planning_config=planning_config,
            reasoning_config=reasoning_config,
            guardrails_config=guardrails_config,
            sub_agent_names=sub_agent_names,
        )
        new_messages.append(SystemMessage(content=resolved_prompt))
    
    new_messages.append(HumanMessage(content=message))

    input_state = {
        "messages": new_messages,
        "plan": [],
        "tool_results": {},
        "human_input": None,
        "metadata": {},
        "current_agent": None,
    }

    result = await compiled.ainvoke(input_state, config=run_config)
    return {
        "messages": _serialize_messages(result["messages"]),
        "state": {
            "plan": result.get("plan", []),
            "tool_results": result.get("tool_results", {}),
            "metadata": result.get("metadata", {}),
        },
    }


async def stream(
    *,
    agent_id: str,
    agent_name: str,
    agent_slug: str = "",
    agent_type: str = "single",
    agent_description: str = "",
    architecture: str,
    system_prompt: str,
    model_id: str,
    provider_slug: str,
    provider_api_key: str | None,
    tools: list[BaseTool],
    config: dict[str, Any],
    planning_config: dict[str, Any] | None = None,
    reasoning_config: dict[str, Any] | None = None,
    guardrails_config: dict[str, Any] | None = None,
    sub_agent_names: list[str] | None = None,
    thread_id: str,
    message: str,
) -> AsyncGenerator[dict[str, Any], None]:
    from langchain_core.messages import HumanMessage, SystemMessage

    compiled = await build_graph(
        agent_id, agent_name, architecture, system_prompt,
        model_id, provider_slug, provider_api_key, tools, config,
    )

    run_config = {"configurable": {"thread_id": thread_id}}
    state = await compiled.aget_state(run_config)
    history = state.values.get("messages", [])
    
    # 이미 시스템 메시지가 이력에 포함되어 있는지 확인
    has_system_msg = any(isinstance(m, SystemMessage) for m in history)

    messages = []
    if not has_system_msg:
        resolved_prompt = resolve_system_prompt(
            system_prompt,
            agent_id=agent_id,
            agent_name=agent_name,
            agent_slug=agent_slug,
            agent_type=agent_type,
            agent_description=agent_description,
            architecture=architecture,
            model_id=model_id,
            user_message=message,
            tools=tools,
            planning_config=planning_config,
            reasoning_config=reasoning_config,
            guardrails_config=guardrails_config,
            sub_agent_names=sub_agent_names,
        )
        messages.append(SystemMessage(content=resolved_prompt))
    
    messages.append(HumanMessage(content=message))

    input_state = {
        "messages": messages,
        "plan": [],
        "tool_results": {},
        "human_input": None,
        "metadata": {},
        "current_agent": None,
    }

    async for chunk in compiled.astream(
        input_state, config=run_config, stream_mode=["updates", "messages"]
    ):
        mode, data = chunk
        if mode == "messages":
            msg_chunk, meta = data
            content = msg_chunk.content if isinstance(msg_chunk.content, str) else ""
            node = (meta or {}).get("langgraph_node", "")
            if content and node == "agent":
                yield {"event": "token", "data": {"token": content}}
        elif mode == "updates":
            for node_name, update in data.items():
                yield {
                    "event": "step.update",
                    "data": {
                        "node": node_name,
                        "update": update,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                }

    final_state = await compiled.aget_state(run_config)
    messages = _serialize_messages(final_state.values.get("messages", []))
    yield {
        "event": "run.completed",
        "data": {
            "messages": messages,
            "state": {
                "plan": final_state.values.get("plan", []),
                "tool_results": final_state.values.get("tool_results", {}),
                "metadata": final_state.values.get("metadata", {}),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    }


async def resume(
    *,
    agent_id: str,
    agent_name: str,
    architecture: str,
    system_prompt: str,
    model_id: str,
    provider_slug: str,
    provider_api_key: str | None,
    tools: list[BaseTool],
    config: dict[str, Any],
    thread_id: str,
    human_response: Any,
) -> dict[str, Any]:
    compiled = await build_graph(
        agent_id, agent_name, architecture, system_prompt,
        model_id, provider_slug, provider_api_key, tools, config,
    )

    result = await compiled.ainvoke(
        Command(resume=human_response),
        config={"configurable": {"thread_id": thread_id}},
    )
    return {
        "messages": _serialize_messages(result["messages"]),
        "state": {
            "plan": result.get("plan", []),
            "tool_results": result.get("tool_results", {}),
            "metadata": result.get("metadata", {}),
        },
    }


async def get_state(
    *,
    agent_id: str,
    agent_name: str,
    architecture: str,
    system_prompt: str,
    model_id: str,
    provider_slug: str,
    provider_api_key: str | None,
    tools: list[BaseTool],
    config: dict[str, Any],
    thread_id: str,
) -> dict[str, Any]:
    compiled = await build_graph(
        agent_id, agent_name, architecture, system_prompt,
        model_id, provider_slug, provider_api_key, tools, config,
    )

    run_config = {"configurable": {"thread_id": thread_id}}
    state = await compiled.aget_state(run_config)
    messages = _serialize_messages(state.values.get("messages", []))
    return {
        "messages": messages,
        "state": {
            "plan": state.values.get("plan", []),
            "tool_results": state.values.get("tool_results", {}),
            "metadata": state.values.get("metadata", {}),
        },
    }


async def get_messages_only(thread_id: str) -> dict[str, Any]:
    """LangGraph checkpoint 에서 메인 messages + sub-agent ns 의 todos 를 추출.

    반환:
        {
          "messages": [...],          # 메인 ns(='') 의 messages
          "subagentTodos": [          # 각 sub-agent ns(`tools:*`) 의 todos 채널 마지막 스냅샷
            {"namespace": "tools:...", "todos": [{"content": str, "status": str}, ...]},
            ...
          ]
        }

    부모-자식 deepagent 구조에서 `write_todos` 는 sub-agent ns 에서만 호출돼
    메인 ns 의 messages 에는 toolCall 이 남지 않는다. 그 결과 client history 가
    plan 을 복원하지 못하던 회귀를 해결하기 위해 sub-agent todos 도 함께 반환.

    이전엔 `build_graph(tools=...)` 를 거치며 매 호출마다 MCP stdio 서버를
    새로 spawn해서 thread 페이지 진입이 수 초씩 걸리는 회귀도 있었음. state 조회는
    checkpointer 단독으로 충분하므로 그래프 컴파일 자체를 건너뛴다.
    """
    from src.database.client import fetch_all
    from src.modules.langgraph.checkpoint_service import get_saver

    checkpointer = await get_saver()

    main_config = {"configurable": {"thread_id": thread_id}}
    snapshot = await checkpointer.aget_tuple(main_config)
    messages: list[dict[str, Any]] = []
    if snapshot is not None:
        channel_values = (snapshot.checkpoint or {}).get("channel_values") or {}
        messages = _serialize_messages(channel_values.get("messages", []))

    # LIKE 패턴의 `%` 는 psycopg3 placeholder(%s)와 충돌하므로 파라미터로 전달한다.
    # (raw SQL 에 `%` 를 박으면 _adapt 가 변환을 안 거쳐도 cursor.execute 가
    #  invalid placeholder 로 ProgrammingError 를 던진다.)
    ns_rows = await fetch_all(
        """
        SELECT DISTINCT checkpoint_ns
        FROM checkpoints
        WHERE thread_id = $1 AND checkpoint_ns LIKE $2
        ORDER BY checkpoint_ns
        """,
        (thread_id, "tools:%"),
    )
    subagent_todos: list[dict[str, Any]] = []
    for r in ns_rows:
        ns = r["checkpoint_ns"]
        sub_config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ns}}
        sub_snap = await checkpointer.aget_tuple(sub_config)
        if sub_snap is None:
            continue
        sub_values = (sub_snap.checkpoint or {}).get("channel_values") or {}
        todos_raw = sub_values.get("todos") or []
        if not todos_raw:
            continue
        serialized: list[dict[str, str]] = []
        for t in todos_raw:
            if isinstance(t, dict):
                content = t.get("content")
                status = t.get("status")
            else:
                content = getattr(t, "content", None)
                status = getattr(t, "status", None)
            if content:
                serialized.append({
                    "content": str(content),
                    "status": str(status or "pending"),
                })
        if serialized:
            subagent_todos.append({"namespace": ns, "todos": serialized})

    return {"messages": messages, "subagentTodos": subagent_todos}
