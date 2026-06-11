from __future__ import annotations

import base64
import json
import mimetypes
from typing import Any

import httpx
import structlog
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from src.modules.attachments import attachments_service
from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool

logger = structlog.get_logger(__name__)


class GmailFetchAttachmentArgs(BaseModel):
    message_id: str | None = Field(default=None, description="Gmail message id")
    q: str | None = Field(
        default=None,
        description="If message_id is not provided, Gmail search query to auto-select the most recent message.",
    )
    attachment_id: str | None = Field(default=None, description="Gmail attachment id")
    filename: str | None = Field(
        default=None,
        description="If attachment_id is not provided, resolve attachmentId by filename from the selected message.",
    )
    user_id: str = Field(default="me")
    include_data: bool = Field(default=True, description="If true, include dataBase64.")
    max_bytes: int = Field(
        default=5 * 1024 * 1024,
        ge=0,
        description="Max bytes to download. If exceeded, return metadata only.",
    )


def _base64url_decode(data: str) -> bytes:
    if not data:
        return b""
    padded = data + "=="
    return base64.urlsafe_b64decode(padded)


def _to_std_base64(raw: bytes) -> str:
    if not raw:
        return ""
    return base64.b64encode(raw).decode("ascii")


def _parse_json_payload(raw: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {"ok": False, "error": {"message": "invalid_json"}}
    except Exception:
        return {"ok": False, "error": {"message": "invalid_json"}}


async def _resolve_message_id(*, token: str, user_id: str, message_id: str | None, q: str | None) -> str | None:
    if message_id:
        return message_id
    if not q:
        return None

    from src.modules.builtin_tools.custom_tools.gmail_search import _gmail_search

    raw = await _gmail_search(token=token, q=q, user_id=user_id, max_results=1)
    parsed = _parse_json_payload(raw)
    if not parsed.get("ok"):
        return None

    messages = parsed.get("messages")
    if not isinstance(messages, list) or not messages:
        return None

    mid = messages[0].get("id") if isinstance(messages[0], dict) else None
    return str(mid) if mid else None


async def _resolve_attachment_id(
    *,
    token: str,
    user_id: str,
    message_id: str,
    attachment_id: str | None,
    filename: str | None,
) -> str | None:
    if attachment_id:
        return attachment_id
    if not filename:
        return None

    url = f"https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages/{message_id}"
    params = {"format": "full"}
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json() or {}
    except Exception:
        return None

    target = filename.strip().lower()
    payload = data.get("payload")
    if not isinstance(payload, dict):
        return None

    def walk(part: Any) -> str | None:
        if not isinstance(part, dict):
            return None
        part_filename = str(part.get("filename") or "").strip().lower()
        if part_filename and part_filename == target:
            body = part.get("body") if isinstance(part.get("body"), dict) else {}
            aid = body.get("attachmentId")
            return str(aid) if aid else None
        parts = part.get("parts")
        if isinstance(parts, list):
            for p in parts:
                found = walk(p)
                if found:
                    return found
        return None

    return walk(payload)


async def _gmail_fetch_attachment(
    *,
    token: str,
    message_id: str | None,
    q: str | None,
    attachment_id: str | None,
    filename: str | None,
    user_id: str = "me",
    include_data: bool = True,
    max_bytes: int = 5 * 1024 * 1024,
    thread_id: str | None = None,
) -> str:
    if not token:
        payload = {"ok": False, "error": {"message": "Missing access_token"}}
        return json.dumps(payload, ensure_ascii=False)

    resolved_message_id = await _resolve_message_id(
        token=token,
        user_id=user_id,
        message_id=message_id,
        q=q,
    )
    if not resolved_message_id:
        return json.dumps(
            {
                "ok": False,
                "error": {"message": "message_id_missing"},
            },
            ensure_ascii=False,
        )

    resolved_attachment_id = await _resolve_attachment_id(
        token=token,
        user_id=user_id,
        message_id=resolved_message_id,
        attachment_id=attachment_id,
        filename=filename,
    )
    if not resolved_attachment_id:
        return json.dumps(
            {
                "ok": False,
                "messageId": resolved_message_id,
                "filename": filename or "",
                "error": {"message": "attachment_id_missing"},
            },
            ensure_ascii=False,
        )

    url = (
        f"https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages/{resolved_message_id}/attachments/{resolved_attachment_id}"
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            resp.raise_for_status()
            data = resp.json() or {}
            raw = _base64url_decode(str(data.get("data") or ""))

            result: dict[str, Any] = {
                "messageId": resolved_message_id,
                "attachmentId": resolved_attachment_id,
                "filename": filename or "",
                "size": len(raw),
                "downloaded": True,
            }

            max_bytes_int = int(max_bytes) if isinstance(max_bytes, int) else 0
            if max_bytes_int > 0 and len(raw) > max_bytes_int:
                result["downloaded"] = False
                result["skipped"] = True
                result["reason"] = "too_large"
                result["maxBytes"] = max_bytes_int
            else:
                if include_data:
                    result["dataBase64"] = _to_std_base64(raw)
                if thread_id and raw:
                    safe_name = filename or f"attachment-{resolved_attachment_id[:8]}"
                    mime_type, _ = mimetypes.guess_type(safe_name)
                    try:
                        stored = await attachments_service.save_dedup(
                            thread_id,
                            original_name=safe_name,
                            mime_type=mime_type or "application/octet-stream",
                            content=raw,
                        )
                        result["threadAttachmentId"] = stored.id
                    except Exception as exc:  # noqa: BLE001
                        logger.warning(
                            "gmail_fetch_attachment persist failed",
                            thread_id=thread_id,
                            filename=safe_name,
                            error=str(exc),
                        )
                        result["persistError"] = str(exc)

            return json.dumps({"ok": True, "result": result}, ensure_ascii=False)

    except httpx.HTTPStatusError as e:
        payload = {
            "ok": False,
            "error": {"status_code": e.response.status_code, "message": e.response.text},
        }
        return json.dumps(payload, ensure_ascii=False)
    except Exception as e:
        payload = {"ok": False, "error": {"message": str(e)}}
        return json.dumps(payload, ensure_ascii=False)


def build_gmail_fetch_attachment_tool(
    agent_id: str,
    user_id: str | None = None,
    source: str | None = None,
    thread_id: str | None = None,
) -> BaseTool:
    async def _gmail_fetch_attachment_with_internal_token(**kwargs: Any) -> str:
        from src.config import settings

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                params: dict[str, str] = {}
                if user_id:
                    params["userId"] = user_id
                if source:
                    params["source"] = source
                res = await client.get(
                    f"{settings.MANAGEMENT_API_URL}/api/internal/agents/{agent_id}/gmail/access-token",
                    headers={"X-API-Key": settings.INTERNAL_SERVICE_KEY},
                    params=params,
                )
                res.raise_for_status()
                data = res.json()
                token = data.get("accessToken")
        except httpx.HTTPStatusError as e:
            payload = {
                "ok": False,
                "error": {"status_code": e.response.status_code, "message": e.response.text},
            }
            return json.dumps(payload, ensure_ascii=False)
        except Exception as e:
            payload = {"ok": False, "error": {"message": str(e)}}
            return json.dumps(payload, ensure_ascii=False)

        if not token:
            payload = {"ok": False, "error": {"message": "Gmail is not connected or token issuance failed"}}
            return json.dumps(payload, ensure_ascii=False)

        return await _gmail_fetch_attachment(token=token, thread_id=thread_id, **kwargs)

    return build_custom_tool(
        CustomToolProperties(
            name="gmail_fetch_attachment",
            description=(
                "Download a single Gmail attachment by attachmentId (or by filename within a message). "
                "Calling this tool ATTACHES THE FILE TO THE CURRENT CHAT THREAD — the user immediately "
                "sees it as an attachment chip in the chat UI and can click to preview/download it "
                "(images, PDFs, text and more). "
                "When the user asks for an attachment ('보여줘', '받아줘', '다운로드', '확인', etc.), "
                "call this tool — do NOT refuse with messages like '직접 다운로드할 수 없습니다'. "
                "The tool returns the bytes (base64) plus a 'threadAttachmentId' which proves the file "
                "is now visible to the user. Use this instead of large gmail_fetch payloads."
            ),
            args_schema=GmailFetchAttachmentArgs,
            tags=["gmail"],
        ),
        coroutine=_gmail_fetch_attachment_with_internal_token,
    )
