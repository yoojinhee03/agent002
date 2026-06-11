"""레거시 /agents/:slug/:env/run 엔드포인트 — 기존 TS runner와 호환"""
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.common.deps import require_api_key
from src.database.client import fetch_one
from src.modules.agents import agents_service

router = APIRouter(prefix="/agents", tags=["Execution"])


class RunBody(BaseModel):
    input: dict[str, Any] = {}
    stream: bool = False
    threadId: str | None = None


@router.get("/{slug}/{env}/info")
async def get_info(slug: str, env: str):
    endpoint = await fetch_one(
        "SELECT id FROM endpoints WHERE workflow_slug = $1 AND environment = $2 LIMIT 1",
        (slug, env),
    )
    if not endpoint:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return {"slug": slug, "environment": env, "endpointId": endpoint["id"]}


@router.post("/{slug}/{env}/run")
async def run_agent(
    slug: str,
    env: str,
    body: RunBody,
    api_key: dict = Depends(require_api_key),
):
    row = await fetch_one(
        """
        SELECT e.id, a.id AS agent_id
        FROM endpoints e
        JOIN agents a ON a.slug = e.workflow_slug
        WHERE e.workflow_slug = $1 AND e.environment = $2
        LIMIT 1
        """,
        (slug, env),
    )
    if not row or not row.get("agent_id"):
        raise HTTPException(status_code=404, detail="Endpoint not found")

    agent_id: str = row["agent_id"]
    thread_id = body.threadId or f"run-{slug}-{env}"
    user_message = body.input.get("message", json.dumps(body.input))

    if body.stream:
        async def event_gen():
            yield f"data: {json.dumps({'type': 'run.started'})}\n\n"
            try:
                async for chunk in agents_service.stream(agent_id, thread_id, user_message):
                    yield f"data: {json.dumps(chunk)}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(event_gen(), media_type="text/event-stream")

    result = await agents_service.invoke(agent_id, thread_id, user_message)
    last = result.get("messages", [])[-1] if result.get("messages") else {}
    return {"runId": thread_id, "output": last, "status": "completed"}
