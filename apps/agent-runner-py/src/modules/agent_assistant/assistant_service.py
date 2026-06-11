"""Agent Assistant 서비스 — thread 세션 생성 + 메타 에이전트 단일 호출.

설계: deepagents react 루프 + tool calling 방식을 폐기하고, LangChain 의
`with_structured_output(AgentDesign)` 단일 호출로 사용자 시나리오 → 완전한 agent 설계를 한 번에
받는다. 카탈로그는 백엔드가 prefetch 해서 system prompt 에 직접 주입 (LLM 이 tool 호출로 가져올
필요 없음). 이로써 비용↓ + 인자 누락 회귀↓ + 도구·skill 운반 보장.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from typing import Any

import structlog
from langchain_core.messages import HumanMessage, SystemMessage

from src.database.client import execute, fetch_all, fetch_one
from src.modules.agent_assistant import assistant_gateway
from src.modules.agent_assistant.assistant_prompt import build_system_prompt
from src.modules.agent_assistant.models import (
    AssistantResponse,
    CreateSessionResponse,
    PendingState,
    SkillDesign,
)
from src.modules.hitl.hitl_gateway import (
    emit_agent_token,
    emit_error,
    emit_turn_completed,
    emit_turn_started,
)
from src.modules.langgraph.graph_builder import _create_model
from src.modules.threads import threads_service

logger = structlog.get_logger(__name__)


_DEFAULT_MODEL_ID = os.getenv("ASSISTANT_DEFAULT_MODEL", "gpt-5.4")
_DEFAULT_PROVIDER_SLUG = "openai"
# designer.ainvoke (structured-output 단일 호출) 타임아웃. 미설정 시 90s.
# LLM 응답이 영영 안 올 때 무한 대기로 프런트 isStreaming 이 풀리지 않던 회귀 방지.
_ASSISTANT_LLM_TIMEOUT_S = float(os.getenv("ASSISTANT_LLM_TIMEOUT_S", "90"))

# 세션별 pending state — assistant 메타 에이전트가 propose_* 도구를 호출하면서 누적
_pending_by_thread: dict[str, PendingState] = {}


def _split_model(model: str | None) -> tuple[str, str]:
    """`provider:modelId` 형식 또는 단순 modelId 형식을 (slug, model_id) 로 분해."""
    if not model:
        return _DEFAULT_PROVIDER_SLUG, _DEFAULT_MODEL_ID
    if ":" in model:
        slug, mid = model.split(":", 1)
        slug = slug.strip().lower() or _DEFAULT_PROVIDER_SLUG
        mid = mid.strip() or _DEFAULT_MODEL_ID
        return slug, mid
    # slug 추론
    mid = model.strip()
    if mid.startswith("claude"):
        return "anthropic", mid
    if mid.startswith("gemini"):
        return "google", mid
    return "openai", mid


async def _resolve_provider_api_key(slug: str, user_credentials: dict[str, str] | None) -> str | None:
    """user_credentials > providers 테이블 fallback."""
    if user_credentials:
        key = user_credentials.get(f"provider:{slug}")
        if key:
            return key
    row = await fetch_one(
        "SELECT api_key_encrypted FROM providers WHERE slug = $1 LIMIT 1",
        (slug,),
    )
    if row and row.get("api_key_encrypted"):
        return row["api_key_encrypted"]
    # 환경변수 fallback
    env_key = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "google": "GOOGLE_API_KEY",
    }.get(slug)
    if env_key:
        return os.getenv(env_key) or None
    return None


async def _prefetch_catalog(project_id: str, user_id: str | None) -> dict[str, list[dict[str, str]]]:
    """LLM 이 tool 호출로 가져오는 대신, 백엔드가 builtin/db/mcp/skill/model 카탈로그를
    한 번에 조회해 system_prompt 에 주입할 수 있도록 정리한다.
    """
    # builtin
    try:
        from src.modules.builtin_tools.builtin_tools_service import _build_all

        builtin_tools_dict = _build_all(
            agent_id="assistant-catalog", thread_id="assistant-catalog"
        )
        builtin = [
            {
                "id": name,
                "name": name,
                "description": (tool.description or "")[:160],
            }
            for name, tool in sorted(builtin_tools_dict.items())
        ]
    except Exception:  # noqa: BLE001
        logger.exception("assistant.catalog builtin build failed")
        builtin = []

    # DB tools (project scope)
    try:
        rows = await fetch_all(
            """
            SELECT id, name, description, slug
            FROM tools
            WHERE project_id = $1 AND enabled = true
            ORDER BY name ASC
            """,
            (project_id,),
        )
        db_tools = [
            {
                "id": r["id"],
                "name": r["name"],
                "description": (r.get("description") or "")[:160],
            }
            for r in rows
        ]
    except Exception:  # noqa: BLE001
        logger.exception("assistant.catalog db tools failed")
        db_tools = []

    # MCP servers (connected only)
    try:
        rows = await fetch_all(
            """
            SELECT id, name, description
            FROM mcp_servers
            WHERE project_id = $1 AND status = 'connected'
            ORDER BY name ASC
            """,
            (project_id,),
        )
        mcp = [
            {
                "id": r["id"],
                "name": r["name"],
                "description": (r.get("description") or "")[:160],
            }
            for r in rows
        ]
    except Exception:  # noqa: BLE001
        logger.exception("assistant.catalog mcp failed")
        mcp = []

    # Skills (user scope)
    skills: list[dict[str, str]] = []
    if user_id:
        try:
            rows = await fetch_all(
                """
                SELECT id, name, description
                FROM skills
                WHERE user_id = $1
                ORDER BY name ASC
                """,
                (user_id,),
            )
            skills = [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "description": (r.get("description") or "")[:160],
                }
                for r in rows
            ]
        except Exception:  # noqa: BLE001
            logger.exception("assistant.catalog skills failed")

    # Models (enabled)
    try:
        rows = await fetch_all(
            """
            SELECT m.model_id AS id, m.name, p.slug AS provider_slug
            FROM models m JOIN providers p ON p.id = m.provider_id
            WHERE m.enabled = true
            ORDER BY p.slug, m.model_id
            """,
            (),
        )
        models = [
            {
                "id": r["id"],
                "name": r["name"],
                "description": f"provider={r.get('provider_slug')}",
            }
            for r in rows
        ]
    except Exception:  # noqa: BLE001
        logger.exception("assistant.catalog models failed")
        models = []

    logger.info(
        "assistant.catalog prefetched",
        builtin=len(builtin),
        db=len(db_tools),
        mcp=len(mcp),
        skills=len(skills),
        models=len(models),
    )
    return {
        "builtin": builtin,
        "tools": db_tools,
        "mcp": mcp,
        "skills": skills,
        "models": models,
    }


def _main_position() -> dict[str, float]:
    return {"x": 400.0, "y": 200.0}


def _sub_position(index: int) -> dict[str, float]:
    return {"x": float(200 + (index % 4) * 280), "y": float(420 + (index // 4) * 180)}


async def _create_skills_in_db(
    designs: list[SkillDesign] | None,
    user_id: str | None,
) -> tuple[list[str], list[dict[str, str]]]:
    """SkillDesign 목록을 받아 skills 테이블에 INSERT 하고 새 id 들을 반환.

    skill 은 user-scoped 이므로 user_id 가 없으면 생성 불가. 그 경우 빈 결과 반환.
    반환: (생성된 id 리스트, 사용자 안내용 metadata 리스트). metadata 는 결과 메시지에
    어떤 skill 이 새로 만들어졌는지 보여줄 때 사용.
    """
    if not designs or not user_id:
        return [], []
    created_ids: list[str] = []
    created_meta: list[dict[str, str]] = []
    for d in designs:
        sid = str(uuid.uuid4())
        try:
            await execute(
                """
                INSERT INTO skills
                  (id, user_id, name, description, instructions, allowed_tools, enabled, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                """,
                (sid, user_id, d.name, d.description, d.instructions, [], True),
            )
            created_ids.append(sid)
            created_meta.append({"id": sid, "name": d.name})
            logger.info(
                "assistant.skill created",
                skill_id=sid, skill_name=d.name, user_id=user_id,
            )
        except Exception as exc:  # noqa: BLE001
            # name 충돌 등으로 실패해도 전체 흐름은 진행 — 사용자에게 누락 안내.
            logger.warning(
                "assistant.skill create failed",
                skill_name=d.name, error=str(exc),
            )
    return created_ids, created_meta


async def _load_target_agent_state(agent_id: str) -> dict[str, Any] | None:
    """edit_agent / answer_directly 분기에서 LLM 이 참조할 현재 agent 상태."""
    row = await fetch_one(
        """
        SELECT id, name, architecture, model_id, system_prompt,
               builtin_tool_ids, tool_ids, mcp_server_ids, skill_ids,
               mcp_tool_refs, tool_permissions
        FROM agents WHERE id = $1 LIMIT 1
        """,
        (agent_id,),
    )
    if not row:
        return None
    mcp_tool_refs = row.get("mcp_tool_refs")
    if isinstance(mcp_tool_refs, str):
        try:
            mcp_tool_refs = json.loads(mcp_tool_refs)
        except Exception:  # noqa: BLE001
            mcp_tool_refs = []
    tool_permissions = row.get("tool_permissions")
    if isinstance(tool_permissions, str):
        try:
            tool_permissions = json.loads(tool_permissions)
        except Exception:  # noqa: BLE001
            tool_permissions = {}
    return {
        "id": row["id"],
        "name": row.get("name"),
        "architecture": row.get("architecture"),
        "model_id": row.get("model_id"),
        "system_prompt": row.get("system_prompt"),
        "builtin_tool_ids": list(row.get("builtin_tool_ids") or []),
        "tool_ids": list(row.get("tool_ids") or []),
        "mcp_server_ids": list(row.get("mcp_server_ids") or []),
        "skill_ids": list(row.get("skill_ids") or []),
        "mcp_tool_refs": list(mcp_tool_refs or []),
        "tool_permissions": dict(tool_permissions or {}),
    }


async def _load_target_graph_summary(agent_id: str) -> str:
    row = await fetch_one(
        "SELECT name, graph_definition FROM agents WHERE id = $1 LIMIT 1",
        (agent_id,),
    )
    if not row:
        return "(대상 agent를 찾을 수 없음 — 새로 설계)"
    gd = row.get("graph_definition") or {}
    nodes = gd.get("nodes") or []
    if not nodes:
        return f"대상 agent: {row.get('name')} — 캔버스 비어 있음 (새로 설계)"
    summary_parts: list[str] = [f"대상 agent: {row.get('name')} — 기존 노드 {len(nodes)}개"]
    for n in nodes[:8]:
        ntype = n.get("type") or "?"
        data = n.get("data") or {}
        nm = data.get("agentName") or data.get("name") or n.get("id")
        summary_parts.append(f"  · [{ntype}] {nm}")
    return "\n".join(summary_parts)


async def _load_project_tool_maps(
    project_id: str,
) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, Any]]]:
    """권한 편집 시 LLM 에 정확한 도구 이름을 보여주기 위한 프로젝트 단위 도구 맵.

    반환: (db_tool_map, mcp_server_map)
      - db_tool_map: tool_id -> {name, description}
      - mcp_server_map: server_id -> {name, tools: [{name, description}], exposedTools: [...]}
        tools 는 mcp_servers.tools 캐시(JSON)에서 읽는다 (라이브 연결 없음).
    """
    db_tool_map: dict[str, dict[str, str]] = {}
    mcp_server_map: dict[str, dict[str, Any]] = {}
    try:
        rows = await fetch_all(
            "SELECT id, name, description FROM tools WHERE project_id = $1",
            (project_id,),
        )
        for r in rows:
            db_tool_map[r["id"]] = {
                "name": r.get("name") or r["id"],
                "description": (r.get("description") or "")[:160],
            }
    except Exception:  # noqa: BLE001
        logger.exception("assistant.tool_maps db tools failed")
    try:
        rows = await fetch_all(
            "SELECT id, name, tools, exposed_tools FROM mcp_servers WHERE project_id = $1",
            (project_id,),
        )
        for r in rows:
            raw_tools = r.get("tools")
            if isinstance(raw_tools, str):
                try:
                    raw_tools = json.loads(raw_tools)
                except Exception:  # noqa: BLE001
                    raw_tools = []
            tools = [
                {
                    "name": t.get("name"),
                    "description": (t.get("description") or "")[:160],
                }
                for t in (raw_tools or [])
                if isinstance(t, dict) and t.get("name")
            ]
            mcp_server_map[r["id"]] = {
                "name": r.get("name") or r["id"],
                "tools": tools,
                "exposedTools": list(r.get("exposed_tools") or []),
            }
    except Exception:  # noqa: BLE001
        logger.exception("assistant.tool_maps mcp servers failed")
    return db_tool_map, mcp_server_map


def _resolve_agent_tool_details(
    data: dict[str, Any],
    builtin_desc: dict[str, str],
    db_tool_map: dict[str, dict[str, str]],
    mcp_server_map: dict[str, dict[str, Any]],
) -> list[dict[str, str]]:
    """agent/sub-agent 의 도구 설정을 (key, label, description) 목록으로 해석.

    toolPermissions 의 *키 규약* 은 도구 종류별로 다르다 (수동 UI/저장과 동일하게 맞춘다):
      - builtin: key = builtin id (id == 런타임 tool name)
      - DB(HTTP/Code): key = tool id (수동 UI 가 tool id 로 저장)
      - MCP: key = 도구 name (런타임 tool name)
    `key` 가 실제 정책 dict 의 키이고, `label` 은 LLM 이 도구를 식별/추론하기 위한 사람용 이름이다.
    """
    details: list[dict[str, str]] = []
    seen: set[str] = set()

    def _add(key: str | None, label: str, description: str) -> None:
        if not key or key in seen:
            return
        seen.add(key)
        details.append({"key": key, "label": label or key, "description": description})

    for bid in data.get("builtinToolIds") or []:
        _add(bid, bid, builtin_desc.get(bid, "builtin tool"))
    for tid in data.get("toolIds") or []:
        meta = db_tool_map.get(tid)
        if meta:
            _add(tid, meta["name"], meta["description"])
    refs = data.get("mcpToolRefs") or []
    if refs:
        for ref in refs:
            if not isinstance(ref, dict):
                continue
            server = mcp_server_map.get(ref.get("serverId"))
            tname = ref.get("toolName")
            desc = ""
            if server:
                for t in server["tools"]:
                    if t["name"] == tname:
                        desc = t["description"]
                        break
            _add(tname, tname or "", desc or "MCP tool")
    else:
        for sid in data.get("mcpServerIds") or []:
            server = mcp_server_map.get(sid)
            if not server:
                continue
            exposed = set(server["exposedTools"])
            for t in server["tools"]:
                if exposed and t["name"] not in exposed:
                    continue
                _add(t["name"], t["name"], t["description"] or "MCP tool")
    return details


async def _load_target_subagents(
    agent_id: str,
    builtin_desc: dict[str, str],
    db_tool_map: dict[str, dict[str, str]],
    mcp_server_map: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """대상 agent 의 graph_definition 에서 sub-agent 노드 + 각 노드의 도구 이름/현재 정책 추출.

    LLM 이 sub_agent_permissions 를 정확한 sub-agent 이름·도구 이름으로 채우도록 한다.
    """
    row = await fetch_one(
        "SELECT graph_definition FROM agents WHERE id = $1 LIMIT 1",
        (agent_id,),
    )
    if not row:
        return []
    gd = row.get("graph_definition") or {}
    if isinstance(gd, str):
        try:
            gd = json.loads(gd)
        except Exception:  # noqa: BLE001
            gd = {}
    nodes = gd.get("nodes") or []
    result: list[dict[str, Any]] = []
    for n in nodes:
        # 저장된 graph_definition 노드는 type 을 포함하지 않는다 (프런트가 로드 시 'subAgent' 를
        # 부여). graph_definition.nodes 에는 sub-agent 만 직렬화되므로(main 제외) main 만 거른다.
        if (n.get("type") or "") == "mainAgent" or n.get("id") == "main":
            continue
        data = n.get("data") or {}
        result.append(
            {
                "id": n.get("id"),
                "agentName": data.get("agentName") or data.get("name") or n.get("id"),
                "tools": _resolve_agent_tool_details(
                    data, builtin_desc, db_tool_map, mcp_server_map
                ),
                "toolPermissions": data.get("toolPermissions") or {},
            }
        )
    return result


async def create_session(
    project_id: str,
    agent_id: str,
    user_id: str | None = None,
    model: str | None = None,
) -> CreateSessionResponse:
    slug, model_id = _split_model(model)
    metadata = {
        "kind": "assistant",
        "targetAgentId": agent_id,
        "model": f"{slug}:{model_id}",
    }
    thread = await threads_service.create(
        project_id=project_id,
        agent_id=agent_id,
        title="Agent Assistant Session",
        user_id=user_id,
        metadata=metadata,
    )
    _pending_by_thread[thread["id"]] = PendingState()
    return CreateSessionResponse(
        threadId=thread["id"],
        targetAgentId=agent_id,
        model=f"{slug}:{model_id}",
    )


async def _get_session_context(thread_id: str) -> dict[str, Any]:
    thread = await threads_service.get(thread_id)
    metadata = thread.get("metadata") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:  # noqa: BLE001
            metadata = {}
    if metadata.get("kind") != "assistant":
        raise ValueError(f"Thread {thread_id} is not an assistant session")
    return {
        "projectId": thread["projectId"],
        "targetAgentId": metadata.get("targetAgentId") or thread.get("agentId"),
        "model": metadata.get("model"),
    }


async def stream(
    thread_id: str,
    user_message: str,
    user_credentials: dict[str, str] | None = None,
    user_id: str | None = None,
) -> None:
    """메타 에이전트 1턴 실행. 토큰/노드 emit은 모두 WS 룸으로 발행."""
    turn_id = f"assistant-{uuid.uuid4().hex[:10]}"
    logger.info("assistant.stream begin", thread_id=thread_id, turn_id=turn_id)
    try:
        ctx = await _get_session_context(thread_id)
    except Exception as e:  # noqa: BLE001
        logger.exception("assistant.session lookup failed", thread_id=thread_id)
        await emit_error(thread_id, f"assistant 세션 조회 실패: {e}", "assistant_session_missing")
        return

    project_id = ctx["projectId"]
    target_agent_id = ctx["targetAgentId"]
    model = ctx["model"]
    logger.info(
        "assistant.stream ctx loaded",
        thread_id=thread_id,
        project_id=project_id,
        target_agent_id=target_agent_id,
        model=model,
    )

    if not target_agent_id:
        logger.warning("assistant.stream missing target_agent_id", thread_id=thread_id)
        await emit_error(thread_id, "대상 agent 정보가 없습니다", "assistant_target_missing")
        return

    slug, model_id = _split_model(model)
    logger.info("assistant.stream model split", slug=slug, model_id=model_id)
    api_key = await _resolve_provider_api_key(slug, user_credentials)
    if not api_key:
        logger.warning(
            "assistant.stream credential missing",
            slug=slug,
            cred_keys=list((user_credentials or {}).keys()),
        )
        await emit_error(
            thread_id,
            f"{slug} provider 자격증명이 등록되어 있지 않습니다. 도구 관리에서 등록해 주세요.",
            "credential_missing",
        )
        return

    pending = _pending_by_thread.setdefault(thread_id, PendingState())
    graph_summary = await _load_target_graph_summary(target_agent_id)
    target_agent_state = await _load_target_agent_state(target_agent_id)

    # 1) 카탈로그 prefetch — LLM 이 tool 로 가져올 필요 없음 (비용·회귀 둘 다 절감)
    await assistant_gateway.emit_step(
        thread_id, phase="thinking", label="사용 가능한 도구 카탈로그 조회 중…"
    )
    catalog = await _prefetch_catalog(project_id, user_id)

    # 1-b) 권한 편집(toolPermissions/HITL) 을 위해 main/sub 도구 *이름* 상세를 해석.
    builtin_desc = {b["id"]: b.get("description") or "" for b in (catalog.get("builtin") or [])}
    db_tool_map, mcp_server_map = await _load_project_tool_maps(project_id)
    subagents_detail = await _load_target_subagents(
        target_agent_id, builtin_desc, db_tool_map, mcp_server_map
    )
    main_tools_detail: list[dict[str, str]] = []
    if target_agent_state:
        main_tools_detail = _resolve_agent_tool_details(
            {
                "builtinToolIds": target_agent_state.get("builtin_tool_ids"),
                "toolIds": target_agent_state.get("tool_ids"),
                "mcpServerIds": target_agent_state.get("mcp_server_ids"),
                "mcpToolRefs": target_agent_state.get("mcp_tool_refs"),
            },
            builtin_desc,
            db_tool_map,
            mcp_server_map,
        )

    # 2) 사용자 메시지를 chat_history 에 누적
    pending.chat_history.append({"role": "user", "content": user_message})
    pending.user_turn_count += 1

    # 3) Assistant 용 시스템 프롬프트 생성 (5가지 action + target agent 상태 + 도구 상세 포함)
    system_prompt = build_system_prompt(
        catalog=catalog,
        session_model_id=model_id,
        current_graph_summary=graph_summary,
        chat_history=pending.chat_history,
        target_agent=target_agent_state,
        main_tools_detail=main_tools_detail,
        subagents_detail=subagents_detail,
    )

    # OpenAI 의 reasoning 모델 (o1/o3/o4/... 시리즈) 은 temperature 를 지원하지 않고
    # 기본값(1)만 허용한다. 해당 모델에는 temperature 를 보내지 않는다.
    mid_lower = (model_id or "").lower()
    is_openai_reasoning = slug == "openai" and (
        mid_lower.startswith("o1")
        or mid_lower.startswith("o3")
        or mid_lower.startswith("o4")
        or mid_lower.startswith("o5")
    )
    model_config: dict[str, Any] = {"maxTokens": 4096}
    if not is_openai_reasoning:
        model_config["temperature"] = 0.2

    try:
        model_obj = _create_model(
            provider_slug=slug,
            provider_api_key=api_key,
            model_id=model_id,
            config=model_config,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("assistant.model_init failed", model=model)
        await emit_error(thread_id, f"모델 초기화 실패: {e}", "assistant_model_init_failed")
        return

    logger.info("assistant.stream model created", thread_id=thread_id)
    await emit_turn_started(thread_id, turn_id)

    # 4) structured output 단일 호출 — AssistantResponse 로 모든 필드를 한 번에 받는다.
    await assistant_gateway.emit_step(
        thread_id, phase="generating", label="응답 생성 중…"
    )
    designer = model_obj.with_structured_output(AssistantResponse)
    step_id = f"assistant-step-{uuid.uuid4().hex[:8]}"

    async def _emit_error_and_close(message: str, error_type: str) -> None:
        """LLM 실패/타임아웃 시: 에러 emit + 프런트 isStreaming 해제용 token done + turn 종료."""
        await emit_error(thread_id, message, error_type)
        # agent.token done=true 로 store.closeStreamingMessage() 가 실행돼 isStreaming=false 가 된다.
        # 사용자 가시 메시지로 사유도 함께 토큰으로 송출 (delta=False 로 본문 교체).
        await emit_agent_token(
            thread_id=thread_id, turn_id=turn_id, step_id=step_id,
            content=message, delta=False, done=False,
        )
        await emit_agent_token(
            thread_id=thread_id, turn_id=turn_id, step_id=step_id,
            content="", delta=True, done=True,
        )
        await emit_turn_completed(thread_id, turn_id, message)

    try:
        resp: AssistantResponse = await asyncio.wait_for(
            designer.ainvoke(
                [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_message),
                ]
            ),
            timeout=_ASSISTANT_LLM_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "assistant.designer invoke timeout",
            thread_id=thread_id,
            timeout_s=_ASSISTANT_LLM_TIMEOUT_S,
        )
        await _emit_error_and_close(
            f"Agent Assistant 응답이 {int(_ASSISTANT_LLM_TIMEOUT_S)}초 안에 도착하지 않아 중단했어요. 모델/네트워크 상태를 확인하고 다시 시도해주세요.",
            "assistant_llm_timeout",
        )
        return
    except Exception as e:  # noqa: BLE001
        logger.exception("assistant.designer invoke failed", thread_id=thread_id)
        await _emit_error_and_close(
            f"Agent Assistant 호출 실패: {e}",
            "assistant_runtime_error",
        )
        return

    logger.info(
        "assistant.stream response received",
        thread_id=thread_id,
        action=resp.action,
        has_main=resp.main_agent_design is not None,
        sub_count=len(resp.sub_agents),
        has_edit=resp.edit_changes is not None,
        has_direct_answer=bool(resp.direct_answer),
    )

    async def _emit_text_only(text: str) -> None:
        """평문만 emit 하고 turn 종료 (clarify / answer_directly 공통)."""
        pending.chat_history.append({"role": "assistant", "content": text})
        await emit_agent_token(
            thread_id=thread_id, turn_id=turn_id, step_id=step_id,
            content=text, delta=False, done=False,
        )
        await emit_agent_token(
            thread_id=thread_id, turn_id=turn_id, step_id=step_id,
            content="", delta=True, done=True,
        )
        await emit_turn_completed(thread_id, turn_id, text)

    # ─── action 분기 ────────────────────────────────────────────────────────
    if resp.action == "clarify":
        q = resp.clarification_question or "시나리오를 조금 더 구체적으로 알려주세요."
        await _emit_text_only(q)
        return

    if resp.action == "answer_directly":
        ans = resp.direct_answer or "도움이 필요하시면 시나리오를 적어주세요."
        await _emit_text_only(ans)
        return

    if resp.action == "edit_agent":
        edit = resp.edit_changes
        if not edit:
            fallback = "수정할 내용을 더 구체적으로 알려주세요."
            await _emit_text_only(fallback)
            return
        # main 의 new_skills 를 먼저 DB 에 만들고 그 id 들을 main skillIds 에 merge.
        new_main_skill_ids, new_main_skill_meta = await _create_skills_in_db(
            edit.new_skills, user_id,
        )
        merged_main_skill_ids: list[str] | None = None
        if edit.skill_ids is not None or new_main_skill_ids:
            merged_main_skill_ids = list(edit.skill_ids or []) + new_main_skill_ids
        # sub_agent_permissions: target_name → 기존 sub-agent 노드 id 매핑 (프런트는 name fallback).
        sub_agent_permissions_payload: list[dict[str, Any]] = []
        if edit.sub_agent_permissions:
            name_to_id = {sa["agentName"]: sa["id"] for sa in subagents_detail}
            for sap in edit.sub_agent_permissions:
                cleaned = {
                    e.tool_name: e.policy
                    for e in (sap.tool_permissions or [])
                    if e.tool_name
                }
                if not cleaned:
                    continue
                sub_agent_permissions_payload.append(
                    {
                        "nodeId": name_to_id.get(sap.target_name),
                        "agentName": sap.target_name,
                        "toolPermissions": cleaned,
                    }
                )
        # 메인 권한 항목 배열 → dict.
        main_tool_permissions: dict[str, str] | None = None
        if edit.tool_permissions is not None:
            main_tool_permissions = {
                e.tool_name: e.policy for e in edit.tool_permissions if e.tool_name
            }
        # camelCase 키로 변환 (frontend 가 직접 사용) — 명시적 매핑
        edit_payload = {
            **({"agentName": edit.agent_name} if edit.agent_name is not None else {}),
            **({"architecture": edit.architecture} if edit.architecture is not None else {}),
            **({"modelId": edit.model_id} if edit.model_id is not None else {}),
            **({"systemPrompt": edit.system_prompt} if edit.system_prompt is not None else {}),
            **({"builtinToolIds": edit.builtin_tool_ids} if edit.builtin_tool_ids is not None else {}),
            **({"toolIds": edit.db_tool_ids} if edit.db_tool_ids is not None else {}),
            **({"mcpServerIds": edit.mcp_server_ids} if edit.mcp_server_ids is not None else {}),
            **({"skillIds": merged_main_skill_ids} if merged_main_skill_ids is not None else {}),
            **({"toolPermissions": main_tool_permissions} if main_tool_permissions else {}),
            **(
                {"subAgentPermissions": sub_agent_permissions_payload}
                if sub_agent_permissions_payload
                else {}
            ),
            **({"changeSummary": edit.change_summary} if edit.change_summary is not None else {}),
        }
        # edit_payload 가 비어 있으면(즉 main 변경 없음, sub-agent 추가만) emit_edit_proposed 는
        # 보내지 않는다 — 프런트가 빈 EditApplyCard 를 띄우는 잡음을 막기 위해.
        if edit_payload:
            logger.info(
                "assistant.stream edit_agent proposed",
                thread_id=thread_id,
                changed_fields=list(edit_payload.keys()),
                preview={
                    k: (v[:120] if isinstance(v, str) else v) for k, v in edit_payload.items()
                },
            )
            await assistant_gateway.emit_edit_proposed(thread_id, edit_payload)

        # add_sub_agents 처리 — 기존 main 은 그대로 두고 새 sub-agent 노드를 추가 제안.
        # 프런트는 ProposalApplyCard 의 'merge' 모드로 기존 graph 에 append 할 수 있다.
        new_sub_nodes: list[dict[str, Any]] = []
        added_sub_skill_meta: list[dict[str, str]] = []
        if edit.add_sub_agents:
            main_anchor_id = (pending.main_node or {}).get("id") or "main"
            base_idx = len(pending.sub_nodes)
            for idx, sa in enumerate(edit.add_sub_agents):
                # 각 sub-agent 의 new_skills 를 먼저 DB 에 만들고 그 id 를 skillIds 에 merge.
                sub_new_ids, sub_new_meta = await _create_skills_in_db(sa.new_skills, user_id)
                added_sub_skill_meta.extend(sub_new_meta)
                sub_id = f"sub-{uuid.uuid4().hex[:8]}"
                sub_node = {
                    "id": sub_id,
                    "type": "subAgent",
                    "position": _sub_position(base_idx + idx),
                    "data": {
                        "agentName": sa.agent_name,
                        "role": sa.role if sa.role in {
                            "search", "analyze", "generate", "validate", "tool",
                        } else "tool",
                        "description": sa.description or "",
                        "modelName": sa.model_id or model_id,
                        "systemPrompt": sa.system_prompt,
                        "builtinToolIds": sa.builtin_tool_ids or [],
                        "toolIds": sa.db_tool_ids or [],
                        "mcpServerIds": sa.mcp_server_ids or [],
                        "skillIds": list(sa.skill_ids or []) + sub_new_ids,
                        "status": "proposed",
                        "proposed": True,
                    },
                }
                sub_perms = {
                    e.tool_name: e.policy for e in (sa.tool_permissions or []) if e.tool_name
                }
                if sub_perms:
                    sub_node["data"]["toolPermissions"] = sub_perms
                pending.sub_nodes.append(sub_node)
                pending.edges.append(
                    {"id": f"e-{main_anchor_id}-{sub_id}", "source": main_anchor_id, "target": sub_id}
                )
                new_sub_nodes.append(sub_node)
                await assistant_gateway.emit_node_proposed(thread_id, "sub", sub_node)
            logger.info(
                "assistant.stream edit_agent add_sub_agents",
                thread_id=thread_id,
                count=len(new_sub_nodes),
                names=[n["data"]["agentName"] for n in new_sub_nodes],
            )

        summary = (
            resp.summary
            or edit.change_summary
            or "변경 사항을 제안했습니다. 아래 카드에서 [적용] 을 눌러 주세요."
        )
        # 새로 만들어진 skill 이 있으면 사용자에게 그 목록을 명시 — 카탈로그 추가 가시화.
        all_new_skill_meta = list(new_main_skill_meta) + added_sub_skill_meta
        if all_new_skill_meta:
            names = ", ".join(m["name"] for m in all_new_skill_meta)
            summary = f"{summary}\n(새 skill 생성: {names})"
        await _emit_text_only(summary)
        await assistant_gateway.emit_session_complete(
            thread_id=thread_id,
            summary=summary,
            final_nodes=([pending.main_node] if pending.main_node else []) + pending.sub_nodes,
            final_edges=pending.edges,
        )
        return

    if resp.action == "create_skill":
        nsd = resp.new_skill
        if not nsd:
            await _emit_text_only(
                "만들 skill 의 이름·설명·instructions 를 더 구체적으로 알려주세요."
            )
            return
        if not user_id:
            await _emit_text_only(
                "사용자 정보가 없어 skill 을 생성할 수 없습니다. 다시 로그인 후 시도해 주세요."
            )
            return
        created_ids, created_meta = await _create_skills_in_db([nsd], user_id)
        if not created_ids:
            await _emit_text_only(
                f"'{nsd.name}' skill 생성에 실패했어요. 이름 충돌이나 권한 문제일 수 있습니다."
            )
            return
        summary = (
            resp.summary
            or f"'{nsd.name}' skill 을 새로 만들었습니다. 카탈로그에서 바로 사용할 수 있습니다."
        )
        await _emit_text_only(summary)
        await assistant_gateway.emit_session_complete(
            thread_id=thread_id,
            summary=summary,
            final_nodes=([pending.main_node] if pending.main_node else []) + pending.sub_nodes,
            final_edges=pending.edges,
        )
        return

    # action == "create_agent"
    ma = resp.main_agent_design
    if not ma:
        await _emit_text_only(
            "어떤 agent 를 만들지 조금 더 구체적으로 알려주세요 (작업·도구·출력 형식)."
        )
        return

    # main 의 new_skills DB 생성 후 main skillIds 에 merge.
    main_new_ids, main_new_meta = await _create_skills_in_db(ma.new_skills, user_id)
    main_node = {
        "id": (pending.main_node or {}).get("id") or "main",
        "type": "mainAgent",
        "position": _main_position(),
        "data": {
            "agentName": ma.agent_name,
            "architecture": (ma.architecture if ma.architecture in {
                "react", "plan_execute", "tool_calling", "custom_graph"
            } else "react"),
            "modelName": ma.model_id or model_id,
            "systemPrompt": ma.system_prompt,
            "builtinToolIds": ma.builtin_tool_ids or [],
            "toolIds": ma.db_tool_ids or [],
            "mcpServerIds": ma.mcp_server_ids or [],
            "skillIds": list(ma.skill_ids or []) + main_new_ids,
            "isSelected": False,
            "isSupervisor": ma.is_supervisor,
            "status": "proposed",
            "proposed": True,
        },
    }
    main_perms = {e.tool_name: e.policy for e in (ma.tool_permissions or []) if e.tool_name}
    if main_perms:
        main_node["data"]["toolPermissions"] = main_perms
    pending.main_node = main_node
    pending.sub_nodes = []
    pending.edges = []
    await assistant_gateway.emit_node_proposed(thread_id, "main", main_node)

    created_skill_meta_all: list[dict[str, str]] = list(main_new_meta)
    for idx, sa in enumerate(resp.sub_agents):
        # 각 sub-agent 의 new_skills DB 생성 후 그 skillIds 에 merge.
        sub_new_ids, sub_new_meta = await _create_skills_in_db(sa.new_skills, user_id)
        created_skill_meta_all.extend(sub_new_meta)
        sub_id = f"sub-{uuid.uuid4().hex[:8]}"
        sub_node = {
            "id": sub_id,
            "type": "subAgent",
            "position": _sub_position(idx),
            "data": {
                "agentName": sa.agent_name,
                "role": sa.role if sa.role in {
                    "search", "analyze", "generate", "validate", "tool",
                } else "tool",
                "description": sa.description or "",
                "modelName": sa.model_id or model_id,
                "systemPrompt": sa.system_prompt,
                "builtinToolIds": sa.builtin_tool_ids or [],
                "toolIds": sa.db_tool_ids or [],
                "mcpServerIds": sa.mcp_server_ids or [],
                "skillIds": list(sa.skill_ids or []) + sub_new_ids,
                "status": "proposed",
                "proposed": True,
            },
        }
        sub_perms = {e.tool_name: e.policy for e in (sa.tool_permissions or []) if e.tool_name}
        if sub_perms:
            sub_node["data"]["toolPermissions"] = sub_perms
        pending.sub_nodes.append(sub_node)
        pending.edges.append(
            {"id": f"e-main-{sub_id}", "source": main_node["id"], "target": sub_id}
        )
        await assistant_gateway.emit_node_proposed(thread_id, "sub", sub_node)

    summary = (
        resp.summary
        or f"'{ma.agent_name}' 구조를 제안했습니다. 아래 카드에서 [적용] 을 눌러 캔버스에 반영하세요."
    )
    if created_skill_meta_all:
        names = ", ".join(m["name"] for m in created_skill_meta_all)
        summary = f"{summary}\n(새 skill 생성: {names})"
    pending.chat_history.append({"role": "assistant", "content": summary})
    await emit_agent_token(
        thread_id=thread_id, turn_id=turn_id, step_id=step_id,
        content=summary, delta=False, done=False,
    )
    await emit_agent_token(
        thread_id=thread_id, turn_id=turn_id, step_id=step_id,
        content="", delta=True, done=True,
    )

    final_nodes: list[dict[str, Any]] = [pending.main_node] + pending.sub_nodes
    await emit_turn_completed(thread_id, turn_id, summary)
    await assistant_gateway.emit_session_complete(
        thread_id=thread_id,
        summary=summary,
        final_nodes=final_nodes,
        final_edges=pending.edges,
    )
