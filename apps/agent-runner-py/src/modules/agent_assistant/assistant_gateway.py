"""Agent Assistant 전용 Socket.IO emit 헬퍼.

기존 `hitl_gateway.sio` 전역 서버를 그대로 재사용하고, `thread:{thread_id}` 룸으로 발행한다.
직접 `sio.emit` 호출 금지 규칙(AGENTS.md)에 따라 모든 assistant 이벤트는 이 헬퍼를 통해서만 발행한다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog

from src.modules.hitl.hitl_gateway import sio

logger = structlog.get_logger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def emit_edit_proposed(
    thread_id: str,
    edit: dict[str, Any],
) -> None:
    """기존 agent 의 부분 수정 제안 (AgentEditPatch) 발행."""
    room = f"thread:{thread_id}"
    try:
        participants = list(sio.manager.get_participants("/", room) or [])
        participant_count = len(participants)
    except Exception:  # noqa: BLE001
        participant_count = -1
    logger.info(
        "assistant.gateway emit_edit_proposed",
        thread_id=thread_id,
        changed_keys=list(edit.keys()),
        room_subscribers=participant_count,
    )
    await sio.emit(
        "assistant.edit_proposed",
        {
            "type": "assistant.edit_proposed",
            "threadId": thread_id,
            "timestamp": _now(),
            "edit": edit,
        },
        room=room,
    )


async def emit_step(
    thread_id: str,
    phase: str,  # "tool_start" | "tool_end" | "generating" | "thinking"
    label: str,
    tool_name: str | None = None,
) -> None:
    """Assistant 진행 단계 — UI 의 '…' 자리에 동적 라벨로 표시."""
    await sio.emit(
        "assistant.step",
        {
            "type": "assistant.step",
            "threadId": thread_id,
            "timestamp": _now(),
            "phase": phase,
            "label": label,
            "toolName": tool_name,
        },
        room=f"thread:{thread_id}",
    )


async def emit_node_proposed(
    thread_id: str,
    kind: str,  # "main" | "sub"
    node: dict[str, Any],
) -> None:
    """Assistant가 캔버스에 제안한 노드 (`status='proposed'` 미리보기) 발행."""
    room = f"thread:{thread_id}"
    # socket.io manager 에서 해당 room 에 참가한 클라이언트 sid 수 조회 — 0 이면 emit 해도
    # 받을 클라이언트가 없음 (WS subscribe race / 페이지 이탈 등).
    try:
        participants = list(sio.manager.get_participants("/", room) or [])
        participant_count = len(participants)
    except Exception:  # noqa: BLE001
        participant_count = -1
    logger.info(
        "assistant.gateway emit_node_proposed",
        thread_id=thread_id,
        kind=kind,
        node_id=node.get("id"),
        room_subscribers=participant_count,
    )
    await sio.emit(
        "assistant.node_proposed",
        {
            "type": "assistant.node_proposed",
            "threadId": thread_id,
            "timestamp": _now(),
            "kind": kind,
            "node": node,
        },
        room=room,
    )


async def emit_session_complete(
    thread_id: str,
    summary: str,
    final_nodes: list[dict[str, Any]],
    final_edges: list[dict[str, Any]],
) -> None:
    """Assistant 세션 종료 — '적용' 버튼 활성화 신호."""
    await sio.emit(
        "assistant.session_complete",
        {
            "type": "assistant.session_complete",
            "threadId": thread_id,
            "timestamp": _now(),
            "summary": summary,
            "finalNodes": final_nodes,
            "finalEdges": final_edges,
        },
        room=f"thread:{thread_id}",
    )
