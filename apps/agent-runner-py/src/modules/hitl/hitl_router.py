from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from src.common.deps import require_api_key
from src.modules.hitl import hitl_service

router = APIRouter(prefix="/hitl", tags=["HITL"])


@router.get("/interactions")
async def list_interactions(project_id: str, api_key: dict = Depends(require_api_key)):
    return await hitl_service.list_pending(project_id)


@router.post("/interactions/{interaction_id}/respond")
async def respond_to_interaction(
    interaction_id: str,
    body: dict[str, Any],
    api_key: dict = Depends(require_api_key),
):
    response = body.get("response")
    user_id = body.get("userId")
    source_raw = body.get("source")
    source = source_raw if source_raw in ("studio", "client") else None
    return await hitl_service.respond(interaction_id, response, user_id, source=source)


@router.post("/interactions/{interaction_id}/preview-edit")
async def preview_edit(
    interaction_id: str,
    body: dict[str, Any],
    api_key: dict = Depends(require_api_key),
):
    """자연어 수정문을 새 args 로 변환 (LLM). DB / deepagents 상태는 변경하지 않는다."""
    edit_prompt = body.get("editPrompt") or body.get("edit_prompt") or ""
    if not isinstance(edit_prompt, str) or not edit_prompt.strip():
        raise HTTPException(status_code=400, detail="editPrompt is required")
    try:
        return await hitl_service.preview_edit(interaction_id, edit_prompt)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
