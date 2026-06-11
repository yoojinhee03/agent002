"""External event adapter (Phase 9-3).

내부 hitl_gateway 가 발행하는 이벤트를 외부 client(`/v1/chat` namespace) 가
받기 좋은 형태로 정제해 emit 한다.

내부 / → 외부 /v1/chat 매핑:
    turn.started     → chat.turn_started
    agent.token      → chat.message_delta      (depth=0 only)
    agent.reasoning  → (drop)
    step.started     → chat.activity_started   (Activity 정규화 객체)
    step.completed   → chat.activity_completed (+ output 요약 + latencyMs)
    step.failed      → chat.activity_failed
    plan.created     → chat.plan
    hitl.interrupt   → chat.approval_required
    run.completed    → chat.turn_completed     (cost 제외)
    error            → chat.error

롤백 토글: `EXTERNAL_CHAT_ENABLED=false` 환경변수로 외부 namespace emit 을 즉시 비활성화한다.
값이 `false` 면 모든 forward_* 가 no-op 으로 동작 — 내부 디버그 패널은 영향 없음.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import structlog

from src.modules.streaming.activity_labels import (
    classify_step,
    label_for,
    summarize_input,
    summarize_output,
)

logger = structlog.get_logger(__name__)

EXTERNAL_NAMESPACE = "/v1/chat"

_ENABLED = os.environ.get("EXTERNAL_CHAT_ENABLED", "true").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}


def is_enabled() -> bool:
    """현재 외부 chat namespace emit 이 활성화되어 있는지 반환."""
    return _ENABLED


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _room(thread_id: str) -> str:
    return f"thread:{thread_id}"


def _build_activity(
    step_id: str,
    step_type: str | None,
    name: str | None,
    raw_input: Any = None,
    parent_step_id: str | None = None,
    depth: int = 0,
    status: str = "running",
    latency_ms: int | None = None,
) -> dict[str, Any]:
    kind = classify_step(step_type, name)
    label, icon = label_for(name or "", kind)
    activity: dict[str, Any] = {
        "activityId": step_id,
        "kind": kind,
        "name": name or "",
        "label": label,
        "icon": icon,
        "summary": summarize_input(name or "", raw_input),
        "depth": depth,
        "status": status,
    }
    if parent_step_id:
        activity["parentActivityId"] = parent_step_id
    if latency_ms is not None:
        activity["latencyMs"] = latency_ms
    return activity


# ──────────────────────────────────────────────────────────────
# Forward functions — hitl_gateway 가 emit_* 직후 호출
# ──────────────────────────────────────────────────────────────


async def forward_turn_started(sio: Any, thread_id: str, turn_id: str) -> None:
    await _safe_emit(sio, "chat.turn_started", thread_id, {
        "threadId": thread_id,
        "turnId": turn_id,
        "timestamp": _now(),
    })


async def forward_turn_completed(
    sio: Any,
    thread_id: str,
    turn_id: str,
    final_content: str,
    usage: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "threadId": thread_id,
        "turnId": turn_id,
        "finalContent": final_content,
        "timestamp": _now(),
    }
    if isinstance(usage, dict):
        payload["usage"] = {
            "tokens": usage.get("totalTokens") or usage.get("tokens") or 0,
            "latencyMs": usage.get("latencyMs"),
        }
    await _safe_emit(sio, "chat.turn_completed", thread_id, payload)


async def forward_agent_token(
    sio: Any,
    thread_id: str,
    turn_id: str,
    step_id: str,
    content: str,
    delta: bool,
    done: bool,
    depth: int,
) -> None:
    if depth != 0:
        return  # depth>0 (sub-agent 토큰) 은 외부에 노출하지 않는다
    await _safe_emit(sio, "chat.message_delta", thread_id, {
        "threadId": thread_id,
        "turnId": turn_id,
        "stepId": step_id,
        "content": content,
        "delta": delta,
        "done": done,
        "timestamp": _now(),
    })


async def forward_step_started(
    sio: Any,
    thread_id: str,
    turn_id: str,
    step_id: str,
    step_type: str,
    name: str,
    raw_input: Any,
    parent_step_id: str | None,
    depth: int,
) -> None:
    activity = _build_activity(
        step_id=step_id,
        step_type=step_type,
        name=name,
        raw_input=raw_input,
        parent_step_id=parent_step_id,
        depth=depth,
        status="running",
    )
    await _safe_emit(sio, "chat.activity_started", thread_id, {
        "threadId": thread_id,
        "turnId": turn_id,
        "activity": activity,
        "timestamp": _now(),
    })


async def forward_step_completed(
    sio: Any,
    thread_id: str,
    turn_id: str,
    step_id: str,
    step_type: str,
    name: str,
    raw_output: Any,
    latency_ms: int,
    parent_step_id: str | None,
    depth: int,
) -> None:
    activity = _build_activity(
        step_id=step_id,
        step_type=step_type,
        name=name,
        parent_step_id=parent_step_id,
        depth=depth,
        status="done",
        latency_ms=latency_ms,
    )
    activity["outputSummary"] = summarize_output(raw_output)
    await _safe_emit(sio, "chat.activity_completed", thread_id, {
        "threadId": thread_id,
        "turnId": turn_id,
        "activity": activity,
        "timestamp": _now(),
    })


async def forward_step_failed(
    sio: Any,
    thread_id: str,
    turn_id: str,
    step_id: str,
    step_type: str,
    name: str,
    error: str,
    latency_ms: int,
    parent_step_id: str | None,
    depth: int,
) -> None:
    activity = _build_activity(
        step_id=step_id,
        step_type=step_type,
        name=name,
        parent_step_id=parent_step_id,
        depth=depth,
        status="failed",
        latency_ms=latency_ms,
    )
    activity["errorMessage"] = error
    await _safe_emit(sio, "chat.activity_failed", thread_id, {
        "threadId": thread_id,
        "turnId": turn_id,
        "activity": activity,
        "timestamp": _now(),
    })


async def forward_plan_created(
    sio: Any, thread_id: str, turn_id: str, steps: list[dict[str, Any]]
) -> None:
    await _safe_emit(sio, "chat.plan", thread_id, {
        "threadId": thread_id,
        "turnId": turn_id,
        "steps": [
            {
                "content": s.get("content") or s.get("text") or "",
                "status": s.get("status") or "pending",
            }
            for s in (steps or [])
            if isinstance(s, dict)
        ],
        "timestamp": _now(),
    })


async def forward_hitl_request(sio: Any, thread_id: str, interaction: dict[str, Any]) -> None:
    await _safe_emit(sio, "chat.approval_required", thread_id, {
        "threadId": thread_id,
        "interactionId": interaction.get("id"),
        "actionRequests": interaction.get("actionRequests") or [],
        "allowedDecisions": interaction.get("allowedDecisions") or [],
        "prompt": interaction.get("prompt"),
        "timestamp": _now(),
    })


async def forward_error(
    sio: Any,
    thread_id: str,
    message: str,
    error_type: str | None = None,
) -> None:
    await _safe_emit(sio, "chat.error", thread_id, {
        "threadId": thread_id,
        "message": message,
        "type": error_type,
        "timestamp": _now(),
    })


# ──────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────


async def _safe_emit(sio: Any, event: str, thread_id: str, data: dict[str, Any]) -> None:
    """외부 namespace emit. EXTERNAL_CHAT_ENABLED=false 면 즉시 no-op.
    실패는 로깅만 하고 내부 흐름에 영향 주지 않는다."""
    if not _ENABLED:
        return
    try:
        await sio.emit(event, data, room=_room(thread_id), namespace=EXTERNAL_NAMESPACE)
    except Exception:  # noqa: BLE001
        logger.exception("external_event_adapter emit failed", event=event, thread_id=thread_id)
