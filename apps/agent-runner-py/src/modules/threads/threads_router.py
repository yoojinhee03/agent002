import json
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.common.deps import require_api_key
from src.modules.threads import threads_service

router = APIRouter(prefix="/threads", tags=["Threads"])


class SendMessageBody(BaseModel):
    content: str | None = None
    message: str | None = None
    stream: bool = True
    variables: dict[str, Any] | None = None
    architectureOverride: str | None = None
    userCredentials: dict[str, str] | None = None
    userId: str | None = None
    source: str | None = None
    # per_user MCP 서버용 사용자 자격증명: { serverId: { ENV_KEY: value } }
    userMcpEnvs: dict[str, dict[str, str]] | None = None

    def get_message(self) -> str:
        return self.message or self.content or ""


class CreateThreadBody(BaseModel):
    projectId: str
    agentId: str | None = None
    teamId: str | None = None
    title: str | None = None
    userId: str | None = None
    metadata: dict[str, Any] | None = None


@router.post("")
async def create_thread(body: CreateThreadBody, api_key: dict = Depends(require_api_key)):
    return await threads_service.create(
        project_id=body.projectId,
        agent_id=body.agentId,
        team_id=body.teamId,
        title=body.title,
        user_id=body.userId,
        metadata=body.metadata,
    )


@router.get("")
async def list_threads(
    projectId: str,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    api_key: dict = Depends(require_api_key),
):
    return await threads_service.list_threads(projectId, status, limit, offset)


@router.get("/{thread_id}")
async def get_thread(thread_id: str, api_key: dict = Depends(require_api_key)):
    return await threads_service.get(thread_id)


@router.post("/{thread_id}/invoke")
async def invoke(
    thread_id: str,
    body: SendMessageBody,
    api_key: dict = Depends(require_api_key),
):
    return await threads_service.send_message(
        thread_id,
        body.get_message(),
        user_credentials=body.userCredentials,
        user_id=body.userId,
        architecture_override=body.architectureOverride,
        source=body.source,
        user_mcp_envs=body.userMcpEnvs,
    )


@router.get("/{thread_id}/stream")
async def stream_sse(
    thread_id: str,
    content: str,
    api_key: dict = Depends(require_api_key),
):
    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            result = await threads_service.send_message(thread_id, content)
            yield f"data: {json.dumps({'type': 'run.completed', **result})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/{thread_id}/messages")
async def get_messages(thread_id: str, api_key: dict = Depends(require_api_key)):
    return await threads_service.get_messages(thread_id)


@router.get("/{thread_id}/runs")
async def get_runs(thread_id: str, api_key: dict = Depends(require_api_key)):
    """thread 의 모든 run + step trace 시간순 조회 — history step 카드 복원용."""
    return await threads_service.get_runs(thread_id)


@router.post("/{thread_id}/cancel")
async def cancel_thread_run(thread_id: str, api_key: dict = Depends(require_api_key)):
    """진행 중인 invoke 를 중지한다. 등록된 task 가 없으면 not_running 반환."""
    from src.modules.threads import cancel_registry

    cancelled = cancel_registry.cancel(thread_id)
    return {"threadId": thread_id, "cancelled": cancelled}


@router.delete("/{thread_id}")
async def archive_thread(thread_id: str, api_key: dict = Depends(require_api_key)):
    await threads_service.archive(thread_id)
    return {"message": "Thread archived"}
