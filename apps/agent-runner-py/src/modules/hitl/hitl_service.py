from datetime import datetime, timedelta, timezone
from typing import Any

from src.database.client import execute, execute_returning, fetch_all, fetch_one


async def create_interaction(
    thread_id: str,
    interaction_type: str,
    prompt: str,
    options: list[str] | None = None,
    timeout_seconds: int = 3600,
    agent_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    import json
    import uuid
    timeout_at = datetime.now(timezone.utc) + timedelta(seconds=timeout_seconds)
    interaction_id = str(uuid.uuid4())

    record = await execute_returning(
        """
        INSERT INTO human_interactions
            (id, thread_id, node_id, type, status, prompt, options, agent_context, timeout_at, created_at)
        VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, NOW())
        RETURNING id
        """,
        (
            interaction_id,
            thread_id,
            "hitl",
            interaction_type,
            prompt,
            json.dumps(options or []),
            json.dumps(agent_context or {}),
            timeout_at,
        ),
    )
    await execute(
        "UPDATE threads SET status = 'paused', updated_at = NOW() WHERE id = $1",
        (thread_id,),
    )

    return {
        "id": record["id"] if record else None,
        "threadId": thread_id,
        "type": interaction_type,
        "prompt": prompt,
        "options": options or [],
        "agentContext": agent_context or {},
        "status": "pending",
        "timeoutAt": timeout_at.isoformat(),
    }


async def list_pending(project_id: str) -> list[dict[str, Any]]:
    rows = await fetch_all(
        """
        SELECT hi.id, hi.thread_id, hi.type, hi.prompt, hi.status, hi.created_at
        FROM human_interactions hi
        JOIN threads t ON t.id = hi.thread_id
        WHERE hi.status = 'pending' AND t.project_id = $1
        ORDER BY hi.created_at DESC
        """,
        (project_id,),
    )
    return [
        {
            "id": r["id"],
            "threadId": r["thread_id"],
            "type": r["type"],
            "prompt": r["prompt"],
            "status": r["status"],
            "createdAt": r["created_at"].isoformat(),
        }
        for r in rows
    ]


def _normalize_decisions(response: Any) -> tuple[list[dict[str, Any]], str]:
    """프론트 응답 payload → deepagents `decisions` 리스트 + DB 저장용 status 로 정규화.

    프론트는 다음 형태로 보낸다:
        { "decision": "approve" | "reject" | "edit", "editedAction"?: {...} }
    여러 action_request 가 동시에 대기 중이더라도 현재 UI 는 primary 1건에만 응답하므로
    단일 decision 을 리스트로 래핑한다.

    Multi-action 개별 결정 (Phase 5):
        { "individualDecisions": { "<index|id>": "approve" | "reject" } }
    이 경우 `respond()` 가 actionRequests 를 알고 있어야 매칭 가능하므로 여기서는
    빈 리스트를 반환하고, 호출자가 별도 경로로 처리한다.
    """
    payload: dict[str, Any] = response if isinstance(response, dict) else {}

    if isinstance(payload.get("individualDecisions"), dict):
        # 호출자 (respond) 가 actionRequests 와 매칭해 채운다. 상태는 partial 이므로 approved 로 표기.
        return ([], "approved")

    decision: str = str(payload.get("decision") or "approve").lower()

    if decision == "reject":
        return ([{"type": "reject"}], "rejected")
    if decision == "edit":
        edited = payload.get("editedAction") or payload.get("edited_action") or {}
        if not isinstance(edited, dict) or not edited.get("name"):
            # edit 지정이 부실하면 approve 로 fallback
            return ([{"type": "approve"}], "approved")
        return ([{
            "type": "edit",
            "edited_action": {
                "name": edited.get("name"),
                "args": edited.get("args", {}) or {},
            },
        }], "approved")
    return ([{"type": "approve"}], "approved")


def _resolve_individual_decisions(
    payload: dict[str, Any],
    action_requests: list[Any],
) -> list[dict[str, Any]]:
    """`individualDecisions` 매핑을 actionRequests 순서대로 decisions 리스트로 변환.

    매핑 키는 (1) actionRequest 의 `id` 또는 `tool_call_id` (2) 인덱스 문자열 ("0", "1") 둘 다 지원.
    매핑이 없는 항목은 approve 로 폴백.
    """
    raw = payload.get("individualDecisions")
    mapping: dict[str, str] = raw if isinstance(raw, dict) else {}
    decisions: list[dict[str, Any]] = []
    for idx, req in enumerate(action_requests):
        req_dict = req if isinstance(req, dict) else {}
        key_id = str(req_dict.get("id") or req_dict.get("tool_call_id") or "")
        key_idx = str(idx)
        choice = mapping.get(key_id) or mapping.get(key_idx) or "approve"
        choice_norm = choice.lower() if isinstance(choice, str) else "approve"
        if choice_norm == "reject":
            decisions.append({"type": "reject"})
        else:
            decisions.append({"type": "approve"})
    return decisions


async def respond(
    interaction_id: str,
    response: Any,
    user_id: str | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    import json as _json

    decisions, status = _normalize_decisions(response)

    # edit 결정 시 원본 editPrompt + LLM 이 재작성한 task description 을 함께 추출
    edit_context: str | None = None
    task_description_update: str | None = None
    if decisions and decisions[0].get("type") == "edit":
        raw_payload: dict[str, Any] = response if isinstance(response, dict) else {}
        edit_context = (raw_payload.get("editPrompt") or raw_payload.get("edit_prompt") or "").strip() or None
        tdu_raw = raw_payload.get("taskDescriptionUpdate") or raw_payload.get("task_description_update")
        if isinstance(tdu_raw, str) and tdu_raw.strip():
            task_description_update = tdu_raw.strip()

    # interaction 의 agent_context 에서 action_requests 수를 읽어 decisions 를 복제
    # (deepagents 는 interrupt 당 pending tool_call 수만큼 decision 을 요구함.
    #  현재 UI 는 primary 1건만 노출하므로 동일한 decision 을 N 회 복제)
    interaction_row = await fetch_one(
        "SELECT thread_id, agent_context FROM human_interactions WHERE id = $1",
        (interaction_id,),
    )
    if not interaction_row:
        raise ValueError(f"Interaction not found: {interaction_id}")

    agent_context_raw = interaction_row.get("agent_context") or {}
    if isinstance(agent_context_raw, str):
        try:
            agent_context_raw = _json.loads(agent_context_raw)
        except Exception:
            agent_context_raw = {}

    # recursion limit continuation interaction 은 별도 경로: graph 를 input=None 으로 이어 실행
    # 하거나(reject 면) turn 을 그냥 마감한다. 일반 HITL decisions 처리는 건너뜀.
    if agent_context_raw.get("recursionLimitReached"):
        await execute_returning(
            """
            UPDATE human_interactions
            SET status = $1,
                response = $2,
                responded_at = NOW(),
                responded_by = $3
            WHERE id = $4
            RETURNING thread_id
            """,
            (status, _json.dumps(response), user_id, interaction_id),
        )
        thread_id: str = interaction_row["thread_id"]
        from src.modules.threads import threads_service
        if decisions and decisions[0].get("type") == "approve":
            next_limit = int(agent_context_raw.get("nextStepLimit", 0))
            result = await threads_service.resume_message(
                thread_id,
                decisions=[],
                user_id=user_id,
                source=source,
                continue_after_recursion=True,
                requested_step_limit=next_limit,
            )
        else:
            # 사용자가 중단 — graph 는 checkpoint 유지, turn 만 마감.
            result = await threads_service.finalize_recursion_cancel(thread_id)
        return {"threadId": thread_id, **{k: v for k, v in result.items() if k != "threadId"}}

    action_requests: list[Any] = agent_context_raw.get("actionRequests") or []
    expected_count = max(len(action_requests), 1)

    raw_payload_for_individual: dict[str, Any] = response if isinstance(response, dict) else {}
    if isinstance(raw_payload_for_individual.get("individualDecisions"), dict):
        # Multi-action 개별 결정 — actionRequests 순서대로 approve/reject 매칭.
        decisions = _resolve_individual_decisions(raw_payload_for_individual, action_requests)
        # 모두 reject 면 status 를 rejected 로, 일부라도 approve 가 있으면 approved 유지.
        if decisions and all(d.get("type") == "reject" for d in decisions):
            status = "rejected"
    # edit 은 특정 도구를 지정하는 구조라 복제가 위험 — 1개만 edit 하고 나머지는 approve 로 처리
    elif decisions and decisions[0].get("type") == "edit" and expected_count > 1:
        decisions = [decisions[0]] + [{"type": "approve"}] * (expected_count - 1)
    elif expected_count > len(decisions):
        decisions = decisions + [decisions[-1]] * (expected_count - len(decisions)) if decisions else [{"type": "approve"}] * expected_count

    record = await execute_returning(
        """
        UPDATE human_interactions
        SET status = $1,
            response = $2,
            responded_at = NOW(),
            responded_by = $3
        WHERE id = $4
        RETURNING thread_id
        """,
        (status, _json.dumps(response), user_id, interaction_id),
    )
    if not record:
        raise ValueError(f"Interaction not found: {interaction_id}")

    thread_id: str = record["thread_id"]

    thread = await fetch_one(
        "SELECT id, agent_id FROM threads WHERE id = $1",
        (thread_id,),
    )
    if not thread:
        raise ValueError(f"Thread not found: {thread_id}")

    from src.modules.threads import threads_service
    result = await threads_service.resume_message(
        thread_id,
        decisions,
        edit_context=edit_context,
        task_description_update=task_description_update,
        user_id=user_id,
        source=source,
    )
    # paused 응답(`status='paused'`)이든 정상 완료(`messages`만 있음)든 result 전체를
    # 그대로 노출해 hitl_gateway 가 emit 하는 `hitl.responded` 이벤트와 REST 응답에서
    # frontend 가 status / interaction / messages 를 모두 활용할 수 있도록.
    return {"threadId": thread_id, **{k: v for k, v in result.items() if k != "threadId"}}


async def preview_edit(interaction_id: str, edit_prompt: str) -> dict[str, Any]:
    """HITL "수정" 의도 자연어 → 새 args (LLM 변환).

    deepagents 공식 edit 결정은 `edited_action: {name, args}` 즉 구조화된 args 를 요구한다.
    프런트의 자연어 수정문(예: "3개로 수정해줘") 을 그 자리에서 변환해 반환하고,
    프런트는 결과를 사용자에게 한 번 더 확인시킨 뒤 실제 deepagents edit 결정으로 제출한다.

    이 함수는 **DB / deepagents 상태를 수정하지 않는다.** 순수 변환 헬퍼.

    SubAgent (task) 내부 도구가 인터셉트된 경우 부모 task.description 도 자연어로 함께 재작성한다
    (마커 패턴 미사용 — LLM 의 패턴 복제·재생산 방지).

    Returns:
        { "name": str, "args": dict, "originalArgs": dict, "taskDescriptionUpdate"?: str,
          "originalTaskDescription"?: str }
    """
    import json
    import os
    import re

    if not edit_prompt or not edit_prompt.strip():
        raise ValueError("editPrompt is required")

    row = await fetch_one(
        "SELECT agent_context FROM human_interactions WHERE id = $1",
        (interaction_id,),
    )
    if not row:
        raise ValueError(f"Interaction not found: {interaction_id}")

    raw_ctx = row.get("agent_context") or {}
    if isinstance(raw_ctx, str):
        try:
            raw_ctx = json.loads(raw_ctx)
        except Exception:
            raw_ctx = {}
    action_requests = raw_ctx.get("actionRequests") or []
    if not action_requests:
        raise ValueError("Interaction has no actionRequests")
    primary = action_requests[0]
    tool_name: str = primary.get("name") or "tool"
    original_args: dict[str, Any] = primary.get("args") or {}

    # 부모 task args (SubAgent 호출의 description 등) — _handle_interrupt 가 저장해 둔 것
    parent_task_args_raw = raw_ctx.get("parentTaskArgs")
    parent_task_args: dict[str, Any] | None = (
        parent_task_args_raw if isinstance(parent_task_args_raw, dict) else None
    )
    original_task_description: str | None = None
    if parent_task_args:
        desc_val = parent_task_args.get("description")
        if isinstance(desc_val, str) and desc_val.strip():
            original_task_description = desc_val

    # LLM 호출: 우선 interaction 의 agent 가 설정한 provider/model 을 사용한다 (사용자가 이미
    # 키를 등록·결제 중인 모델). DB 에서 못 찾으면 env(OPENAI/ANTHROPIC) 폴백.
    agent_row = await fetch_one(
        """
        SELECT
            m.model_id                  AS model_id,
            COALESCE(p.slug, 'openai')  AS provider_slug,
            p.api_key_encrypted         AS provider_api_key
        FROM human_interactions hi
        JOIN threads t ON t.id = hi.thread_id
        JOIN agents a  ON a.id = t.agent_id
        LEFT JOIN models m    ON (m.id::text = a.model_id OR m.model_id = a.model_id)
        LEFT JOIN providers p ON p.id = m.provider_id
        WHERE hi.id = $1
        LIMIT 1
        """,
        (interaction_id,),
    )

    # SubAgent 인터셉트 시: tool args + 부모 task description 둘 다 재작성
    # 단순 호출 시: tool args 만 재작성 (기존 동작 보존)
    if original_task_description:
        system_prompt = (
            "You are a tool argument editor for an AI agent system. The tool you are editing runs "
            "inside a SubAgent. The SubAgent's behavior is driven by its 'task description' "
            "(provided below). To make the user's edit take effect end-to-end, you must rewrite "
            "BOTH the tool arguments AND the SubAgent task description to consistently reflect "
            "the user's modification.\n\n"
            "Rules:\n"
            "1) Output ONLY a single JSON object with exactly two keys: \"args\" and "
            "\"taskDescription\". No markdown, no commentary.\n"
            "2) \"args\": updated tool arguments. Preserve every field the user did not ask to "
            "change. Use the same field names and types as the current arguments.\n"
            "3) If a required field in the current arguments is empty or invalid "
            "(e.g., a non-empty-string field has \"\", a count field is missing, an enum has an "
            "unknown value), repair it with a sensible value inferred from the task description. "
            "Examples: gmail_search.q=\"\" → \"in:inbox\" (or a query that matches the description's "
            "intent like \"is:unread\"); a missing limit → match the user's count in the description; "
            "an unknown enum → the closest valid value listed in the schema.\n"
            "4) \"taskDescription\": the SubAgent task description, rewritten in natural Korean "
            "to fully incorporate the user's modification. Do NOT add any explicit markers like "
            "'[사용자 수정 사항]', '수정 사항:', '편집:', etc. Embed the change naturally so the "
            "description reads as if originally written that way. Keep the same overall structure "
            "and constraints as the original description, only updating what the user asked for "
            "(e.g., the count, query scope, filter, etc.).\n"
            "5) Preserve the rest of the description verbatim where possible."
        )
        user_prompt = (
            f"Tool name: {tool_name}\n"
            f"Current tool arguments: {json.dumps(original_args, ensure_ascii=False)}\n"
            f"Current SubAgent task description: {original_task_description}\n"
            f"User edit instruction: {edit_prompt.strip()}\n\n"
            "Output JSON:"
        )
    else:
        system_prompt = (
            "You are a tool argument editor. Given a tool name, current arguments, and a user's "
            "natural-language edit instruction, return the updated arguments as a JSON object only. "
            "Preserve all fields the user did not ask to change. Use the same field names and types "
            "as the current arguments. If a required field in the current arguments is empty or "
            "invalid (e.g., a non-empty-string field has \"\", a count is missing), repair it with "
            "a sensible default inferred from the user instruction and tool name (for example, "
            "gmail_search.q=\"\" → \"in:inbox\" or a more specific query like \"is:unread\"). "
            "Output only a single JSON object, no markdown, no commentary."
        )
        user_prompt = (
            f"Tool name: {tool_name}\n"
            f"Current arguments: {json.dumps(original_args, ensure_ascii=False)}\n"
            f"User edit instruction: {edit_prompt.strip()}\n\n"
            "Updated arguments JSON:"
        )

    from langchain_core.messages import HumanMessage, SystemMessage

    llm = None
    if agent_row:
        from src.modules.langgraph.graph_builder import _create_model

        provider_slug = str(agent_row.get("provider_slug") or "openai").strip() or "openai"
        provider_api_key = agent_row.get("provider_api_key")
        model_id = str(agent_row.get("model_id") or "").strip()
        if model_id and (provider_api_key or os.getenv(f"{provider_slug.upper()}_API_KEY")):
            try:
                llm = _create_model(
                    provider_slug,
                    provider_api_key,
                    model_id,
                    {"temperature": 0, "maxTokens": 1024},
                )
            except Exception:
                llm = None

    if llm is None:
        openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
        anthropic_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
        if openai_key:
            from langchain_openai import ChatOpenAI

            edit_model = (os.getenv("HITL_EDIT_MODEL") or "gpt-4o-mini").strip()
            llm = ChatOpenAI(  # type: ignore[call-arg]
                api_key=openai_key,
                model=edit_model,
                temperature=0,
                max_tokens=1024,
                model_kwargs={"response_format": {"type": "json_object"}},
            )
        elif anthropic_key:
            from langchain_anthropic import ChatAnthropic

            edit_model = (os.getenv("HITL_EDIT_MODEL") or "claude-haiku-4-5-20251001").strip()
            llm = ChatAnthropic(  # type: ignore[call-arg]
                api_key=anthropic_key,
                model=edit_model,
                temperature=0,
                max_tokens=1024,
            )
        else:
            raise RuntimeError(
                "수정문을 변환할 LLM 을 찾을 수 없습니다 (agent 에 모델/API 키가 설정되지 "
                "않았고 OPENAI_API_KEY/ANTHROPIC_API_KEY 환경변수도 비어 있습니다)"
            )

    resp = await llm.ainvoke(
        [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
    )
    raw_text = str(resp.content) if resp.content else None

    if not raw_text:
        raise RuntimeError("LLM 응답이 비어있습니다")

    # LLM 이 코드펜스로 감싸 보낸 경우 안전하게 파싱
    cleaned = raw_text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        parsed_any = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"LLM 응답이 유효한 JSON 이 아닙니다: {raw_text[:200]}") from exc
    if not isinstance(parsed_any, dict):
        raise RuntimeError("LLM 응답이 JSON 객체가 아닙니다")

    if original_task_description:
        # 확장 응답: {"args": {...}, "taskDescription": "..."}
        new_args_raw = parsed_any.get("args")
        new_task_desc_raw = parsed_any.get("taskDescription")
        if not isinstance(new_args_raw, dict):
            raise RuntimeError("LLM 응답에 args 객체가 없습니다")
        new_task_desc = (
            new_task_desc_raw.strip()
            if isinstance(new_task_desc_raw, str) and new_task_desc_raw.strip()
            else None
        )
        return {
            "name": tool_name,
            "args": new_args_raw,
            "originalArgs": original_args,
            "taskDescriptionUpdate": new_task_desc,
            "originalTaskDescription": original_task_description,
        }

    # 단순 호출(SubAgent 외부): 기존 평면 응답 보존
    return {
        "name": tool_name,
        "args": parsed_any,
        "originalArgs": original_args,
    }
