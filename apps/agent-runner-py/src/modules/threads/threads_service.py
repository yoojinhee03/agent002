import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from src.config import settings
from src.database.client import execute, execute_returning, fetch_all, fetch_one
from src.modules.agents import agents_service
from src.modules.hitl import hitl_service
from src.modules.hitl.hitl_gateway import (
    emit_agent_reasoning,
    emit_agent_token,
    emit_hitl_request,
    emit_plan_created,
    emit_run_cancelled,
    emit_step_completed,
    emit_step_failed,
    emit_step_started,
    emit_thread_updated,
    emit_turn_completed,
    emit_turn_started,
)
from src.modules.runs.runs_writer import record_run
from src.modules.threads import cancel_registry

_external_reply_logger = structlog.get_logger(__name__)


def _parse_thread_metadata(thread: dict[str, Any]) -> dict[str, Any]:
    metadata = thread.get("metadata") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:  # noqa: BLE001
            metadata = {}
    if not isinstance(metadata, dict):
        return {}
    return metadata


async def _maybe_push_external_reply(thread: dict[str, Any], reply_text: str) -> None:
    """
    외부 채널(NAVER WORKS 등) 1:1 대화에서 들어온 thread 의 turn 이 끝났을 때
    최종 응답을 외부 채널로 push 한다. best-effort — 실패 시 로그만 남긴다.

    metadata.source 분기:
      - "naver_works" → NestJS apps/api 의 `/api/internal/naver-works/reply` 호출
      - 그 외 → no-op (Slack/웹 채팅은 기존 흐름 그대로)
    """
    if not reply_text or not reply_text.strip():
        return

    metadata = _parse_thread_metadata(thread)
    source = metadata.get("source")
    if source != "naver_works":
        return

    bot_id = metadata.get("botId")
    naver_user_id = metadata.get("naverUserId")
    if not bot_id or not naver_user_id:
        _external_reply_logger.warning(
            "naver_works reply skipped — metadata missing botId/naverUserId",
            thread_id=thread.get("id"),
        )
        return

    url = f"{settings.MANAGEMENT_API_URL.rstrip('/')}/api/internal/naver-works/reply"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                url,
                json={"botId": bot_id, "naverUserId": naver_user_id, "text": reply_text},
                headers={
                    "Content-Type": "application/json",
                    "X-Runner-Key": settings.INTERNAL_SERVICE_KEY,
                },
            )
            if res.status_code >= 300:
                _external_reply_logger.warning(
                    "naver_works reply push non-2xx",
                    status=res.status_code,
                    body=res.text[:300],
                    thread_id=thread.get("id"),
                )
    except Exception as err:  # noqa: BLE001
        _external_reply_logger.warning(
            "naver_works reply push failed",
            error=str(err),
            thread_id=thread.get("id"),
        )


def _sanitize_data(data: Any) -> Any:
    """비직렬화 객체(예: LangChain 메시지)를 딕셔너리로 변환"""
    if isinstance(data, list):
        return [_sanitize_data(i) for i in data]
    if isinstance(data, dict):
        return {k: _sanitize_data(v) for k, v in data.items()}

    # LangChain 메시지 객체인 경우 (AIMessage, HumanMessage 등)
    if hasattr(data, "to_json"):
        try:
            if hasattr(data, "dict"):
                return data.dict()
            return str(data)
        except Exception:
            return str(data)

    # Pydantic 모델 등 .dict()가 있는 경우
    if hasattr(data, "dict") and callable(getattr(data, "dict")):
        return data.dict()

    if not isinstance(data, (str, int, float, bool, type(None))):
        return str(data)

    return data


async def create(
    project_id: str,
    agent_id: str | None = None,
    team_id: str | None = None,
    title: str | None = None,
    user_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    thread_id = str(uuid.uuid4())
    record = await execute_returning(
        """
        INSERT INTO threads (id, project_id, agent_id, team_id, title, user_id, metadata, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW())
        RETURNING id, project_id, status
        """,
        (thread_id, project_id, agent_id, team_id, title, user_id, json.dumps(metadata or {})),
    )
    return {
        "id": record["id"],
        "projectId": record["project_id"],
        "status": record["status"],
    }


async def list_threads(
    project_id: str,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    if status:
        rows = await fetch_all(
            "SELECT id, project_id, title, status, agent_id, team_id, created_at, updated_at "
            "FROM threads WHERE project_id = $1 AND status = $2 ORDER BY updated_at DESC LIMIT $3 OFFSET $4",
            (project_id, status, limit, offset),
        )
    else:
        rows = await fetch_all(
            "SELECT id, project_id, title, status, agent_id, team_id, created_at, updated_at "
            "FROM threads WHERE project_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3",
            (project_id, limit, offset),
        )
    return [
        {
            "id": r["id"],
            "projectId": r["project_id"],
            "title": r["title"],
            "status": r["status"],
            "agentId": r["agent_id"],
            "teamId": r["team_id"],
            "createdAt": r["created_at"].isoformat(),
            "updatedAt": r["updated_at"].isoformat(),
        }
        for r in rows
    ]


async def get(thread_id: str) -> dict[str, Any]:
    record = await fetch_one(
        "SELECT id, project_id, agent_id, team_id, title, status, metadata, user_id FROM threads WHERE id = $1",
        (thread_id,),
    )
    if not record:
        raise ValueError(f"Thread not found: {thread_id}")
    return {
        "id": record["id"],
        "projectId": record["project_id"],
        "agentId": record["agent_id"],
        "teamId": record["team_id"],
        "title": record["title"],
        "status": record["status"],
        "metadata": record["metadata"] or {},
        "userId": record.get("user_id"),
    }


async def get_messages(thread_id: str) -> dict[str, Any]:
    thread = await get(thread_id)
    agent_id = thread.get("agentId")
    if not agent_id:
        return {"messages": [], "subagentTodos": []}
    return await agents_service.get_messages(agent_id, thread_id)


async def get_runs(thread_id: str) -> list[dict[str, Any]]:
    """thread 에 속한 모든 workflow_runs + step_traces 시간순 조회.

    응답 형식 (시간순 정렬):
        [
          {
            "runId": str,
            "status": "completed" | "failed",
            "startedAt": iso,
            "completedAt": iso | None,
            "latencyMs": int | None,
            "steps": [
              {
                "stepId": str | None,
                "parentStepId": str | None,
                "depth": int,
                "name": str,
                "stepType": "tool" | "agent" | "llm",
                "status": "completed" | "failed" | ...,
                "latencyMs": int | None,
                "startedAt": iso,
                "completedAt": iso | None,
              }
            ]
          }
        ]
    """
    runs = await fetch_all(
        """
        SELECT id, status, started_at, completed_at, latency_ms
        FROM workflow_runs
        WHERE thread_id = $1
        ORDER BY started_at ASC
        """,
        (thread_id,),
    )
    if not runs:
        return []

    run_ids = [r["id"] for r in runs]
    placeholders = ",".join(f"${i + 1}" for i in range(len(run_ids)))
    traces = await fetch_all(
        f"""
        SELECT run_id, step_id, parent_step_id, depth, node_name, node_type,
               status, latency, started_at, completed_at
        FROM step_traces
        WHERE run_id IN ({placeholders})
        ORDER BY started_at ASC
        """,
        tuple(run_ids),
    )

    def _iso_utc(value: Any) -> str | None:
        """DB 의 naive UTC datetime 을 항상 'Z' suffix 가 붙은 ISO 문자열로 직렬화.

        Reason: 프런트엔드 `new Date()` 는 'Z' 가 없으면 로컬 TZ 로 해석한다. 다른
        엔드포인트(NestJS/Prisma)는 'Z' 를 붙여 UTC 로 내려보내는데, 여기서만 빠지면
        브라우저 측 비교 로직(HITL ↔ run 매칭 등)이 깨진다.
        """
        if not value:
            return None
        s = value.isoformat()
        return s if s.endswith("Z") or "+" in s[10:] else f"{s}Z"

    by_run: dict[str, list[dict[str, Any]]] = {rid: [] for rid in run_ids}
    for t in traces:
        by_run.setdefault(t["run_id"], []).append({
            "stepId": t.get("step_id"),
            "parentStepId": t.get("parent_step_id"),
            "depth": int(t.get("depth") or 0),
            "name": t["node_name"],
            "stepType": t["node_type"],
            "status": t["status"],
            "latencyMs": t.get("latency"),
            "startedAt": _iso_utc(t.get("started_at")),
            "completedAt": _iso_utc(t.get("completed_at")),
        })

    return [
        {
            "runId": r["id"],
            "status": r["status"],
            "startedAt": _iso_utc(r.get("started_at")),
            "completedAt": _iso_utc(r.get("completed_at")),
            "latencyMs": r.get("latency_ms"),
            "steps": by_run.get(r["id"], []),
        }
        for r in runs
    ]


async def _pump_stream(
    stream: Any,
    thread_id: str,
    turn_id: str,
    cancel_collector: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """에이전트 이벤트 스트림을 WS emit 으로 전달하고 최종 상태 dict 를 반환한다.

    반환 dict:
        {
          "final_content": str,
          "final_result": dict | None,  # run.completed data
          "interrupt": dict | None,      # hitl.interrupt data (actionRequests, reviewConfigs)
          "error": str | None,           # bridge 가 yield 한 error 이벤트 메시지
        }
    """
    import structlog
    _log = structlog.get_logger(__name__)

    final_content: str = ""
    final_result: dict[str, Any] | None = None
    interrupt_payload: dict[str, Any] | None = None
    recursion_limit_payload: dict[str, Any] | None = None
    error_message: str | None = None
    step_events: list[dict[str, Any]] = []
    open_steps: dict[str, dict[str, Any]] = {}

    has_meaningful_content: bool = False

    async for chunk in stream:
        event = chunk.get("event")
        data = chunk.get("data", {})

        if event == "token":
            step_id = data.get("stepId") or data.get("runStepId") or f"stream-{uuid.uuid4().hex[:8]}"
            done = data.get("done", False)
            token = data.get("token", "")
            if not done:
                final_content += token
                # CancelledError 발생 시점에도 누적 텍스트를 보존하기 위해 외부 collector 에 동기화.
                if cancel_collector is not None:
                    cancel_collector["final_content"] = final_content
            
            # 유의미한 첫 토큰(공백/줄바꿈 제외)이 오기 전까지는 공백만 있는 토큰의 WS emit 을 억제하여 빈 말풍선 방지.
            # (done: True 일지라도 유의미한 내용이 없었다면 프론트에 알릴 필요가 없음)
            should_emit = True
            if not has_meaningful_content:
                if not token.strip():
                    should_emit = False
                else:
                    has_meaningful_content = True
            
            if should_emit:
                await emit_agent_token(
                    thread_id,
                    turn_id=turn_id,
                    step_id=step_id,
                    content=token,
                    delta=True,
                    done=done,
                    parent_step_id=data.get("parentStepId"),
                    depth=data.get("depth", 0),
                )

        elif event == "reasoning.token":
            step_id = data.get("stepId") or data.get("runStepId") or f"reasoning-{uuid.uuid4().hex[:8]}"
            done = data.get("done", False)
            await emit_agent_reasoning(
                thread_id,
                turn_id=turn_id,
                step_id=step_id,
                content=data.get("token", ""),
                delta=True,
                done=done,
                parent_step_id=data.get("parentStepId"),
                depth=data.get("depth", 0),
            )

        elif event == "plan.created":
            await emit_plan_created(thread_id, turn_id, data.get("steps", []))

        elif event == "step.started":
            await emit_step_started(
                thread_id,
                turn_id=turn_id,
                step_id=data["stepId"],
                step_type=data.get("stepType", "tool"),
                name=data["name"],
                node_id=data.get("nodeId", data["name"]),
                input=data.get("input"),
                parent_step_id=data.get("parentStepId"),
                depth=data.get("depth", 0),
            )
            open_steps[data["stepId"]] = {
                "name": data["name"],
                "stepType": data.get("stepType", "tool"),
                "nodeId": data.get("nodeId", data["name"]),
                "input": data.get("input"),
                "startedAt": datetime.now(timezone.utc),
            }

        elif event == "step.completed":
            await emit_step_completed(
                thread_id,
                turn_id=turn_id,
                step_id=data["stepId"],
                step_type=data.get("stepType", "tool"),
                name=data["name"],
                node_id=data.get("nodeId", data["name"]),
                latency_ms=data.get("latencyMs", 0),
                output=data.get("output"),
                parent_step_id=data.get("parentStepId"),
                depth=data.get("depth", 0),
            )
            opened = open_steps.pop(data["stepId"], None)
            now = datetime.now(timezone.utc)
            step_events.append({
                "stepId": data["stepId"],
                "parentStepId": data.get("parentStepId"),
                "depth": data.get("depth", 0),
                "name": data["name"],
                "stepType": data.get("stepType", "tool"),
                "nodeId": data.get("nodeId", data["name"]),
                "input": (opened or {}).get("input"),
                "output": data.get("output"),
                "latencyMs": data.get("latencyMs", 0),
                "status": "completed",
                "startedAt": (opened or {}).get("startedAt") or now,
                "completedAt": now,
            })

        elif event == "step.failed":
            await emit_step_failed(
                thread_id,
                turn_id=turn_id,
                step_id=data["stepId"],
                step_type=data.get("stepType", "tool"),
                name=data["name"],
                node_id=data.get("nodeId", data["name"]),
                error=data.get("error", "Unknown error"),
                latency_ms=data.get("latencyMs", 0),
                parent_step_id=data.get("parentStepId"),
                depth=data.get("depth", 0),
            )
            opened = open_steps.pop(data["stepId"], None)
            now = datetime.now(timezone.utc)
            step_events.append({
                "stepId": data["stepId"],
                "parentStepId": data.get("parentStepId"),
                "depth": data.get("depth", 0),
                "name": data["name"],
                "stepType": data.get("stepType", "tool"),
                "nodeId": data.get("nodeId", data["name"]),
                "input": (opened or {}).get("input"),
                "output": None,
                "error": data.get("error", "Unknown error"),
                "latencyMs": data.get("latencyMs", 0),
                "status": "failed",
                "startedAt": (opened or {}).get("startedAt") or now,
                "completedAt": now,
            })

        elif event == "hitl.interrupt":
            interrupt_payload = data

        elif event == "recursion.limit_reached":
            recursion_limit_payload = data

        elif event == "run.completed":
            final_result = _sanitize_data(data)

        elif event == "error":
            error_message = str(data.get("message") or "unknown bridge error")
            _log.error("bridge yielded error event",
                       thread_id=thread_id,
                       turn_id=turn_id,
                       message=error_message,
                       error_type=data.get("type"))

    return {
        "final_content": final_content,
        "final_result": final_result,
        "interrupt": interrupt_payload,
        "recursion_limit": recursion_limit_payload,
        "error": error_message,
        "step_events": step_events,
    }


async def _persist_run(
    *,
    agent_id: str,
    thread_id: str,
    pump: dict[str, Any],
    input_text: str,
    started_at: datetime,
    completed_at: datetime,
    status: str,
    error_message: str | None = None,
) -> None:
    """turn 정상 종료/실패 시 workflow_runs + step_traces 1세트 기록.

    실패해도 사용자 응답에는 영향 없도록 try/except 로 감싼다.
    """
    try:
        agent_row = await fetch_one(
            "SELECT project_id, config FROM agents WHERE id = $1",
            (agent_id,),
        )
        project_id = agent_row.get("project_id") if agent_row else None
        agent_config = agent_row.get("config") if agent_row else None
        environment: str | None = None
        if isinstance(agent_config, dict):
            environment = agent_config.get("environment")

        usage = ((pump.get("final_result") or {}).get("usage")) or {}
        step_events = pump.get("step_events") or []

        # 마지막 어시스턴트 메시지를 output_text 로 사용
        output_text: str | None = pump.get("final_content") or None
        final_result = pump.get("final_result") or {}
        if isinstance(final_result, dict):
            for msg in reversed(final_result.get("messages", []) or []):
                if not isinstance(msg, dict):
                    continue
                if msg.get("role") in ("assistant", "ai") and not msg.get("toolCalls"):
                    if msg.get("content"):
                        output_text = msg.get("content")
                        break

        await record_run(
            agent_id=agent_id,
            thread_id=thread_id,
            project_id=project_id,
            workflow_id=None,
            environment=environment,
            model_id=usage.get("modelId") or None,
            status=status,
            started_at=started_at,
            completed_at=completed_at,
            input_text=input_text,
            output_text=output_text,
            error_message=error_message,
            input_tokens=int(usage.get("inputTokens") or 0),
            output_tokens=int(usage.get("outputTokens") or 0),
            total_cost=float(usage.get("totalCost") or 0.0),
            step_events=step_events,
        )
    except Exception:  # noqa: BLE001
        import structlog
        structlog.get_logger(__name__).exception(
            "_persist_run failed", agent_id=agent_id, status=status
        )


def _tool_schema_from_args(args: dict[str, Any] | None) -> dict[str, Any]:
    """actionRequest.args 로부터 JSON Schema(object) 를 추정한다.

    별도 도구 카탈로그 조회 경로가 정비되기 전 임시 폴백.
    각 key 는 현재 값의 타입을 보고 type 만 채운다.
    """
    props: dict[str, Any] = {}
    if isinstance(args, dict):
        for key, val in args.items():
            if isinstance(val, bool):
                props[key] = {"type": "boolean"}
            elif isinstance(val, int):
                props[key] = {"type": "integer"}
            elif isinstance(val, float):
                props[key] = {"type": "number"}
            elif isinstance(val, list):
                props[key] = {"type": "array", "items": {"type": "string"}}
            elif isinstance(val, dict):
                props[key] = {"type": "object"}
            else:
                props[key] = {"type": "string"}
    return {"type": "object", "properties": props}


async def _handle_recursion_continuation(
    thread_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """recursion limit 도달 → '더 진행할까요?' HITL interaction 생성 + emit.

    payload: {"currentStepLimit": int, "nextStepLimit": int}
    """
    current_limit = int(payload.get("currentStepLimit", 0))
    next_limit = int(payload.get("nextStepLimit", current_limit + 40))
    prompt = (
        f"에이전트가 {current_limit} step 한도에 도달했습니다. "
        f"이어서 더 진행할까요? (추가 {next_limit - current_limit} step 부여)"
    )

    interaction = await hitl_service.create_interaction(
        thread_id=thread_id,
        interaction_type="approval",
        prompt=prompt,
        options=None,
        agent_context={
            "recursionLimitReached": True,
            "currentStepLimit": current_limit,
            "nextStepLimit": next_limit,
            "actionRequests": [],
            "reviewConfigs": [],
        },
    )
    # 프런트 HitlApprovalCard 가 인식할 수 있도록 표준 필드 형태 보강
    interaction["toolName"] = "__continue__"
    interaction["toolArgs"] = {}
    interaction["allowedDecisions"] = ["approve", "reject"]
    interaction["recursionLimitReached"] = True

    await emit_hitl_request(thread_id, interaction)
    return interaction


async def _resolve_tool_card_id(thread_id: str, tool_name: str) -> str:
    """도구별 HITL 카드 ID 결정.

    우선순위:
      1. Agent.toolPermissions[tool_name].cardId  (도구 권한에 명시된 override)
      2. card_definitions 중 targetTools 에 tool_name 이 포함된 가장 최근 카드
      3. 'hitl-input-card' (generic fallback)
    """
    fallback = "hitl-input-card"
    try:
        thread_row = await fetch_one(
            "SELECT agent_id FROM threads WHERE id = $1",
            (thread_id,),
        )
        agent_id = thread_row.get("agent_id") if thread_row else None
        if agent_id:
            agent_row = await fetch_one(
                "SELECT tool_permissions FROM agents WHERE id = $1",
                (agent_id,),
            )
            if agent_row:
                perms = agent_row.get("tool_permissions") or {}
                if isinstance(perms, str):
                    try:
                        perms = json.loads(perms)
                    except Exception:
                        perms = {}
                entry = perms.get(tool_name) if isinstance(perms, dict) else None
                if isinstance(entry, dict):
                    card_id = entry.get("cardId")
                    if isinstance(card_id, str) and card_id:
                        return card_id

        # targetTools 매칭 — 같은 cardId 의 최신 version 중 하나만 봐도 충분 (배열 동일).
        match = await fetch_one(
            """
            SELECT card_id
              FROM card_definitions
             WHERE category = 'hitl'
               AND $1 = ANY(target_tools)
             ORDER BY updated_at DESC
             LIMIT 1
            """,
            (tool_name,),
        )
        if match and match.get("card_id"):
            return str(match["card_id"])
    except Exception:
        return fallback
    return fallback


async def _handle_interrupt(
    thread_id: str,
    interrupt_payload: dict[str, Any],
) -> dict[str, Any]:
    """hitl.interrupt 페이로드를 기반으로 human_interactions 레코드를 생성하고 WS 이벤트를 발송한다."""
    action_requests: list[dict[str, Any]] = interrupt_payload.get("actionRequests", []) or []
    review_configs: list[dict[str, Any]] = interrupt_payload.get("reviewConfigs", []) or []
    parent_task_args: dict[str, Any] | None = interrupt_payload.get("parentTaskArgs")
    primary = action_requests[0] if action_requests else {"name": "tool", "args": {}}
    tool_name: str = primary.get("name") or "tool"
    args: dict[str, Any] = primary.get("args") or {}

    # 사람이 읽을 수 있는 prompt — 카드의 hitl_header 블록이 별도로 toolDisplayName 매핑을 수행하므로
    # 백엔드는 raw tool name 만 그대로 노출. 모델 이름(Claude 등) 고유명사를 노출하지 않는다.
    args_text = " ".join(str(v) for v in args.values() if v not in (None, "")).strip()
    prompt = f"에이전트가 {tool_name} 도구를 실행하려 합니다. 허용하시겠습니까?".strip()
    if args_text:
        # 옛 카드(text 블록이 prompt 를 그대로 출력) 호환 — args 요약은 별도 필드로도 보존.
        pass

    allowed_for_primary: list[str] = []
    for cfg in review_configs:
        if cfg.get("actionName") == tool_name:
            allowed_for_primary = list(cfg.get("allowedDecisions") or [])
            break
    if not allowed_for_primary:
        allowed_for_primary = ["approve", "edit", "reject"]

    # 카드용 — primary 도구 args 의 JSON Schema 추정 (도구 카탈로그 미정 시 임시 폴백)
    primary_tool_schema = _tool_schema_from_args(args)

    # 다중 actionRequest 표시용 — suggestion_list 블록이 읽도록 title/body 부착
    import json as _json
    display_action_requests: list[dict[str, Any]] = []
    for ar in action_requests:
        ar_name = ar.get("name") or "tool"
        ar_args = ar.get("args") or {}
        try:
            body_text = _json.dumps(ar_args, ensure_ascii=False)
        except Exception:
            body_text = str(ar_args)
        display_action_requests.append({
            **ar,
            "title": ar_name,
            "body": body_text,
            "severity": "med",
        })

    interaction = await hitl_service.create_interaction(
        thread_id=thread_id,
        interaction_type="approval",
        prompt=prompt,
        options=None,
        agent_context={
            "actionRequests": action_requests,
            "reviewConfigs": review_configs,
            "parentTaskArgs": parent_task_args,
            # 카드 단일 경로 — HitlDynamicCard 가 cardDefinitionId 보고 자동 렌더.
            # Phase 2: 도구별 매핑 — Agent.toolPermissions[tool_name].cardId, 미설정 시 hitl-input-card 폴백.
            "cardDefinitionId": await _resolve_tool_card_id(thread_id, tool_name),
            "cardVersion": 1,
            "cardData": {
                "mode": "approval",
                "prompt": prompt,
                "actionRequests": display_action_requests,
                "reviewConfigs": review_configs,
                "primaryToolName": tool_name,
                "primaryToolArgs": args,
                "toolSchema": primary_tool_schema,
                "allowedDecisions": allowed_for_primary,
                "parentTaskArgs": parent_task_args,
                "multiAction": len(action_requests) > 1,
            },
        },
    )
    interaction["actionRequests"] = action_requests
    interaction["reviewConfigs"] = review_configs
    interaction["toolName"] = tool_name
    interaction["toolArgs"] = args
    interaction["allowedDecisions"] = allowed_for_primary

    await emit_hitl_request(thread_id, interaction)
    return interaction


async def send_message(
    thread_id: str,
    message: str,
    user_credentials: dict[str, str] | None = None,
    user_id: str | None = None,
    architecture_override: str | None = None,
    source: str | None = None,
    user_mcp_envs: dict[str, dict[str, str]] | None = None,
) -> dict[str, Any]:
    thread = await get(thread_id)
    agent_id = thread.get("agentId")

    if not agent_id:
        raise ValueError("Thread has no associated agent")

    await execute(
        "UPDATE threads SET status = 'active', updated_at = NOW() WHERE id = $1",
        (thread_id,),
    )

    if not thread.get("title"):
        title = message[:50] + "..." if len(message) > 50 else message
        await execute(
            "UPDATE threads SET title = $2, updated_at = NOW() WHERE id = $1",
            (thread_id, title),
        )

    turn_id = uuid.uuid4().hex
    started_at_run = datetime.now(timezone.utc)
    await emit_turn_started(thread_id, turn_id)

    # cancel 흐름을 위해 현재 task 를 registry 에 등록 — POST /threads/{id}/cancel 이 task.cancel() 호출.
    current_task = asyncio.current_task()
    if current_task is not None:
        cancel_registry.register(thread_id, current_task)
    # _pump_stream 안의 누적 final_content 를 cancel 시점에도 보존하기 위해 collector dict 를 공유.
    cancel_collector: dict[str, Any] = {"final_content": ""}

    try:
        pump = await _pump_stream(
            agents_service.stream(
                agent_id,
                thread_id,
                message,
                turn_id=turn_id,
                user_credentials=user_credentials,
                user_id=user_id,
                architecture_override=architecture_override,
                source=source,
                user_mcp_envs=user_mcp_envs,
            ),
            thread_id,
            turn_id,
            cancel_collector=cancel_collector,
        )

        if pump["interrupt"] is not None:
            interaction = await _handle_interrupt(thread_id, pump["interrupt"])
            return {"threadId": thread_id, "status": "paused", "interaction": interaction, "messages": []}

        if pump.get("recursion_limit") is not None:
            interaction = await _handle_recursion_continuation(thread_id, pump["recursion_limit"])
            return {"threadId": thread_id, "status": "paused", "interaction": interaction, "messages": []}

        if pump.get("error"):
            from fastapi import HTTPException
            await execute(
                "UPDATE threads SET status = 'failed', updated_at = NOW() WHERE id = $1",
                (thread_id,),
            )
            await _persist_run(
                agent_id=agent_id,
                thread_id=thread_id,
                pump=pump,
                input_text=message,
                started_at=started_at_run,
                completed_at=datetime.now(timezone.utc),
                status="failed",
                error_message=pump["error"],
            )
            raise HTTPException(status_code=502, detail=pump["error"])

        final_content = pump["final_content"]
        final_result = pump["final_result"]

        turn_final_content = final_content
        if final_result and isinstance(final_result, dict):
            for msg in reversed(final_result.get("messages", [])):
                if not isinstance(msg, dict):
                    continue
                if msg.get("role") in ("assistant", "ai") and not msg.get("toolCalls"):
                    clean = msg.get("content", "")
                    if clean:
                        turn_final_content = clean
                        break

        await emit_turn_completed(
            thread_id,
            turn_id,
            turn_final_content,
            usage=(final_result or {}).get("usage") if isinstance(final_result, dict) else None,
        )
        await emit_thread_updated(thread_id, turn_id, "active")

        # 외부 채널(NAVER WORKS 1:1 등) push — best-effort, 실패해도 turn 정상 완료
        try:
            await _maybe_push_external_reply(thread, turn_final_content)
        except Exception:  # noqa: BLE001
            _external_reply_logger.exception(
                "_maybe_push_external_reply unexpected error", thread_id=thread_id
            )

        await _persist_run(
            agent_id=agent_id,
            thread_id=thread_id,
            pump=pump,
            input_text=message,
            started_at=started_at_run,
            completed_at=datetime.now(timezone.utc),
            status="completed",
        )

        messages: list[dict[str, Any]] = []
        if final_result and isinstance(final_result, dict):
            maybe_messages = final_result.get("messages")
            if isinstance(maybe_messages, list):
                messages = maybe_messages

        if not messages and final_content.strip():
            messages = [{"role": "assistant", "content": final_content}]

        if not messages:
            stored = await agents_service.get_messages(agent_id, thread_id)
            if stored:
                return {"threadId": thread_id, "messages": _sanitize_data(stored)}

        if not messages:
            return {"threadId": thread_id, "messages": []}

        return {"threadId": thread_id, "messages": messages}

    except asyncio.CancelledError:
        # 사용자 요청에 의한 중지 — cleanup 은 cancellation 영향을 받지 않도록 shield.
        partial_text = cancel_collector.get("final_content", "") if cancel_collector else ""
        try:
            await asyncio.shield(
                _handle_run_cancelled(
                    agent_id=agent_id,
                    thread_id=thread_id,
                    turn_id=turn_id,
                    partial_text=partial_text,
                    started_at=started_at_run,
                )
            )
        except Exception:
            import structlog
            structlog.get_logger(__name__).exception(
                "_handle_run_cancelled failed", thread_id=thread_id, turn_id=turn_id
            )
        raise
    except Exception:
        await execute(
            "UPDATE threads SET status = 'failed', updated_at = NOW() WHERE id = $1",
            (thread_id,),
        )
        raise
    finally:
        cancel_registry.unregister(thread_id)


async def _handle_run_cancelled(
    *,
    agent_id: str,
    thread_id: str,
    turn_id: str,
    partial_text: str,
    started_at: datetime,
) -> None:
    """사용자가 stop 을 눌렀을 때의 cleanup — WS 이벤트 + run row 영속화.

    graph state.todos 의 in_progress → pending revert 는 `deepagent_bridge` 의 CancelledError
    핸들러에서 이미 처리되었다. 클라이언트는 `run.cancelled` 이벤트를 받아 라이브 화면의
    todos 도 동일 정책으로 sweep 한다.
    """
    completed_at = datetime.now(timezone.utc)

    try:
        await emit_run_cancelled(thread_id, turn_id, partial_text)
    except Exception:  # noqa: BLE001
        import structlog
        structlog.get_logger(__name__).exception("emit_run_cancelled failed")

    try:
        await execute(
            "UPDATE threads SET status = 'active', updated_at = NOW() WHERE id = $1",
            (thread_id,),
        )
    except Exception:  # noqa: BLE001
        pass
    try:
        pump_stub: dict[str, Any] = {
            "final_content": partial_text,
            "final_result": None,
            "step_events": [],
        }
        await _persist_run(
            agent_id=agent_id,
            thread_id=thread_id,
            pump=pump_stub,
            input_text="",
            started_at=started_at,
            completed_at=completed_at,
            status="cancelled",
        )
    except Exception:  # noqa: BLE001
        import structlog
        structlog.get_logger(__name__).exception("_persist_run cancelled failed")


async def resume_message(
    thread_id: str,
    decisions: list[dict[str, Any]],
    edit_context: str | None = None,
    task_description_update: str | None = None,
    user_id: str | None = None,
    source: str | None = None,
    continue_after_recursion: bool = False,
    requested_step_limit: int | None = None,
) -> dict[str, Any]:
    """HITL 승인 응답을 받아 동일 thread 에서 agent 실행을 재개한다.

    user_id: HITL 응답자 user_id. 없으면 thread.userId (스레드 소유자) 로 폴백.
    이 user_id 가 자격증명 의존 도구(gmail_* 등) 의 OAuth 토큰 발급 시 사용됨.

    source: 'studio' | 'client' | None — 자격증명 소스 분기. 초기 invoke 와 동일하게 전달.
    """
    thread = await get(thread_id)
    agent_id = thread.get("agentId")
    if not agent_id:
        raise ValueError("Thread has no associated agent")

    # 응답자 user_id 없으면 thread 소유자 user_id 로 폴백 (둘 다 없으면 None)
    effective_user_id = user_id or thread.get("userId")

    await execute(
        "UPDATE threads SET status = 'active', updated_at = NOW() WHERE id = $1",
        (thread_id,),
    )

    turn_id = uuid.uuid4().hex
    started_at_run = datetime.now(timezone.utc)
    await emit_turn_started(thread_id, turn_id)

    try:
        pump = await _pump_stream(
            agents_service.resume_stream(
                agent_id,
                thread_id,
                decisions,
                edit_context=edit_context,
                task_description_update=task_description_update,
                user_id=effective_user_id,
                source=source,
                continue_after_recursion=continue_after_recursion,
                requested_step_limit=requested_step_limit,
            ),
            thread_id,
            turn_id,
        )

        if pump["interrupt"] is not None:
            interaction = await _handle_interrupt(thread_id, pump["interrupt"])
            return {"threadId": thread_id, "status": "paused", "interaction": interaction, "messages": []}

        if pump.get("recursion_limit") is not None:
            interaction = await _handle_recursion_continuation(thread_id, pump["recursion_limit"])
            return {"threadId": thread_id, "status": "paused", "interaction": interaction, "messages": []}

        if pump.get("error"):
            from fastapi import HTTPException
            await execute(
                "UPDATE threads SET status = 'failed', updated_at = NOW() WHERE id = $1",
                (thread_id,),
            )
            await _persist_run(
                agent_id=agent_id,
                thread_id=thread_id,
                pump=pump,
                input_text="",
                started_at=started_at_run,
                completed_at=datetime.now(timezone.utc),
                status="failed",
                error_message=pump["error"],
            )
            raise HTTPException(status_code=502, detail=pump["error"])

        final_content = pump["final_content"]
        final_result = pump["final_result"]

        turn_final_content = final_content
        if final_result and isinstance(final_result, dict):
            for msg in reversed(final_result.get("messages", [])):
                if not isinstance(msg, dict):
                    continue
                if msg.get("role") in ("assistant", "ai") and not msg.get("toolCalls"):
                    clean = msg.get("content", "")
                    if clean:
                        turn_final_content = clean
                        break

        await emit_turn_completed(
            thread_id,
            turn_id,
            turn_final_content,
            usage=(final_result or {}).get("usage") if isinstance(final_result, dict) else None,
        )
        await emit_thread_updated(thread_id, turn_id, "active")

        # 외부 채널(NAVER WORKS 1:1 등) push — best-effort, 실패해도 turn 정상 완료
        try:
            await _maybe_push_external_reply(thread, turn_final_content)
        except Exception:  # noqa: BLE001
            _external_reply_logger.exception(
                "_maybe_push_external_reply unexpected error", thread_id=thread_id
            )

        await _persist_run(
            agent_id=agent_id,
            thread_id=thread_id,
            pump=pump,
            input_text="",
            started_at=started_at_run,
            completed_at=datetime.now(timezone.utc),
            status="completed",
        )

        messages: list[dict[str, Any]] = []
        if final_result and isinstance(final_result, dict):
            maybe_messages = final_result.get("messages")
            if isinstance(maybe_messages, list):
                messages = maybe_messages

        return {"threadId": thread_id, "messages": messages}

    except Exception:
        await execute(
            "UPDATE threads SET status = 'failed', updated_at = NOW() WHERE id = $1",
            (thread_id,),
        )
        raise


async def update_status(thread_id: str, status: str) -> None:
    await execute(
        "UPDATE threads SET status = $2, updated_at = NOW() WHERE id = $1",
        (thread_id, status),
    )


async def archive(thread_id: str) -> None:
    await update_status(thread_id, "archived")


async def finalize_recursion_cancel(thread_id: str) -> dict[str, Any]:
    """recursion limit 안내에 사용자가 '그만' 응답한 경우 — graph 재실행 없이 turn 만 마감."""
    turn_id = uuid.uuid4().hex
    await emit_turn_started(thread_id, turn_id)
    cancel_msg = "사용자가 추가 진행을 중단했습니다. 지금까지 수집한 정보로 답변합니다."
    await emit_turn_completed(thread_id, turn_id, cancel_msg, usage=None)
    await emit_thread_updated(thread_id, turn_id, "active")
    return {"threadId": thread_id, "messages": [{"role": "assistant", "content": cancel_msg}]}
