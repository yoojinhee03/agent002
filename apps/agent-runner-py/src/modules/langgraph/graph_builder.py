import os
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

from src.modules.langgraph.state_types import AgentState
from src.modules.langgraph.checkpoint_service import get_saver


def _tool_calls_exist(state: AgentState) -> str:
    last = state["messages"][-1] if state["messages"] else None
    if last and hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END


async def build_graph(
    agent_id: str,
    agent_name: str,
    architecture: str,
    system_prompt: str,
    model_id: str,
    provider_slug: str,
    provider_api_key: str | None,
    tools: list[BaseTool],
    config: dict[str, Any],
):
    model = _create_model(provider_slug, provider_api_key, model_id, config)

    if architecture == "react":
        compiled = await _build_react_graph(model, tools)
    elif architecture == "tool_calling":
        compiled = await _build_tool_calling_graph(model, tools)
    elif architecture == "plan_execute":
        compiled = await _build_plan_execute_graph(model, tools, system_prompt)
    else:
        compiled = await _build_react_graph(model, tools)

    return compiled


async def _build_react_graph(model: BaseChatModel, tools: list[BaseTool]):
    model_with_tools = model.bind_tools(tools) if tools else model

    async def agent_node(state: AgentState):
        response = await model_with_tools.ainvoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_edge(START, "agent")

    if tools:
        tool_node = ToolNode(tools)
        graph.add_node("tools", tool_node)
        graph.add_conditional_edges("agent", _tool_calls_exist)
        graph.add_edge("tools", "agent")
    else:
        graph.add_edge("agent", END)

    checkpointer = await get_saver()
    return graph.compile(checkpointer=checkpointer)


async def _build_tool_calling_graph(model: BaseChatModel, tools: list[BaseTool]):
    model_with_tools = model.bind_tools(tools) if tools else model

    async def agent_node(state: AgentState):
        response = await model_with_tools.ainvoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_edge(START, "agent")

    if tools:
        tool_node = ToolNode(tools)
        graph.add_node("tools", tool_node)

        def route(state: AgentState) -> str:
            last = state["messages"][-1] if state["messages"] else None
            if last and hasattr(last, "tool_calls") and last.tool_calls:
                return "tools"
            return END

        graph.add_conditional_edges("agent", route)
        graph.add_edge("tools", END)
    else:
        graph.add_edge("agent", END)

    checkpointer = await get_saver()
    return graph.compile(checkpointer=checkpointer)


async def _build_plan_execute_graph(
    model: BaseChatModel,
    tools: list[BaseTool],
    system_prompt: str,
):
    import json

    model_with_tools = model.bind_tools(tools) if tools else model

    async def planner_node(state: AgentState):
        planner_prompt = (
            "You are a planning agent. Given the user's request, create a step-by-step plan.\n"
            "Return the plan as a JSON array of strings. Each string is one step.\n"
            "Only return the JSON array, nothing else.\n\n"
            + system_prompt
        )
        from langchain_core.messages import SystemMessage

        messages = [SystemMessage(content=planner_prompt)] + list(state["messages"])
        response = await model.ainvoke(messages)
        content = response.content if isinstance(response.content, str) else ""
        try:
            plan: list[str] = json.loads(content)
        except Exception:
            plan = [content or "Execute the request"]
        return {"plan": plan, "messages": [response]}

    async def executor_node(state: AgentState):
        from langchain_core.messages import HumanMessage, SystemMessage

        current_step = state["plan"][0] if state["plan"] else "Complete the task"
        remaining = state["plan"][1:]
        messages = (
            [SystemMessage(content=system_prompt)]
            + list(state["messages"])
            + [HumanMessage(content=f"Execute this step: {current_step}")]
        )
        response = await model_with_tools.ainvoke(messages)
        return {"messages": [response], "plan": remaining}

    def executor_route(state: AgentState) -> str:
        last = state["messages"][-1] if state["messages"] else None
        if last and hasattr(last, "tool_calls") and last.tool_calls:
            return "tools"
        if state["plan"]:
            return "executor"
        return END

    graph = StateGraph(AgentState)
    graph.add_node("planner", planner_node)
    graph.add_node("executor", executor_node)
    graph.add_edge(START, "planner")
    graph.add_edge("planner", "executor")

    if tools:
        tool_node = ToolNode(tools)
        graph.add_node("tools", tool_node)
        graph.add_conditional_edges("executor", executor_route)
        graph.add_edge("tools", "executor")
    else:
        graph.add_conditional_edges(
            "executor",
            lambda s: "executor" if s["plan"] else END,
        )

    checkpointer = await get_saver()
    return graph.compile(checkpointer=checkpointer)


def _create_model(
    provider_slug: str,
    provider_api_key: str | None,
    model_id: str,
    config: dict[str, Any],
) -> BaseChatModel:
    temperature: float = float(config.get("temperature", 0.7))
    max_tokens: int = int(config.get("maxTokens", 4096))

    resolved_api_key = (provider_api_key or "").strip()
    if not resolved_api_key:
        if provider_slug == "openai":
            resolved_api_key = os.getenv("OPENAI_API_KEY", "").strip()
        elif provider_slug == "anthropic":
            resolved_api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        elif provider_slug == "google":
            resolved_api_key = os.getenv("GOOGLE_API_KEY", "").strip()

    if provider_slug in ("openai", "anthropic", "google") and not resolved_api_key:
        raise RuntimeError(f"Provider API key is missing for provider '{provider_slug}'")

    # OpenAI 의 reasoning 시리즈(o1/o3/o4/o5...) 는 temperature 를 지원하지 않고 기본값(1)만
    # 허용한다. 해당 모델에는 temperature 인자를 아예 전달하지 않는다.
    mid_lower = (model_id or "").lower()
    is_openai_reasoning = mid_lower.startswith(("o1", "o3", "o4", "o5"))

    if provider_slug == "openai":
        if is_openai_reasoning:
            return ChatOpenAI(api_key=resolved_api_key, model=model_id, max_tokens=max_tokens, streaming=True)  # type: ignore[call-arg]
        # streaming=True 명시 — 일부 LangGraph 경로에서 default 가 False 로 잡혀 chunk emit 이
        # 안 되던 회귀 차단. astream_events 가 on_chat_model_stream 을 yield 하려면 필요.
        return ChatOpenAI(api_key=resolved_api_key, model=model_id, temperature=temperature, max_tokens=max_tokens, streaming=True)  # type: ignore[call-arg]
    if provider_slug == "anthropic":
        return ChatAnthropic(  # type: ignore[call-arg]
            api_key=resolved_api_key,
            model=model_id,
            temperature=temperature,
            max_tokens=max_tokens,
            # 병렬 도구 호출 비활성화 → 한 번에 하나씩만 호출하도록 강제
            # gmail_fetch 응답(_AGENT_INSTRUCTION)을 확인한 후에만 다음 도구를 결정
            model_kwargs={
                "tool_choice": {
                    "type": "auto",
                    "disable_parallel_tool_use": True,
                }
            },
        )
    if provider_slug == "google":
        return ChatGoogleGenerativeAI(google_api_key=resolved_api_key, model=model_id, temperature=temperature, max_output_tokens=max_tokens)  # type: ignore[call-arg]
    # 기본값: OpenAI 호환
    if is_openai_reasoning:
        return ChatOpenAI(api_key=resolved_api_key or os.getenv("OPENAI_API_KEY", "").strip(), model=model_id, max_tokens=max_tokens, streaming=True)  # type: ignore[call-arg]
    return ChatOpenAI(api_key=resolved_api_key or os.getenv("OPENAI_API_KEY", "").strip(), model=model_id, temperature=temperature, max_tokens=max_tokens, streaming=True)  # type: ignore[call-arg]
