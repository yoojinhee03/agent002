"""WorkflowRun + StepTrace 기록기 — turn 정상 종료 시 1회 호출.

이 모듈은 deepagent_bridge 의 동작과 분리된 단순 INSERT 어댑터다.
실패해도 사용자 invoke 응답에는 영향이 없도록 호출자(threads_service)가
반드시 try/except 로 감싸 호출한다.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog

from src.database.client import execute

_NODE_TYPE_MAP = {
    "tool": "tool",
    "agent": "agent",
    "llm": "llm",
    "middleware": "tool",
}
_STEP_STATUS_MAP = {
    "completed": "completed",
    "failed": "failed",
    "skipped": "skipped",
    "running": "running",
}

_logger = structlog.get_logger(__name__)


def _ms_between(start: datetime | None, end: datetime | None) -> int | None:
    if not start or not end:
        return None
    return max(int((end - start).total_seconds() * 1000), 0)


async def record_run(
    *,
    agent_id: str | None,
    thread_id: str | None = None,
    project_id: str | None,
    workflow_id: str | None = None,
    environment: str | None = None,
    model_id: str | None = None,
    status: str,  # 'completed' | 'failed'
    started_at: datetime,
    completed_at: datetime,
    input_text: str,
    output_text: str | None,
    error_message: str | None,
    input_tokens: int,
    output_tokens: int,
    total_cost: float,
    step_events: list[dict[str, Any]],
) -> str | None:
    """workflow_runs 1행 + step_traces N행 INSERT. 실패 시 로그만 남기고 None 반환."""
    run_id = str(uuid.uuid4())
    total_tokens = max(input_tokens, 0) + max(output_tokens, 0)
    total_steps = sum(1 for ev in step_events if ev.get("status") == "completed")
    latency_ms = _ms_between(started_at, completed_at)

    try:
        await execute(
            """
            INSERT INTO workflow_runs (
                id, workflow_id, agent_id, thread_id, project_id, environment,
                model_id, status, input, output, error_message,
                total_cost, total_tokens, total_steps, latency_ms,
                started_at, completed_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8::"RunStatus", $9::jsonb, $10::jsonb, $11,
                $12, $13, $14, $15,
                $16, $17
            )
            """,
            (
                run_id,
                workflow_id,
                agent_id,
                thread_id,
                project_id,
                environment,
                model_id,
                status,
                json.dumps({"text": input_text or ""}),
                json.dumps({"text": output_text or ""}) if output_text is not None else None,
                error_message,
                float(total_cost) if total_cost else 0.0,
                total_tokens,
                total_steps,
                latency_ms,
                started_at,
                completed_at,
            ),
        )
    except Exception as exc:  # noqa: BLE001
        _logger.error("record_run: workflow_runs insert failed", error=str(exc), agent_id=agent_id)
        return None

    for ev in step_events:
        try:
            node_type = _NODE_TYPE_MAP.get(ev.get("stepType") or "tool", "tool")
            step_status = _STEP_STATUS_MAP.get(ev.get("status") or "completed", "completed")
            step_started: datetime = ev.get("startedAt") or started_at
            step_completed: datetime | None = ev.get("completedAt")
            await execute(
                """
                INSERT INTO step_traces (
                    id, run_id, step_id, parent_step_id, depth,
                    node_id, node_name, node_type,
                    status, input, output, error_message,
                    started_at, completed_at, latency, cost, tokens, retries
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8::"NodeType",
                    $9::"StepStatus", $10::jsonb, $11::jsonb, $12,
                    $13, $14, $15, $16, $17, $18
                )
                """,
                (
                    str(uuid.uuid4()),
                    run_id,
                    ev.get("stepId"),
                    ev.get("parentStepId"),
                    int(ev.get("depth") or 0),
                    ev.get("nodeId") or ev.get("name") or "step",
                    ev.get("name") or "step",
                    node_type,
                    step_status,
                    json.dumps(ev.get("input") or {}),
                    json.dumps(ev.get("output")) if ev.get("output") is not None else None,
                    ev.get("error"),
                    step_started,
                    step_completed,
                    ev.get("latencyMs"),
                    None,
                    None,
                    0,
                ),
            )
        except Exception as exc:  # noqa: BLE001
            _logger.warning("record_run: step_traces insert failed",
                            error=str(exc), step_name=ev.get("name"))

    _logger.info("record_run: persisted",
                 run_id=run_id,
                 agent_id=agent_id,
                 project_id=project_id,
                 status=status,
                 total_tokens=total_tokens,
                 total_cost=total_cost,
                 step_count=len(step_events),
                 latency_ms=latency_ms)
    return run_id


def aggregate_usage_metadata(*chunks: dict[str, Any] | None) -> tuple[int, int]:
    """여러 usage_metadata dict 를 합산해 (input_tokens, output_tokens) 반환."""
    in_total = 0
    out_total = 0
    for cd in chunks:
        if not cd:
            continue
        in_total += int(cd.get("input_tokens") or 0)
        out_total += int(cd.get("output_tokens") or 0)
    return in_total, out_total
