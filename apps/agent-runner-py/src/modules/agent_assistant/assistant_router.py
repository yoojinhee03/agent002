"""Agent Assistant FastAPI 라우터."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from src.common.deps import require_api_key
from src.modules.agent_assistant import assistant_service
from src.modules.agent_assistant.models import (
    CreateSessionBody,
    CreateSessionResponse,
    InvokeBody,
)

router = APIRouter(prefix="/agent-assistant", tags=["AgentAssistant"])


@router.post("/sessions", response_model=CreateSessionResponse)
async def create_session(
    body: CreateSessionBody,
    api_key: dict = Depends(require_api_key),
):
    try:
        return await assistant_service.create_session(
            project_id=body.projectId,
            agent_id=body.agentId,
            user_id=body.userId,
            model=body.model,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/sessions/{thread_id}/invoke", status_code=202)
async def invoke(
    thread_id: str,
    body: InvokeBody,
    background_tasks: BackgroundTasks,
    api_key: dict = Depends(require_api_key),
):
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=400, detail="message is required")

    async def _run() -> None:
        import structlog
        _log = structlog.get_logger(__name__)
        _log.info("assistant.invoke._run start", thread_id=thread_id, msg_preview=body.message[:60])
        try:
            await assistant_service.stream(
                thread_id=thread_id,
                user_message=body.message,
                user_credentials=body.userCredentials,
                user_id=body.userId,
            )
            _log.info("assistant.invoke._run completed", thread_id=thread_id)
        except Exception:  # noqa: BLE001
            _log.exception("assistant.stream failed", thread_id=thread_id)

    # BackgroundTasks 는 async 함수를 그대로 받아 응답 직후 같은 event loop 에서 await 한다.
    # (이전: `add_task(asyncio.create_task, _run())` — worker thread 에서 create_task 호출 시
    #  no running event loop 로 실패하던 버그)
    background_tasks.add_task(_run)
    return {"threadId": thread_id, "accepted": True}
