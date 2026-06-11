"""Agent Assistant 메타 에이전트가 호출하는 LangChain 도구 3종.

build_assistant_tools(thread_id, project_id, user_id, pending_ref) 팩토리가 클로저로
도구를 묶어 반환한다. propose_* 도구는 pending_ref(dict)에 누적된 노드를 저장하면서
WS 이벤트를 발행한다.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from langchain_core.tools import StructuredTool

from src.database.client import fetch_all
from src.modules.agent_assistant import assistant_gateway
from src.modules.agent_assistant.models import (
    PendingState,
    ProposedMainAgentArgs,
    ProposedSubAgentArgs,
)

logger = structlog.get_logger(__name__)


_VALID_ROLES = {"search", "analyze", "generate", "validate", "tool"}
_VALID_ARCHITECTURES = {"react", "plan_execute", "tool_calling", "custom_graph"}


async def _fetch_builtin_catalog(project_id: str) -> list[dict[str, Any]]:
    """Project 의 enabled_builtins 에 포함된 도구만 노출. (Tools 페이지 Built-in 탭에서
    사용자가 켠 도구만 Agent Assistant 가 추천 가능하도록 필터.)"""
    from src.modules.builtin_tools.builtin_tools_service import _build_all

    project_row = await fetch_all(
        "SELECT enabled_builtins FROM projects WHERE id = $1",
        (project_id,),
    )
    enabled_set = (
        set(project_row[0].get("enabled_builtins") or [])
        if project_row
        else set()
    )
    if not enabled_set:
        return []
    try:
        all_tools = _build_all(agent_id="assistant-catalog", thread_id="assistant-catalog")
    except Exception:  # noqa: BLE001
        logger.exception("builtin catalog build failed")
        return []
    return [
        {
            "id": name,
            "name": name,
            "description": (tool.description or "")[:240],
            "kind": "builtin",
        }
        for name, tool in sorted(all_tools.items())
        if name in enabled_set
    ]


async def _fetch_db_tools(project_id: str) -> list[dict[str, Any]]:
    """프로젝트에 등록된 HTTP/Code/Search 도구 카탈로그."""
    rows = await fetch_all(
        """
        SELECT id, name, description, slug
        FROM tools
        WHERE project_id = $1 AND enabled = true
        ORDER BY name ASC
        """,
        (project_id,),
    )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "description": (r.get("description") or "")[:240],
            "slug": r.get("slug"),
            "kind": "db",
        }
        for r in rows
    ]


async def _fetch_mcp_servers(project_id: str) -> list[dict[str, Any]]:
    # McpServer 는 `enabled` 컬럼이 없고 McpStatus enum (`disconnected`/`connecting`/
    # `connected`/`error`) 으로 상태를 관리한다. 사용 가능한(연결된) 서버만 노출.
    rows = await fetch_all(
        """
        SELECT id, name, transport, description, tools, exposed_tools
        FROM mcp_servers
        WHERE project_id = $1 AND status = 'connected'
        ORDER BY name ASC
        """,
        (project_id,),
    )
    servers: list[dict[str, Any]] = []
    for r in rows:
        raw_tools = r.get("tools")
        if isinstance(raw_tools, str):
            try:
                raw_tools = json.loads(raw_tools)
            except Exception:  # noqa: BLE001
                raw_tools = []
        exposed = set(r.get("exposed_tools") or [])
        tool_names = [
            t["name"]
            for t in (raw_tools or [])
            if isinstance(t, dict)
            and t.get("name")
            and (not exposed or t["name"] in exposed)
        ]
        servers.append(
            {
                "id": r["id"],
                "name": r["name"],
                "description": (r.get("description") or "")[:240],
                "transport": r.get("transport"),
                "kind": "mcp",
                "toolNames": tool_names,
            }
        )
    return servers


async def _fetch_skills(user_id: str | None) -> list[dict[str, Any]]:
    if not user_id:
        return []
    rows = await fetch_all(
        """
        SELECT id, name, description, allowed_tools
        FROM skills
        WHERE user_id = $1 AND enabled = true
        ORDER BY name ASC
        """,
        (user_id,),
    )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "description": (r.get("description") or "")[:240],
            "allowedTools": r.get("allowed_tools") or [],
            "kind": "skill",
        }
        for r in rows
    ]


def _main_position() -> dict[str, float]:
    return {"x": 400.0, "y": 200.0}


def _sub_position(index: int) -> dict[str, float]:
    return {"x": float(200 + (index % 4) * 280), "y": float(420 + (index // 4) * 180)}


def build_assistant_tools(
    thread_id: str,
    project_id: str,
    user_id: str | None,
    pending: PendingState,
) -> list[StructuredTool]:
    """thread/project별로 바인딩된 도구 묶음 반환."""

    async def list_available_tools() -> dict[str, Any]:
        """builtin·DB·MCP·skill 카탈로그를 한 번에 반환. 도구 spec에 정확한 id를 그대로 사용하라."""
        builtin = await _fetch_builtin_catalog(project_id)
        db_tools = await _fetch_db_tools(project_id)
        mcp = await _fetch_mcp_servers(project_id)
        skills = await _fetch_skills(user_id)
        logger.info(
            "assistant.tool list_available_tools",
            thread_id=thread_id,
            builtin_count=len(builtin),
            db_count=len(db_tools),
            mcp_count=len(mcp),
            skill_count=len(skills),
        )
        return {
            "builtin": builtin,
            "tools": db_tools,
            "mcp": mcp,
            "skills": skills,
        }

    async def propose_main_agent(
        agent_name: str,
        model_name: str,
        system_prompt: str,
        architecture: str = "react",
        is_supervisor: bool = False,
        builtin_tool_ids: list[str] | None = None,
        db_tool_ids: list[str] | None = None,
        mcp_server_ids: list[str] | None = None,
        skill_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        """Main agent 노드를 캔버스에 제안한다. 한 세션에서 1회만 호출 (재호출 시 덮어쓰기).

        builtin_tool_ids / db_tool_ids / mcp_server_ids / skill_ids 는 list_available_tools
        응답의 정확한 id 목록을 사용. 사용자 시나리오에 직접 매핑되는 것만 포함하라.
        """
        logger.info(
            "assistant.tool propose_main_agent",
            thread_id=thread_id,
            agent_name=agent_name,
            model_name=model_name,
            architecture=architecture,
            prompt_preview=(system_prompt or "")[:120],
            prompt_len=len(system_prompt or ""),
            builtin_tool_ids=builtin_tool_ids or [],
            db_tool_ids=db_tool_ids or [],
            mcp_server_ids=mcp_server_ids or [],
            skill_ids=skill_ids or [],
        )
        args = ProposedMainAgentArgs(
            agent_name=agent_name,
            model_name=model_name,
            system_prompt=system_prompt,
            architecture=architecture if architecture in _VALID_ARCHITECTURES else "react",
            is_supervisor=is_supervisor,
            builtin_tool_ids=builtin_tool_ids or [],
            db_tool_ids=db_tool_ids or [],
            mcp_server_ids=mcp_server_ids or [],
            skill_ids=skill_ids or [],
        )
        node_id = (pending.main_node or {}).get("id") or "main"
        node = {
            "id": node_id,
            "type": "mainAgent",
            "position": _main_position(),
            "data": {
                "agentName": args.agent_name,
                "architecture": args.architecture,
                "modelName": args.model_name,
                "systemPrompt": args.system_prompt,
                "builtinToolIds": args.builtin_tool_ids,
                "toolIds": args.db_tool_ids,
                "mcpServerIds": args.mcp_server_ids,
                "skillIds": args.skill_ids,
                "isSelected": False,
                "isSupervisor": args.is_supervisor,
                "status": "proposed",
                "proposed": True,
            },
        }
        pending.main_node = node
        # 기존 sub 노드들과 main을 잇는 엣지 재구성
        pending.edges = [
            {"id": f"e-main-{sub['id']}", "source": node_id, "target": sub["id"]}
            for sub in pending.sub_nodes
        ]
        await assistant_gateway.emit_node_proposed(thread_id, "main", node)
        return {"ok": True, "nodeId": node_id}

    async def propose_sub_agent(
        agent_name: str,
        role: str,
        model_name: str,
        system_prompt: str,
        tool_ids: list[str] | None = None,
        tool_names: list[str] | None = None,
    ) -> dict[str, Any]:
        """Sub agent 노드를 캔버스에 제안한다. 필요한 만큼 여러 번 호출 가능."""
        logger.info(
            "assistant.tool propose_sub_agent",
            thread_id=thread_id,
            agent_name=agent_name,
            role=role,
            model_name=model_name,
            tool_ids=tool_ids or [],
            prompt_len=len(system_prompt or ""),
        )
        args = ProposedSubAgentArgs(
            agent_name=agent_name,
            role=role if role in _VALID_ROLES else "tool",
            model_name=model_name,
            system_prompt=system_prompt,
            tool_ids=tool_ids or [],
            tool_names=tool_names or [],
        )
        node_id = f"sub-{uuid.uuid4().hex[:8]}"
        index = len(pending.sub_nodes)
        node = {
            "id": node_id,
            "type": "subAgent",
            "position": _sub_position(index),
            "data": {
                "agentName": args.agent_name,
                "role": args.role,
                "modelName": args.model_name,
                "systemPrompt": args.system_prompt,
                "toolIds": args.tool_ids,
                "toolNames": args.tool_names,
                "status": "proposed",
                "proposed": True,
            },
        }
        pending.sub_nodes.append(node)
        if pending.main_node:
            pending.edges.append(
                {
                    "id": f"e-main-{node_id}",
                    "source": pending.main_node["id"],
                    "target": node_id,
                }
            )
        await assistant_gateway.emit_node_proposed(thread_id, "sub", node)
        return {"ok": True, "nodeId": node_id}

    return [
        StructuredTool.from_function(
            coroutine=list_available_tools,
            name="list_available_tools",
            description=(
                "사용 가능한 builtin 도구·HTTP 도구·MCP 서버·Skill 카탈로그를 조회한다. "
                "시나리오를 받은 직후 반드시 한 번 호출하여 정확한 도구 id 목록을 확보하라."
            ),
        ),
        StructuredTool.from_function(
            coroutine=propose_main_agent,
            name="propose_main_agent",
            description=(
                "Main agent 노드를 캔버스에 제안한다. "
                "architecture는 react|plan_execute|tool_calling|custom_graph 중 하나. "
                "한 세션에서 1회만 호출하며, 재호출 시 기존 main 노드를 덮어쓴다."
            ),
        ),
        StructuredTool.from_function(
            coroutine=propose_sub_agent,
            name="propose_sub_agent",
            description=(
                "Sub agent 노드를 캔버스에 제안한다. "
                "role은 search|analyze|generate|validate|tool 중 하나. "
                "tool_ids는 list_available_tools 응답에 등장한 정확한 id만 사용한다."
            ),
        ),
    ]
