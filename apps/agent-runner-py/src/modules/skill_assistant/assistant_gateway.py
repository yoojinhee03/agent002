"""Skill Assistant 전용 Socket.IO emit 헬퍼.

기존 `hitl_gateway.sio` 전역 서버를 그대로 재사용하고, `thread:{thread_id}` 룸으로 발행한다.
직접 `sio.emit` 호출 금지 규칙(AGENTS.md)에 따라 모든 skill assistant 이벤트는 이 헬퍼를 통해서만 발행한다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog

from src.modules.hitl.hitl_gateway import sio

logger = structlog.get_logger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def emit_step(
    thread_id: str,
    phase: str,  # "thinking" | "generating"
    label: str,
) -> None:
    """Skill Assistant 진행 단계 — UI 의 '…' 자리에 동적 라벨로 표시."""
    await sio.emit(
        "assistant.step",
        {
            "type": "assistant.step",
            "threadId": thread_id,
            "timestamp": _now(),
            "phase": phase,
            "label": label,
        },
        room=f"thread:{thread_id}",
    )


async def emit_skill_proposed(
    thread_id: str,
    skill_payload: dict[str, Any],
) -> None:
    """새 스킬 제안 발행 — 프론트가 사용자 확인 후 적용."""
    room = f"thread:{thread_id}"
    try:
        participants = list(sio.manager.get_participants("/", room) or [])
        participant_count = len(participants)
    except Exception:  # noqa: BLE001
        participant_count = -1
    logger.info(
        "skill_assistant.gateway emit_skill_proposed",
        thread_id=thread_id,
        skill_name=skill_payload.get("name"),
        room_subscribers=participant_count,
    )
    await sio.emit(
        "assistant.skill_proposed",
        {
            "type": "assistant.skill_proposed",
            "threadId": thread_id,
            "timestamp": _now(),
            "skill": skill_payload,
        },
        room=room,
    )


async def emit_skill_edit_proposed(
    thread_id: str,
    edit_payload: dict[str, Any],
    target_skill_id: str,
) -> None:
    """기존 스킬 수정 제안 발행 — 프론트가 사용자 확인 후 적용."""
    room = f"thread:{thread_id}"
    try:
        participants = list(sio.manager.get_participants("/", room) or [])
        participant_count = len(participants)
    except Exception:  # noqa: BLE001
        participant_count = -1
    logger.info(
        "skill_assistant.gateway emit_skill_edit_proposed",
        thread_id=thread_id,
        target_skill_id=target_skill_id,
        changed_keys=list(edit_payload.keys()),
        room_subscribers=participant_count,
    )
    await sio.emit(
        "assistant.skill_edit_proposed",
        {
            "type": "assistant.skill_edit_proposed",
            "threadId": thread_id,
            "timestamp": _now(),
            "targetSkillId": target_skill_id,
            "edit": edit_payload,
        },
        room=room,
    )


async def emit_skill_analyzed(
    thread_id: str,
    analysis_payload: dict[str, Any],
) -> None:
    """스킬 분석 결과 발행 — 프론트가 SkillAnalysisCard 로 렌더링."""
    room = f"thread:{thread_id}"
    try:
        participants = list(sio.manager.get_participants("/", room) or [])
        participant_count = len(participants)
    except Exception:  # noqa: BLE001
        participant_count = -1
    logger.info(
        "skill_assistant.gateway emit_skill_analyzed",
        thread_id=thread_id,
        target_skill_id=analysis_payload.get("target_skill_id"),
        overall_score=analysis_payload.get("overall_score"),
        room_subscribers=participant_count,
    )
    await sio.emit(
        "assistant.skill_analyzed",
        {
            "type": "assistant.skill_analyzed",
            "threadId": thread_id,
            "timestamp": _now(),
            "analysis": analysis_payload,
        },
        room=room,
    )


async def emit_choices_offered(
    thread_id: str,
    choices: list[dict[str, Any]],
) -> None:
    """후속 빠른 선택 버튼 발행 — 프론트가 마지막 어시스턴트 메시지에 인라인 패널로 부착."""
    room = f"thread:{thread_id}"
    try:
        participants = list(sio.manager.get_participants("/", room) or [])
        participant_count = len(participants)
    except Exception:  # noqa: BLE001
        participant_count = -1
    logger.info(
        "skill_assistant.gateway emit_choices_offered",
        thread_id=thread_id,
        count=len(choices),
        room_subscribers=participant_count,
    )
    await sio.emit(
        "assistant.choices_offered",
        {
            "type": "assistant.choices_offered",
            "threadId": thread_id,
            "timestamp": _now(),
            "choices": choices,
        },
        room=room,
    )


async def emit_session_complete(
    thread_id: str,
    summary: str,
) -> None:
    """Skill Assistant 세션 종료 — '적용' 버튼 활성화 신호."""
    await sio.emit(
        "assistant.session_complete",
        {
            "type": "assistant.session_complete",
            "threadId": thread_id,
            "timestamp": _now(),
            "summary": summary,
        },
        room=f"thread:{thread_id}",
    )
