import asyncio
import re
import uuid
from typing import Any, AsyncGenerator

import structlog
from langchain_core.tools import BaseTool, StructuredTool

from src.common.utils import sanitize_tool_name
from src.database.client import fetch_all, fetch_one
from src.modules.builtin_tools.builtin_tools_service import BuiltinToolsService
from src.modules.langgraph import langgraph_service as lg
from src.modules.mcp.mcp_client_service import McpClientService

logger = structlog.get_logger(__name__)

# config.secretKeys 가 명시 안 된 (Phase 10-2 이전 등록) MCP 서버 호환용 휴리스틱.
# 키 이름이 TOKEN/KEY/SECRET/PASSWORD/CREDENTIAL 로 끝나면 secret 으로 간주해 사용자
# 자격증명으로 교체. SLACK_MCP_ADD_MESSAGE_TOOL 같은 non-secret defaultEnv 는 매칭 안 됨.
_SECRET_KEY_PATTERN = re.compile(r"(?i)(TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL)$")


async def _resolve_actual_model_id(model_id: str) -> str:
    """UUID 형태로 저장된 model_id를 실제 LLM model identifier로 해석한다."""
    if not model_id:
        return model_id
    row = await fetch_one(
        "SELECT model_id FROM models WHERE id::text = $1 OR model_id = $2 LIMIT 1",
        (model_id, model_id),
    )
    if row:
        return row.get("model_id") or model_id
    return model_id


async def _resolve_provider_for_model(model_id: str) -> tuple[str, str | None]:
    row = None
    if model_id:
        row = await fetch_one(
            """
            SELECT p.slug AS provider_slug, p.api_key_encrypted
            FROM models m
            LEFT JOIN providers p ON p.id = m.provider_id
            WHERE m.model_id = $1 OR m.id::text = $2
            LIMIT 1
            """,
            (model_id, model_id),
        )
    slug = (row.get("provider_slug") or "").strip() if row else ""
    api_key: str | None = row.get("api_key_encrypted") if row else None

    if not slug:
        if model_id.startswith("claude"):
            slug = "anthropic"
        elif model_id.startswith("gemini"):
            slug = "google"
        else:
            slug = "openai"

    if api_key is None:
        provider_row = await fetch_one(
            "SELECT api_key_encrypted FROM providers WHERE slug = $1 LIMIT 1",
            (slug,),
        )
        if provider_row:
            api_key = provider_row.get("api_key_encrypted")

    return slug, api_key


async def _load_db_tools(tool_ids: list[str]) -> list[BaseTool]:
    if not tool_ids:
        return []
    placeholders = ", ".join(f"${i+1}" for i in range(len(tool_ids)))
    records = await fetch_all(
        f"SELECT id, name, slug, description, config FROM tools WHERE id IN ({placeholders}) AND enabled = true",
        tuple(tool_ids),
    )
    tools: list[BaseTool] = []
    for rec in records:
        import httpx

        config = rec["config"] or {}
        url = config.get("url", "")
        method = config.get("method", "POST").upper()

        async def _call_http_tool(_url=url, _method=method, **kwargs: Any) -> str:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    if _method == "GET":
                        resp = await client.get(_url, params=kwargs)
                    elif _method == "POST":
                        resp = await client.post(_url, json=kwargs)
                    elif _method == "PUT":
                        resp = await client.put(_url, json=kwargs)
                    elif _method == "DELETE":
                        resp = await client.delete(_url, params=kwargs)
                    else:
                        resp = await client.request(_method, _url, json=kwargs)
                    return resp.text
            except Exception as e:
                return f"Tool error: {e}"

        tool = StructuredTool.from_function(
            coroutine=_call_http_tool,
            name=rec["slug"] or sanitize_tool_name(rec["name"]),
            description=rec["description"] or "",
        )
        tools.append(tool)
    return tools


async def _load_group_tools(group_ids: list[str]) -> list[BaseTool]:
    if not group_ids:
        return []
    placeholders = ", ".join(f"${i+1}" for i in range(len(group_ids)))
    rows = await fetch_all(
        f"SELECT id FROM tools WHERE group_id IN ({placeholders}) AND enabled = true",
        tuple(group_ids),
    )
    tool_ids = [r["id"] for r in rows]
    return await _load_db_tools(tool_ids)


async def _load_mcp_tools(
    server_ids: list[str],
    user_credentials: dict[str, str] | None = None,
    tool_refs: list[dict[str, str]] | None = None,
    user_mcp_envs: dict[str, dict[str, str]] | None = None,
    thread_id: str | None = None,
) -> list[BaseTool]:
    """MCP 서버에서 LangChain 도구를 로드한다.

    Args:
        server_ids: 로드할 MCP 서버 UUID 목록.
        user_credentials: 레거시 단일-값 자격증명 dict (``mcp:<serverId>`` 키).
        tool_refs: Agent 의 ``mcpToolRefs`` 파싱 결과 ``[{serverId, toolName}, ...]``.
                   지정 시 해당 서버+도구 조합만 wrapping.  None/빈 배열이면 전체 도구.
        user_mcp_envs: API 페이로드로 전달된 per_user 자격증명
                       ``{serverId: {ENV_KEY: value}, ...}``.
                       서버 ``credentialMode == 'per_user'`` 일 때 config.env 위에 merge.
    """
    if not server_ids:
        return []
    placeholders = ", ".join(f"${i+1}" for i in range(len(server_ids)))
    servers = await fetch_all(
        f"SELECT id, transport, config, credential_mode, exposed_tools FROM mcp_servers "
        f"WHERE id IN ({placeholders}) AND status != 'disconnected'",
        tuple(server_ids),
    )

    # tool_refs → 서버별 허용 도구 이름 set 구성
    per_server_allowed: dict[str, set[str]] | None = None
    if tool_refs:
        per_server_allowed = {}
        for ref in tool_refs:
            sid = ref.get("serverId") or ref.get("server_id") or ""
            tname = ref.get("toolName") or ref.get("tool_name") or ""
            if sid and tname:
                per_server_allowed.setdefault(sid, set()).add(tname)

    creds = user_credentials or {}
    user_envs = user_mcp_envs or {}
    tools: list[BaseTool] = []

    for srv in servers:
        cfg = srv["config"] or {}
        credential_mode: str = (srv.get("credential_mode") or "shared").lower()
        exposed_tools_db: list[str] = srv.get("exposed_tools") or []

        # env 주입 우선순위:
        # 1. DB config.env (admin 등록값 + 카탈로그 defaultEnv) 를 base 로 시작.
        # 2. per_user 모드이고 user_mcp_envs[serverId] 가 있으면 그 값을 전부 merge
        #    (per_user env 가 우선 — 사용자별 API key 격리).
        # 3. 레거시: user_credentials["mcp:<serverId>"] 단일값 → secret 키에만 적용.
        env: dict[str, str] = dict(cfg.get("env") or {})

        if credential_mode == "per_user":
            per_user_env = user_envs.get(srv["id"]) or {}
            if per_user_env:
                env.update(per_user_env)
        else:
            # shared 모드: 레거시 단일-값 자격증명 처리
            explicit_secret_keys: list[str] = list(cfg.get("secretKeys") or [])
            user_secret = creds.get(f"mcp:{srv['id']}")
            if user_secret:
                if explicit_secret_keys:
                    for k in explicit_secret_keys:
                        if k in env:
                            env[k] = user_secret
                elif env:
                    candidates = [k for k in env.keys() if _SECRET_KEY_PATTERN.search(k)]
                    if candidates:
                        for k in candidates:
                            env[k] = user_secret
                    else:
                        first_key = next(iter(env.keys()))
                        env[first_key] = user_secret
                else:
                    env["API_KEY"] = user_secret

        # allowed_tool_names: tool_refs 기반 허용 목록 (서버별)
        allowed_names: set[str] | None = None
        if per_server_allowed is not None:
            allowed_names = per_server_allowed.get(srv["id"])
            # tool_refs 에 이 서버가 없으면 도구 0개 (이 서버는 tool_refs 에서 선택 안 됨)
            if allowed_names is None:
                continue

        srv_dict = {
            "id": srv["id"],
            "transport": srv["transport"],
            "command": cfg.get("command"),
            "args": cfg.get("args") or [],
            "env": env or None,
            "url": cfg.get("url"),
            "headers": cfg.get("headers") or {},
            # DB 의 exposed_tools 를 서버 dict 에 포함 → McpClientService 가 필터링에 활용
            "exposed_tools": exposed_tools_db,
        }
        # 서버별 격리: 한 MCP 서버 로드 실패가 나머지 서버 도구까지 날리지 않도록.
        try:
            srv_tools = await McpClientService.to_structured_tools(
                srv_dict,
                allowed_tool_names=allowed_names,
                thread_id=thread_id,
            )
            tools.extend(srv_tools)
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "MCP server load skipped", server_id=srv["id"], error=str(e)
            )
    return tools


async def _load_builtin_tools(
    tool_names: list[str],
    agent_id: str,
    thread_id: str,
    user_id: str | None = None,
    source: str | None = None,
) -> list[BaseTool]:
    return BuiltinToolsService.get_tools(
        tool_names,
        agent_id=agent_id,
        thread_id=thread_id,
        user_id=user_id,
        source=source,
    )


async def _build_inline_subagent_specs(
    inline_nodes: list[dict[str, Any]],
    parent_agent_id: str | None = None,
    parent_model_id: str = "",
    parent_provider_slug: str = "",
    parent_provider_api_key: str | None = None,
    parent_thread_id: str = "",
    user_id: str | None = None,
    source: str | None = None,
    user_credentials: dict[str, str] | None = None,
    user_mcp_envs: dict[str, dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    """graphDefinition.nodes → 공식 deepagents `subagents` 파라미터용 spec 리스트.

    반환 dict 키: name, description, systemPrompt, tools, modelId, providerSlug,
    providerApiKey, config, guardrailsConfig, hitlPolicy.
    실제 `subagents` 파라미터 변환(모델 인스턴스화 포함) 은 `deepagent_bridge.build_subagents()`
    에서 수행한다.
    """
    specs: list[dict[str, Any]] = []

    for node in inline_nodes:
        node_id: str = node.get("id", uuid.uuid4().hex[:12])
        data: dict[str, Any] = node.get("data", {})

        agent_name: str = data.get("agentName") or "Sub Agent"
        raw_model_id: str = (data.get("modelName") or data.get("modelId") or "").strip()
        system_prompt: str = data.get("systemPrompt") or ""
        description: str = data.get("description") or ""
        architecture: str = data.get("architecture") or "react"
        tool_ids: list[str] = data.get("toolIds") or []
        group_ids: list[str] = data.get("toolGroupIds") or []
        mcp_ids: list[str] = data.get("mcpServerIds") or []
        builtin_names: list[str] = data.get("builtinToolIds") or []
        config: dict[str, Any] = data.get("config") or {}
        guardrails_config: dict[str, Any] = data.get("guardrailsConfig") or {}
        tool_permissions: dict[str, str] = data.get("toolPermissions") or {}
        skill_ids: list[str] = data.get("skillIds") or data.get("skill_ids") or []

        if raw_model_id:
            model_id = await _resolve_actual_model_id(raw_model_id)
            provider_slug, provider_api_key = await _resolve_provider_for_model(model_id)
        else:
            # 빈 modelName → parent agent의 모델/프로바이더 상속
            model_id = parent_model_id
            provider_slug = parent_provider_slug
            provider_api_key = parent_provider_api_key

        # gmail 토큰 발급은 DB agent ID 기반이므로 node_id(캔버스 임시 ID) 대신 parent_agent_id 사용
        builtin_tool_agent_id = parent_agent_id or node_id

        db_tools, group_tools, mcp_tools, builtin_tools = await asyncio.gather(
            _load_db_tools(tool_ids),
            _load_group_tools(group_ids),
            _load_mcp_tools(
                mcp_ids,
                user_credentials=user_credentials,
                user_mcp_envs=user_mcp_envs,
                thread_id=parent_thread_id,
            ),
            _load_builtin_tools(
                builtin_names,
                builtin_tool_agent_id,
                parent_thread_id or builtin_tool_agent_id,
                user_id=user_id,
                source=source,
            ),
        )
        all_sub_tools: list[BaseTool] = db_tools + group_tools + mcp_tools + builtin_tools

        specs.append({
            "id": node_id,
            "name": agent_name,
            "slug": node_id,
            "description": description,
            "architecture": architecture,
            "systemPrompt": system_prompt,
            "modelId": model_id,
            "providerSlug": provider_slug,
            "providerApiKey": provider_api_key,
            "config": config,
            "guardrailsConfig": guardrails_config,
            "hitlPolicy": {},
            "toolPermissions": tool_permissions,
            "skillIds": skill_ids,
            "tools": all_sub_tools,
        })

    return specs


async def _build_db_subagent_specs(
    sub_agent_ids: list[str],
    _visited: frozenset[str] | None = None,
    user_id: str | None = None,
    source: str | None = None,
) -> list[dict[str, Any]]:
    """레거시 DB-linked sub-agent ID 리스트 → 공식 deepagents `subagents` 파라미터용 spec 리스트."""
    specs: list[dict[str, Any]] = []
    for agent_id in sub_agent_ids:
        loaded = await load_agent_with_deps(agent_id, _visited=_visited, user_id=user_id, source=source)
        if not loaded:
            continue
        specs.append({
            "id": loaded["id"],
            "name": loaded["name"],
            "slug": loaded.get("slug") or agent_id,
            "description": loaded.get("description") or f"Delegate to sub-agent {loaded['name']}",
            "architecture": loaded.get("architecture", "react"),
            "systemPrompt": loaded.get("systemPrompt") or "",
            "modelId": loaded.get("modelId") or "",
            "providerSlug": loaded.get("providerSlug") or "",
            "providerApiKey": loaded.get("providerApiKey"),
            "config": loaded.get("config") or {},
            "guardrailsConfig": loaded.get("guardrailsConfig") or {},
            "hitlPolicy": loaded.get("hitlPolicy") or {},
            "skillIds": loaded.get("skillIds") or [],
            "tools": loaded.get("tools") or [],
        })
    return specs


async def load_agent_with_deps(
    agent_id: str,
    thread_id: str | None = None,
    turn_id: str | None = None,
    _visited: frozenset[str] | None = None,
    user_id: str | None = None,
    source: str | None = None,
    user_credentials: dict[str, str] | None = None,
    user_mcp_envs: dict[str, dict[str, str]] | None = None,
) -> dict[str, Any] | None:
    visited = (_visited or frozenset()) | {agent_id}
    if _visited and agent_id in _visited:
        return None
    row = await fetch_one(
        """
        SELECT
            a.id, a.name, a.slug, a.description, a.architecture,
            a.system_prompt, a.model_id AS agent_model_id, a.tool_ids, a.tool_group_ids,
            a.mcp_server_ids, a.mcp_tool_refs, a.builtin_tool_ids, a.skill_ids, a.config,
            a.planning_config, a.reasoning_config, a.memory_config,
            a.guardrails_config, a.hitl_policy, a.tool_permissions,
            a.graph_definition,
            m.model_id AS model_model_id,
            p.slug AS provider_slug,
            p.api_key_encrypted AS provider_api_key
        FROM agents a
        LEFT JOIN models m ON (m.id::text = a.model_id OR m.model_id = a.model_id)
        LEFT JOIN providers p ON p.id = m.provider_id
        WHERE a.id = $1
        LIMIT 1
        """,
        (agent_id,),
    )
    if not row:
        return None

    agent_model_id = (row.get("agent_model_id") or "").strip()
    joined_model_id = (row.get("model_model_id") or "").strip()

    provider_slug = (row.get("provider_slug") or "").strip()
    if not provider_slug:
        if agent_model_id.startswith("claude") or joined_model_id.startswith("claude"):
            provider_slug = "anthropic"
        elif agent_model_id.startswith("gemini") or joined_model_id.startswith("gemini"):
            provider_slug = "google"
        else:
            provider_slug = "openai"

    provider_api_key = row.get("provider_api_key")

    if provider_api_key is None:
        provider_row = await fetch_one(
            """
            SELECT api_key_encrypted AS provider_api_key
            FROM providers
            WHERE slug = $1
            LIMIT 1
            """,
            (provider_slug,),
        )
        if provider_row:
            provider_api_key = provider_row.get("provider_api_key")

    architecture = row["architecture"] or "react"
    planning_config: dict[str, Any] = row["planning_config"] or {}
    reasoning_config: dict[str, Any] = row["reasoning_config"] or {}

    tool_ids: list[str] = row["tool_ids"] or []
    group_ids: list[str] = row["tool_group_ids"] or []
    mcp_ids: list[str] = row["mcp_server_ids"] or []
    builtin_names: list[str] = row["builtin_tool_ids"] or []

    # mcpToolRefs: 도구 단위 선택. null/빈 배열이면 mcp_ids 의 전체 도구 사용(하위 호환).
    raw_tool_refs = row.get("mcp_tool_refs")
    mcp_tool_refs: list[dict[str, str]] | None = None
    if raw_tool_refs:
        if isinstance(raw_tool_refs, list) and len(raw_tool_refs) > 0:
            mcp_tool_refs = [r for r in raw_tool_refs if isinstance(r, dict)]
        # mcpToolRefs 가 있으면 참조된 서버 ID 만 로드 (mcp_ids 는 하위 호환 폴백)
        if mcp_tool_refs:
            ref_server_ids = list({
                r.get("serverId") or r.get("server_id") or ""
                for r in mcp_tool_refs
            } - {""})
            if ref_server_ids:
                mcp_ids = ref_server_ids

    # 레거시: DB-linked sub-agent ID 목록 (planningConfig.subAgents.agentIds 기반)
    sub_agent_ids: list[str] = (planning_config.get("subAgents") or {}).get("agentIds") or []

    # 인라인 sub-agent 노드 추출 (graphDefinition.nodes 기반)
    graph_definition: dict[str, Any] = row.get("graph_definition") or {}
    inline_sub_nodes: list[dict[str, Any]] = graph_definition.get("nodes") or []

    # thread_id가 없으면 agent_id를 fallback으로 사용 (VFS 등 thread 격리용)
    resolved_thread_id = thread_id or agent_id

    db_tools, group_tools, mcp_tools, builtin_tools = await asyncio.gather(
        _load_db_tools(tool_ids),
        _load_group_tools(group_ids),
        _load_mcp_tools(
            mcp_ids,
            user_credentials=user_credentials,
            tool_refs=mcp_tool_refs,
            user_mcp_envs=user_mcp_envs,
            thread_id=resolved_thread_id,
        ),
        _load_builtin_tools(
            builtin_names,
            agent_id=agent_id,
            thread_id=resolved_thread_id,
            user_id=user_id,
            source=source,
        ),
    )

    all_tools: list[BaseTool] = db_tools + group_tools + mcp_tools + builtin_tools

    sub_agent_specs: list[dict[str, Any]] = []
    if architecture in ("react", "plan_execute"):
        # Phase 8: 공식 deepagents `subagents` 파라미터 사용. 도구로 래핑하지 않고 spec 만 수집해 반환한다.
        if inline_sub_nodes:
            parent_mid = (row.get("model_model_id") or row.get("agent_model_id") or "").strip()
            sub_agent_specs = await _build_inline_subagent_specs(
                inline_sub_nodes,
                parent_agent_id=agent_id,
                parent_model_id=parent_mid,
                parent_provider_slug=provider_slug,
                parent_provider_api_key=provider_api_key,
                parent_thread_id=resolved_thread_id,
                user_id=user_id,
                source=source,
                user_credentials=user_credentials,
                user_mcp_envs=user_mcp_envs,
            )
        elif sub_agent_ids:
            safe_sub_ids = [sid for sid in sub_agent_ids if sid not in visited]
            if safe_sub_ids:
                sub_agent_specs = await _build_db_subagent_specs(
                    safe_sub_ids,
                    _visited=visited,
                    user_id=user_id,
                    source=source,
                )

    return {
        "id": row["id"],
        "name": row["name"],
        "slug": row["slug"] or "",
        "description": row["description"],
        "architecture": architecture,
        "systemPrompt": row["system_prompt"] or "",
        "modelId": (row.get("model_model_id") or row.get("agent_model_id") or "") or "",
        "providerSlug": provider_slug,
        "providerApiKey": provider_api_key,
        "config": row["config"] or {},
        "planningConfig": planning_config,
        "reasoningConfig": reasoning_config,
        "memoryConfig": row["memory_config"] or {},
        "guardrailsConfig": row["guardrails_config"] or {},
        "hitlPolicy": row["hitl_policy"] or {},
        "toolPermissions": row["tool_permissions"] or {},
        "skillIds": row.get("skill_ids") or [],
        "builtinToolIds": builtin_names,
        "tools": all_tools,
        "subAgentSpecs": sub_agent_specs,
        "graphEdges": graph_definition.get("edges") or [],
    }


async def _parse_thinking_stream(
    stream_gen: AsyncGenerator[dict[str, Any], None],
    custom_step_id: str | None = None,
    custom_reasoning_id: str | None = None,
    parent_step_id: str | None = None,
    depth: int = 0,
) -> AsyncGenerator[dict[str, Any], None]:
    buffer = ""
    is_thinking = False
    step_id = custom_step_id or f"stream-{uuid.uuid4().hex[:8]}"
    reasoning_id = custom_reasoning_id or f"reasoning-{uuid.uuid4().hex[:8]}"
    # loop 가 0회 돌아도(토큰 없음) 잔여 flush 에서 참조 가능하도록 초기화.
    chunk_depth = depth

    async for chunk in stream_gen:
        if chunk.get("event") != "token":
            yield chunk
            continue

        token = chunk["data"].get("token", "")
        if not token:
            continue

        # deepagent_bridge 가 실어 보낸 chunk 별 depth (sub-agent 토큰 식별용).
        # 누락 시 함수 파라미터 depth(기본 0) 로 fallback.
        chunk_depth = chunk["data"].get("depth", depth)

        buffer += token

        while buffer:
            if not is_thinking:
                start_idx = buffer.find("<thinking>")
                if start_idx != -1:
                    if start_idx > 0:
                        yield {
                            "event": "token",
                            "data": {
                                "token": buffer[:start_idx],
                                "stepId": step_id,
                                "parentStepId": parent_step_id,
                                "depth": chunk_depth,
                            },
                        }
                    is_thinking = True
                    if not custom_reasoning_id:
                        reasoning_id = f"reasoning-{uuid.uuid4().hex[:8]}"
                    buffer = buffer[start_idx + 10:]
                else:
                    partial_len = 0
                    for i in range(1, 10):
                        if buffer.endswith("<thinking>"[:i]):
                            partial_len = i
                            break
                    if partial_len > 0:
                        flush_len = len(buffer) - partial_len
                        if flush_len > 0:
                            yield {
                                "event": "token",
                                "data": {
                                    "token": buffer[:flush_len],
                                    "stepId": step_id,
                                    "parentStepId": parent_step_id,
                                    "depth": chunk_depth,
                                },
                            }
                            buffer = buffer[flush_len:]
                        break
                    else:
                        yield {
                            "event": "token",
                            "data": {
                                "token": buffer,
                                "stepId": step_id,
                                "parentStepId": parent_step_id,
                                "depth": chunk_depth,
                            },
                        }
                        buffer = ""
            else:
                end_idx = buffer.find("</thinking>")
                if end_idx != -1:
                    if end_idx > 0:
                        yield {
                            "event": "reasoning.token",
                            "data": {
                                "token": buffer[:end_idx],
                                "stepId": reasoning_id,
                                "parentStepId": parent_step_id,
                                "depth": chunk_depth,
                            },
                        }
                    yield {
                        "event": "reasoning.token",
                        "data": {
                            "token": "",
                            "stepId": reasoning_id,
                            "parentStepId": parent_step_id,
                            "depth": chunk_depth,
                            "done": True,
                        },
                    }
                    is_thinking = False
                    buffer = buffer[end_idx + 11:]
                else:
                    partial_len = 0
                    for i in range(1, 11):
                        if buffer.endswith("</thinking>"[:i]):
                            partial_len = i
                            break
                    if partial_len > 0:
                        flush_len = len(buffer) - partial_len
                        if flush_len > 0:
                            yield {
                                "event": "reasoning.token",
                                "data": {
                                    "token": buffer[:flush_len],
                                    "stepId": reasoning_id,
                                    "parentStepId": parent_step_id,
                                    "depth": chunk_depth,
                                },
                            }
                            buffer = buffer[flush_len:]
                        break
                    else:
                        yield {
                            "event": "reasoning.token",
                            "data": {
                                "token": buffer,
                                "stepId": reasoning_id,
                                "parentStepId": parent_step_id,
                                "depth": chunk_depth,
                            },
                        }
                        buffer = ""

    if buffer:
        if is_thinking:
            yield {
                "event": "reasoning.token",
                "data": {
                    "token": buffer,
                    "stepId": reasoning_id,
                    "parentStepId": parent_step_id,
                    "depth": chunk_depth,
                    "done": True,
                },
            }
        else:
            yield {
                "event": "token",
                "data": {
                    "token": buffer,
                    "stepId": step_id,
                    "parentStepId": parent_step_id,
                    "depth": chunk_depth,
                    "done": True,
                },
            }
    else:
        if is_thinking:
            yield {
                "event": "reasoning.token",
                "data": {
                    "token": "",
                    "stepId": reasoning_id,
                    "parentStepId": parent_step_id,
                    "depth": chunk_depth,
                    "done": True,
                },
            }
        else:
            yield {
                "event": "token",
                "data": {
                    "token": "",
                    "stepId": step_id,
                    "parentStepId": parent_step_id,
                    "depth": chunk_depth,
                    "done": True,
                },
            }


async def stream(
    agent_id: str,
    thread_id: str,
    message: str,
    turn_id: str | None = None,
    step_id: str | None = None,
    reasoning_id: str | None = None,
    parent_step_id: str | None = None,
    depth: int = 0,
    user_credentials: dict[str, str] | None = None,
    user_id: str | None = None,
    architecture_override: str | None = None,
    source: str | None = None,
    user_mcp_envs: dict[str, dict[str, str]] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    loaded = await load_agent_with_deps(
        agent_id,
        thread_id,
        turn_id=turn_id,
        user_id=user_id,
        source=source,
        user_credentials=user_credentials,
        user_mcp_envs=user_mcp_envs,
    )
    if not loaded:
        raise ValueError(f"Agent not found: {agent_id}")
    if user_credentials:
        loaded = {**loaded, "userCredentials": user_credentials}
    if architecture_override:
        loaded = {**loaded, "architecture": architecture_override}

    from src.modules.agents.deepagent_bridge import stream_with_deepagent

    logger.info("Calling DeepAgent",
                agent_id=agent_id,
                thread_id=thread_id,
                user_id=user_id,
                source=source,
                user_credentials_count=len(user_credentials or {}))
    async for chunk in _parse_thinking_stream(
        stream_with_deepagent(loaded, thread_id, message, loaded["tools"]),
        custom_step_id=step_id,
        custom_reasoning_id=reasoning_id,
        parent_step_id=parent_step_id,
        depth=depth,
    ):
        yield chunk


async def invoke(agent_id: str, thread_id: str, message: str) -> dict[str, Any]:
    loaded = await load_agent_with_deps(agent_id, thread_id)
    if not loaded:
        raise ValueError(f"Agent not found: {agent_id}")

    return await lg.invoke(
        agent_id=loaded["id"],
        agent_name=loaded["name"],
        agent_description=loaded.get("description") or "",
        architecture=loaded["architecture"],
        system_prompt=loaded["systemPrompt"],
        model_id=loaded["modelId"],
        provider_slug=loaded["providerSlug"],
        provider_api_key=loaded["providerApiKey"],
        tools=loaded["tools"],
        config=loaded["config"],
        planning_config=loaded["planningConfig"],
        reasoning_config=loaded["reasoningConfig"],
        thread_id=thread_id,
        message=message,
    )


async def resume_stream(
    agent_id: str,
    thread_id: str,
    decisions: list[dict[str, Any]],
    edit_context: str | None = None,
    task_description_update: str | None = None,
    user_id: str | None = None,
    source: str | None = None,
    continue_after_recursion: bool = False,
    requested_step_limit: int | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """HITL 응답 후 create_deep_agent 그래프에서 스트리밍 재개.

    decisions 는 deepagents 포맷: [{"type": "approve" | "reject" | "edit", ...}]

    user_id 는 초기 invoke 와 동일하게 자격증명 의존 도구(gmail_*) 등의 OAuth 토큰 발급에 사용.
    resume 에서 누락되면 NestJS 가 userId 없는 요청으로 처리해 프로젝트 폴백/오류로 빠짐.

    source: 'studio' (admin 페이지) | 'client' (client 페이지) | None — 자격증명 소스 분기.
    """
    loaded = await load_agent_with_deps(agent_id, thread_id, user_id=user_id, source=source)
    if not loaded:
        raise ValueError(f"Agent not found: {agent_id}")

    from src.modules.agents.deepagent_bridge import resume_stream_with_deepagent
    async for chunk in _parse_thinking_stream(
        resume_stream_with_deepagent(
            loaded,
            thread_id,
            decisions,
            loaded["tools"],
            edit_context=edit_context,
            task_description_update=task_description_update,
            continue_after_recursion=continue_after_recursion,
            requested_step_limit=requested_step_limit,
        ),
    ):
        yield chunk


async def get_messages(agent_id: str, thread_id: str) -> dict[str, Any]:
    # 단순 history 조회 — agent 의 도구를 다시 로드하거나 그래프를 컴파일하지 않는다.
    # (이전엔 load_agent_with_deps → _load_mcp_tools 가 매번 MCP stdio 를 spawn 해서
    #  /threads/:id/messages 호출 시 수 초씩 hang 되던 회귀)
    result = await lg.get_messages_only(thread_id)
    messages = result.get("messages", []) if isinstance(result, dict) else result
    filtered = [
        m for m in messages
        if isinstance(m, dict) and m.get("role") in ("user", "assistant", "system", "tool")
    ]
    subagent_todos = result.get("subagentTodos", []) if isinstance(result, dict) else []
    return {"messages": filtered, "subagentTodos": subagent_todos}
