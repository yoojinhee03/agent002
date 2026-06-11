"""Thread attachments REST endpoints.

NestJS API 가 multipart 그대로 프록시하면 이 라우터가 받아 처리.
"""

from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from src.common.deps import require_api_key
from src.modules.attachments import attachments_service


def _content_disposition(filename: str) -> str:
    """RFC 5987 — HTTP 헤더는 latin-1 만 허용하므로 한글 등 비-ASCII 파일명은
    `filename*=UTF-8''<percent>` 로, 호환용 ASCII 폴백은 `filename="..."` 로 함께 보낸다."""
    safe = filename.replace('"', "")
    ascii_fallback = safe.encode("ascii", "ignore").decode("ascii") or "download"
    encoded = quote(safe, safe="")
    return f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded}'

router = APIRouter(tags=["Attachments"])


def _to_dict(att: attachments_service.StoredAttachment) -> dict:
    return {
        "id": att.id,
        "threadId": att.thread_id,
        "originalName": att.original_name,
        "mimeType": att.mime_type,
        "size": att.size,
        "uploaderId": att.uploader_id,
        "createdAt": att.created_at.isoformat(),
    }


@router.post("/threads/{thread_id}/attachments", status_code=201)
async def upload_attachment(
    thread_id: str,
    file: UploadFile = File(...),
    uploader_id: str | None = Form(default=None),
    api_key: dict = Depends(require_api_key),
):
    content = await file.read()
    try:
        att = await attachments_service.save(
            thread_id,
            original_name=file.filename or "file",
            mime_type=file.content_type or "application/octet-stream",
            content=content,
            uploader_id=uploader_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_dict(att)


@router.get("/threads/{thread_id}/attachments")
async def list_attachments(
    thread_id: str,
    api_key: dict = Depends(require_api_key),
):
    items = await attachments_service.list_for_thread(thread_id)
    return [_to_dict(a) for a in items]


@router.get("/thread-attachments/{attachment_id}/content")
async def download_attachment(
    attachment_id: str,
    api_key: dict = Depends(require_api_key),
):
    att = await attachments_service.get(attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    data = attachments_service.read_bytes(att)
    return Response(
        content=data,
        media_type=att.mime_type,
        headers={
            "Content-Disposition": _content_disposition(att.original_name),
        },
    )


@router.delete("/thread-attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: str,
    api_key: dict = Depends(require_api_key),
):
    ok = await attachments_service.delete(attachment_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return Response(status_code=204)
