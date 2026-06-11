import asyncio
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from src.database.client import get_prisma
from src.modules.agents.agents_service import load_agent_with_deps
from src.modules.langgraph.graph_builder import build_graph, _create_model
from src.modules.langgraph.checkpoint_service import get_saver


async def invoke(team_id: str, thread_id: str, message: str) -> dict[str, Any]:
    prisma = get_prisma()
    team = await prisma.agentteam.find_unique(
        where={"id": team_id},
        include={"teamAgents": {"include": {"agent": True}, "orderBy": {"order": "asc"}}},
    )
    if not team:
        raise ValueError(f"Team not found: {team_id}")

    topology = team.topology

    if topology == "sequential":
        return await _sequential(team, thread_id, message)
    if topology == "parallel":
        return await _parallel(team, thread_id, message)
    if topology == "supervisor":
        return await _supervisor(team, thread_id, message)
    if topology == "swarm":
        return await _swarm(team, thread_id, message)
    raise ValueError(f"Unknown topology: {topology}")


async def _sequential(team: Any, thread_id: str, message: str) -> dict[str, Any]:
    current_message = message
    all_messages: list[dict[str, Any]] = []

    for team_agent in team.teamAgents:
        agent_id = team_agent.agentId
        loaded = await load_agent_with_deps(agent_id)
        if not loaded:
            continue

        from src.modules.langgraph.langgraph_service import invoke as lg_invoke

        result = await lg_invoke(
            agent_id=loaded["id"],
            agent_name=loaded["name"],
            architecture=loaded["architecture"],
            system_prompt=loaded["systemPrompt"],
            model_id=loaded["modelId"],
            provider_slug=loaded["providerSlug"],
            provider_api_key=loaded["providerApiKey"],
            tools=loaded["tools"],
            config=loaded["config"],
            thread_id=f"{thread_id}-{agent_id}",
            message=current_message,
        )
        msgs = result.get("messages", [])
        all_messages.extend(msgs)
        last = msgs[-1] if msgs else {}
        current_message = last.get("content", current_message)

    return {"messages": all_messages}


async def _parallel(team: Any, thread_id: str, message: str) -> dict[str, Any]:
    from src.modules.langgraph.langgraph_service import invoke as lg_invoke

    async def run_agent(team_agent: Any) -> tuple[str, list[dict[str, Any]]]:
        agent_id = team_agent.agentId
        loaded = await load_agent_with_deps(agent_id)
        if not loaded:
            return (agent_id, [])
        result = await lg_invoke(
            agent_id=loaded["id"],
            agent_name=loaded["name"],
            architecture=loaded["architecture"],
            system_prompt=loaded["systemPrompt"],
            model_id=loaded["modelId"],
            provider_slug=loaded["providerSlug"],
            provider_api_key=loaded["providerApiKey"],
            tools=loaded["tools"],
            config=loaded["config"],
            thread_id=f"{thread_id}-{agent_id}",
            message=message,
        )
        return (loaded["name"], result.get("messages", []))

    results = await asyncio.gather(*[run_agent(ta) for ta in team.teamAgents])

    combined_content = "\n\n".join(
        f"[{name}]: {msgs[-1]['content'] if msgs else ''}"
        for name, msgs in results
    )
    all_messages = [m for _, msgs in results for m in msgs]
    all_messages.append({"role": "assistant", "content": combined_content})
    return {"messages": all_messages}


async def _supervisor(team: Any, thread_id: str, message: str) -> dict[str, Any]:
    from langgraph.graph import StateGraph, START, END
    from src.modules.langgraph.state_types import AgentState

    supervisor_config = team.supervisorConfig or {}
    supervisor_model_id = supervisor_config.get("modelId", "gpt-4o")
    supervisor_provider = supervisor_config.get("providerSlug", "openai")
    supervisor_api_key = supervisor_config.get("apiKey")

    agent_names = [ta.agent.name for ta in team.teamAgents]
    worker_loaded = {
        ta.agentId: await load_agent_with_deps(ta.agentId) for ta in team.teamAgents
    }

    sup_model = _create_model(supervisor_provider, supervisor_api_key, supervisor_model_id, {})

    supervisor_prompt = (
        f"You are a supervisor coordinating these workers: {', '.join(agent_names)}.\n"
        "Decide which worker should act next, or reply FINISH if done.\n"
        "Reply with JSON: {\"next\": \"<worker_name_or_FINISH>\"}"
    )

    from src.modules.langgraph.langgraph_service import invoke as lg_invoke
    import json

    current_input = message
    all_messages: list[dict[str, Any]] = []
    max_steps = 10

    for _ in range(max_steps):
        sup_response = await sup_model.ainvoke(
            [SystemMessage(content=supervisor_prompt), HumanMessage(content=current_input)]
        )
        sup_content = sup_response.content if isinstance(sup_response.content, str) else ""
        try:
            decision = json.loads(sup_content)
            next_agent = decision.get("next", "FINISH")
        except Exception:
            next_agent = "FINISH"

        if next_agent == "FINISH":
            break

        worker_entry = next((ta for ta in team.teamAgents if ta.agent.name == next_agent), None)
        if not worker_entry:
            break

        loaded = worker_loaded.get(worker_entry.agentId)
        if not loaded:
            break

        result = await lg_invoke(
            agent_id=loaded["id"],
            agent_name=loaded["name"],
            architecture=loaded["architecture"],
            system_prompt=loaded["systemPrompt"],
            model_id=loaded["modelId"],
            provider_slug=loaded["providerSlug"],
            provider_api_key=loaded["providerApiKey"],
            tools=loaded["tools"],
            config=loaded["config"],
            thread_id=f"{thread_id}-{loaded['id']}",
            message=current_input,
        )
        msgs = result.get("messages", [])
        all_messages.extend(msgs)
        last = msgs[-1] if msgs else {}
        current_input = f"Worker {next_agent} responded: {last.get('content', '')}"

    return {"messages": all_messages}


async def _swarm(team: Any, thread_id: str, message: str) -> dict[str, Any]:
    from src.modules.langgraph.langgraph_service import invoke as lg_invoke

    max_handoffs = team.swarmConfig.get("maxHandoffs", 5) if team.swarmConfig else 5
    handoff_count = 0

    agent_map = {ta.agentId: ta for ta in team.teamAgents}
    current_agent_id = team.teamAgents[0].agentId if team.teamAgents else None
    current_message = message
    all_messages: list[dict[str, Any]] = []

    while current_agent_id and handoff_count < max_handoffs:
        loaded = await load_agent_with_deps(current_agent_id)
        if not loaded:
            break

        result = await lg_invoke(
            agent_id=loaded["id"],
            agent_name=loaded["name"],
            architecture=loaded["architecture"],
            system_prompt=loaded["systemPrompt"],
            model_id=loaded["modelId"],
            provider_slug=loaded["providerSlug"],
            provider_api_key=loaded["providerApiKey"],
            tools=loaded["tools"],
            config=loaded["config"],
            thread_id=f"{thread_id}-{current_agent_id}",
            message=current_message,
        )
        msgs = result.get("messages", [])
        all_messages.extend(msgs)

        # handoff_to_{name} 패턴 감지
        last = msgs[-1] if msgs else {}
        content = last.get("content", "")
        next_id = None
        for ta in team.teamAgents:
            if f"handoff_to_{ta.agent.name}" in content:
                next_id = ta.agentId
                break

        if not next_id:
            break

        current_agent_id = next_id
        current_message = content
        handoff_count += 1

    return {"messages": all_messages}
