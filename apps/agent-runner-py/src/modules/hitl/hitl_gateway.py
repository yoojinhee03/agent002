"""Socket.IO 게이트웨이 — WebSocket 이벤트 송수신"""
import asyncio
import os
from datetime import datetime, timezone

import socketio
import structlog

from src.modules.streaming import external_event_adapter as ext

logger = structlog.get_logger(__name__)

# 시연용 token streaming 가시화 delay (초 단위, 기본 0.015 = 15ms).
# OpenAI 가 같은 초 안에 chunk 50개를 쏟아내 사용자 눈에 streaming 효과가 안 보이는 회귀
# 차단용. AGENT_TOKEN_STREAM_DELAY_S=0 으로 설정하면 비활성화.
_TOKEN_STREAM_DELAY_S = float(os.getenv("AGENT_TOKEN_STREAM_DELAY_S", "0.015"))

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_interval=25,
    ping_timeout=60,
    max_http_buffer_size=20 * 1024 * 1024,
)

# Phase 9-3: 외부 client 용 namespace `/v1/chat` 핸들러 등록 (connect/subscribe + apiKey 검증)
from src.modules.streaming.external_namespace import register as _register_external_ns  # noqa: E402

_register_external_ns(sio)


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None):
    logger.info("WS Client connected", sid=sid, auth=auth)


@sio.event
async def disconnect(sid: str):
    logger.info("WS Client disconnected", sid=sid)


@sio.on("thread.subscribe")
async def on_subscribe(sid: str, data: dict):
    thread_id = data.get("threadId")
    if thread_id:
        await sio.enter_room(sid, f"thread:{thread_id}")
        participants = list(sio.manager.get_participants("/", f"thread:{thread_id}") or [])
        logger.info("WS thread.subscribe", sid=sid, thread_id=thread_id, room_size=len(participants))


@sio.on("thread.unsubscribe")
async def on_unsubscribe(sid: str, data: dict):
    thread_id = data.get("threadId")
    if thread_id:
        await sio.leave_room(sid, f"thread:{thread_id}")


@sio.on("hitl.respond")
async def on_hitl_respond(sid: str, data: dict):
    from src.modules.hitl.hitl_service import respond

    interaction_id = data.get("interactionId")
    response = data.get("response")
    user_id = data.get("userId") or None
    source_raw = data.get("source")
    source = source_raw if source_raw in ("studio", "client") else None
    if interaction_id and response is not None:
        result = await respond(interaction_id, response, user_id=user_id, source=source)
        await sio.emit("hitl.responded", result, room=f"thread:{result.get('threadId', '')}")


@sio.on("thread.message")
async def on_thread_message(sid: str, data: dict):
    await sio.emit("thread.message.received", data, room=sid)


# ──────────────────────────────────────────────────────────────
# Turn 이벤트 — 사용자 메시지 1개 = 1 Turn
# ──────────────────────────────────────────────────────────────

async def emit_turn_started(thread_id: str, turn_id: str):
    """AI 응답 턴 시작"""
    await sio.emit(
        "turn.started",
        {
            "type": "turn.started",
            "threadId": thread_id,
            "turnId": turn_id,
            "timestamp": _now(),
        },
        room=f"thread:{thread_id}",
    )
    await ext.forward_turn_started(sio, thread_id, turn_id)


async def emit_turn_completed(thread_id: str, turn_id: str, final_content: str, usage: dict | None = None):
    """AI 응답 턴 완료 — 최종 응답 전문 + usage(inputTokens/outputTokens/totalCost) 포함"""
    payload: dict = {
        "type": "turn.completed",
        "threadId": thread_id,
        "turnId": turn_id,
        "finalContent": final_content,
        "timestamp": _now(),
    }
    if usage is not None:
        payload["usage"] = usage
    await sio.emit("turn.completed", payload, room=f"thread:{thread_id}")
    await ext.forward_turn_completed(sio, thread_id, turn_id, final_content, usage)


async def emit_run_cancelled(thread_id: str, turn_id: str, partial_content: str = ""):
    """사용자 요청에 의한 응답 중지 — 부분 답변(있다면)을 함께 전달.

    클라이언트는 이 이벤트를 받으면 진행 중 표시를 해제하고 부분 답변에
    '응답이 중지되었습니다' 마커를 표시한다.
    """
    await sio.emit(
        "run.cancelled",
        {
            "type": "run.cancelled",
            "threadId": thread_id,
            "turnId": turn_id,
            "partialContent": partial_content,
            "timestamp": _now(),
        },
        room=f"thread:{thread_id}",
    )


# ──────────────────────────────────────────────────────────────
# Agent 토큰 이벤트 — LLM 출력 스트리밍
# ──────────────────────────────────────────────────────────────

async def emit_agent_token(
    thread_id: str,
    turn_id: str,
    step_id: str,
    content: str,
    delta: bool = True,
    done: bool = False,
    parent_step_id: str | None = None,
    depth: int = 0,
):
    """LLM 응답 토큰 스트리밍 (기존 emit_agent_streaming)"""
    await sio.emit(
        "agent.token",
        {
            "type": "agent.token",
            "threadId": thread_id,
            "turnId": turn_id,
            "stepId": step_id,
            "parentStepId": parent_step_id,
            "depth": depth,
            "content": content,
            "delta": delta,
            "done": done,
            "timestamp": _now(),
        },
        room=f"thread:{thread_id}",
    )
    await ext.forward_agent_token(sio, thread_id, turn_id, step_id, content, delta, done, depth)
    # 시연용 가시화 delay — 마지막 done=True chunk 는 즉시 흘려보내 turn.completed 와 race 없게.
    if _TOKEN_STREAM_DELAY_S > 0 and not done:
        await asyncio.sleep(_TOKEN_STREAM_DELAY_S)


async def emit_agent_reasoning(
    thread_id: str,
    turn_id: str,
    step_id: str,
    content: str,
    delta: bool = True,
    done: bool = False,
    parent_step_id: str | None = None,
    depth: int = 0,
):
    """추론(Chain-of-Thought) 토큰 스트리밍 (기존 emit_reasoning_streaming)"""
    await sio.emit(
        "agent.reasoning",
        {
            "type": "agent.reasoning",
            "threadId": thread_id,
            "turnId": turn_id,
            "stepId": step_id,
            "parentStepId": parent_step_id,
            "depth": depth,
            "content": content,
            "delta": delta,
            "done": done,
            "timestamp": _now(),
        },
        room=f"thread:{thread_id}",
    )


# ──────────────────────────────────────────────────────────────
# Step 이벤트 — 실행 단계 (도구 호출, 에이전트 등)
# ──────────────────────────────────────────────────────────────

async def emit_step_started(
    thread_id: str,
    turn_id: str,
    step_id: str,
    step_type: str,
    name: str,
    node_id: str,
    input: dict | None = None,
    parent_step_id: str | None = None,
    depth: int = 0,
):
    """단계 시작 (기존 emit_step_progress status='started')"""
    await sio.emit(
        "step.started",
        {
            "type": "step.started",
            "threadId": thread_id,
            "turnId": turn_id,
            "stepId": step_id,
            "parentStepId": parent_step_id,
            "depth": depth,
            "stepType": step_type,
            "name": name,
            "nodeId": node_id,
            "input": input,
            "timestamp": _now(),
        },
        room=f"thread:{thread_id}",
    )
    await ext.forward_step_started(
        sio, thread_id, turn_id, step_id, step_type, name, input, parent_step_id, depth
    )


async def emit_step_completed(
    thread_id: str,
    turn_id: str,
    step_id: str,
    step_type: str,
    name: str,
    node_id: str,
    latency_ms: int,
    output: dict | None = None,
    parent_step_id: str | None = None,
    depth: int = 0,
):
    """단계 완료 (기존 emit_step_progress status='completed')"""
    await sio.emit(
        "step.completed",
        {
            "type": "step.completed",
            "threadId": thread_id,
            "turnId": turn_id,
            "stepId": step_id,
            "parentStepId": parent_step_id,
            "depth": depth,
            "stepType": step_type,
            "name": name,
            "nodeId": node_id,
            "output": output,
            "latencyMs": latency_ms,
            "timestamp": _now(),
        },
        room=f"thread:{thread_id}",
    )
    await ext.forward_step_completed(
        sio, thread_id, turn_id, step_id, step_type, name, output, latency_ms, parent_step_id, depth
    )


async def emit_step_failed(
    thread_id: str,
    turn_id: str,
    step_id: str,
    step_type: str,
    name: str,
    node_id: str,
    error: str,
    latency_ms: int,
    parent_step_id: str | None = None,
    depth: int = 0,
):
    """단계 실패 (기존 emit_step_progress status='failed')"""
    await sio.emit(
        "step.failed",
        {
            "type": "step.failed",
            "threadId": thread_id,
            "turnId": turn_id,
            "stepId": step_id,
            "parentStepId": parent_step_id,
            "depth": depth,
            "stepType": step_type,
            "name": name,
            "nodeId": node_id,
            "error": error,
            "latencyMs": latency_ms,
            "timestamp": _now(),
        },
        room=f"thread:{thread_id}",
    )
    await ext.forward_step_failed(
        sio, thread_id, turn_id, step_id, step_type, name, error, latency_ms, parent_step_id, depth
    )


# ──────────────────────────────────────────────────────────────
# Thread / Plan 이벤트
# ──────────────────────────────────────────────────────────────

async def emit_thread_updated(thread_id: str, turn_id: str, status: str):
    """스레드 상태 변경 (기존 emit_thread_update)"""
    await sio.emit(
        "thread.updated",
        {
            "type": "thread.updated",
            "threadId": thread_id,
            "turnId": turn_id,
            "status": status,
            "timestamp": _now(),
        },
        room=f"thread:{thread_id}",
    )


async def emit_plan_created(thread_id: str, turn_id: str, steps: list[dict]):
    """에이전트가 수립한 실행 계획을 전송. steps 각 항목은 {"content": str, "status": "pending"|"in_progress"|"completed"}."""
    await sio.emit(
        "plan.created",
        {
            "type": "plan.created",
            "threadId": thread_id,
            "turnId": turn_id,
            "steps": steps,
            "timestamp": _now(),
        },
        room=f"thread:{thread_id}",
    )
    await ext.forward_plan_created(sio, thread_id, turn_id, steps)


async def emit_hitl_request(thread_id: str, interaction: dict):
    await sio.emit(
        "hitl.request",
        {"threadId": thread_id, "interaction": interaction},
        room=f"thread:{thread_id}",
    )
    await ext.forward_hitl_request(sio, thread_id, interaction)


async def emit_error(thread_id: str, message: str, error_type: str | None = None):
    """에러 이벤트 — 외부 client 에 chat.error 로 전달. 내부 namespace 에는 별도 emit 없음."""
    await ext.forward_error(sio, thread_id, message, error_type)
