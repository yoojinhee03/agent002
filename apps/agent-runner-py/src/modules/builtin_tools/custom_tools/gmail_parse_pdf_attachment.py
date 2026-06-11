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


class GmailParsePdfAttachmentArgs(BaseModel):
    message_id: str | None = Field(default=None, description="Gmail message id")
    q: str | None = Field(
        default=None,
        description="If message_id is not provided, Gmail search query to auto-select the most recent message.",
    )
    attachment_id: str | None = Field(default=None, description="Gmail attachment id (from gmail_fetch result)")
    user_id: str = Field(default="me")
    filename: str = Field(
        default="",
        description=(
            "Original filename (e.g. '주민등록등본_홍길동.pdf'). "
            "Used to identify attachment when attachment_id is missing, and to determine document type. "
            "If attachment_id is provided, this field is optional but recommended for accurate document type detection."
        ),
    )
    candidate_name: str = Field(default="", description="Applicant name for cross-reference checks")
    password: str | None = Field(default=None, description="PDF password (if encrypted)")
    dpi: int = Field(default=150, ge=72, le=300)
    max_bytes: int = Field(
        default=0,
        ge=0,
        description="Max bytes to download. 0 (default) means no limit — all file sizes are accepted.",
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
    filename: str,
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


async def _download_attachment_bytes(
    *,
    token: str,
    user_id: str,
    message_id: str,
    attachment_id: str,
) -> bytes:
    url = f"https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages/{message_id}/attachments/{attachment_id}"
    # 대용량 파일을 위해 넉넉한 타임아웃 설정
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        resp.raise_for_status()
        data = resp.json() or {}
        return _base64url_decode(str(data.get("data") or ""))


async def _gmail_parse_pdf_attachment(
    *,
    token: str,
    message_id: str | None,
    q: str | None,
    attachment_id: str | None,
    user_id: str,
    filename: str,
    candidate_name: str,
    password: str | None,
    dpi: int,
    max_bytes: int,
    agent_id: str,
    thread_id: str | None = None,
) -> str:
    if not token:
        return json.dumps({"ok": False, "error": {"message": "Missing access_token"}}, ensure_ascii=False)

    resolved_message_id = await _resolve_message_id(
        token=token,
        user_id=user_id,
        message_id=message_id,
        q=q,
    )
    if not resolved_message_id:
        return json.dumps(
            {"ok": False, "error": {"message": "message_id_missing"}},
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
                "filename": filename,
                "error": {
                    "message": "attachment_id_missing",
                    "hint": "Provide attachment_id from gmail_fetch result, or provide filename to auto-resolve.",
                },
            },
            ensure_ascii=False,
        )

    try:
        raw = await _download_attachment_bytes(
            token=token,
            user_id=user_id,
            message_id=resolved_message_id,
            attachment_id=resolved_attachment_id,
        )
    except httpx.HTTPStatusError as e:
        should_retry = (
            e.response.status_code == 400
            and "Invalid attachment token" in (e.response.text or "")
            and bool(filename)
        )
        if should_retry:
            refreshed_attachment_id = await _resolve_attachment_id(
                token=token,
                user_id=user_id,
                message_id=resolved_message_id,
                attachment_id=None,
                filename=filename,
            )
            if refreshed_attachment_id and refreshed_attachment_id != resolved_attachment_id:
                try:
                    raw = await _download_attachment_bytes(
                        token=token,
                        user_id=user_id,
                        message_id=resolved_message_id,
                        attachment_id=refreshed_attachment_id,
                    )
                    resolved_attachment_id = refreshed_attachment_id
                except Exception:
                    return json.dumps(
                        {"ok": False, "error": {"status_code": e.response.status_code, "message": e.response.text}},
                        ensure_ascii=False,
                    )
            else:
                return json.dumps(
                    {"ok": False, "error": {"status_code": e.response.status_code, "message": e.response.text}},
                    ensure_ascii=False,
                )
        else:
            return json.dumps(
                {"ok": False, "error": {"status_code": e.response.status_code, "message": e.response.text}},
                ensure_ascii=False,
            )
    except Exception as e:
        return json.dumps({"ok": False, "error": {"message": str(e)}}, ensure_ascii=False)

    # max_bytes=0이면 크기 제한 없음
    max_bytes_int = int(max_bytes) if isinstance(max_bytes, int) else 0
    if max_bytes_int > 0 and len(raw) > max_bytes_int:
        return json.dumps(
            {
                "ok": False,
                "error": {
                    "message": "attachment_too_large",
                    "size": len(raw),
                    "maxBytes": max_bytes_int,
                    "attachmentId": resolved_attachment_id,
                    "filename": filename,
                },
            },
            ensure_ascii=False,
        )

    thread_attachment_id: str | None = None
    persist_error: str | None = None
    if thread_id and raw:
        safe_name = filename or f"attachment-{resolved_attachment_id[:8]}.pdf"
        mime_type, _ = mimetypes.guess_type(safe_name)
        try:
            stored = await attachments_service.save_dedup(
                thread_id,
                original_name=safe_name,
                mime_type=mime_type or "application/pdf",
                content=raw,
            )
            thread_attachment_id = stored.id
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "gmail_parse_pdf_attachment persist failed",
                thread_id=thread_id,
                filename=safe_name,
                error=str(exc),
            )
            persist_error = str(exc)

    from src.modules.builtin_tools.custom_tools.document_preprocess import _document_preprocess
    from src.modules.builtin_tools.custom_tools.pdf_parse import _pdf_parse

    preprocess_raw = await _document_preprocess(
        file_data_base64=_to_std_base64(raw),
        filename=filename or "document.pdf",
        password=password,
        dpi=dpi,
        max_pages=1,
    )
    preprocess = _parse_json_payload(preprocess_raw)
    if not preprocess.get("ok"):
        return json.dumps(
            {
                "ok": False,
                "stage": "document_preprocess",
                "error": preprocess.get("error") or {"message": "unknown"},
                "filename": filename,
                "attachmentId": resolved_attachment_id,
            },
            ensure_ascii=False,
        )

    pages = preprocess.get("pages")
    if not isinstance(pages, list) or not pages:
        return json.dumps(
            {
                "ok": False,
                "stage": "document_preprocess",
                "error": {"message": "pages_missing"},
                "filename": filename,
                "attachmentId": resolved_attachment_id,
            },
            ensure_ascii=False,
        )

    parse_raw = await _pdf_parse(
        pages=pages,
        filename=filename or "document.pdf",
        candidate_name=candidate_name,
        agent_id=agent_id,
    )
    parse = _parse_json_payload(parse_raw)
    if not parse.get("ok"):
        error_any = parse.get("error")
        error: dict[str, Any] = error_any if isinstance(error_any, dict) else {"message": "unknown"}
        status_code = error.get("status_code")
        message = str(error.get("message") or "")
        message_lc = message.lower()
        should_retry_413 = (
            status_code in {413, "413"}
            or "request entity too large" in message_lc
            or "entity too large" in message_lc
        )
        if should_retry_413 and int(dpi) > 72:
            retry_dpi = max(72, int(dpi * 0.5))
            preprocess_retry_raw = await _document_preprocess(
                file_data_base64=_to_std_base64(raw),
                filename=filename or "document.pdf",
                password=password,
                dpi=retry_dpi,
                max_pages=1,
            )
            preprocess_retry = _parse_json_payload(preprocess_retry_raw)
            pages_retry = preprocess_retry.get("pages") if isinstance(preprocess_retry, dict) else None
            if preprocess_retry.get("ok") and isinstance(pages_retry, list) and pages_retry:
                parse_retry_raw = await _pdf_parse(
                    pages=pages_retry,
                    filename=filename or "document.pdf",
                    candidate_name=candidate_name,
                    agent_id=agent_id,
                )
                parse_retry = _parse_json_payload(parse_retry_raw)
                if parse_retry.get("ok"):
                    preprocess = preprocess_retry
                    pages = pages_retry
                    parse = parse_retry
                else:
                    parse = parse_retry
            else:
                parse = {
                    "ok": False,
                    "error": {
                        "message": "retry_preprocess_failed",
                        "original": error,
                        "retry": preprocess_retry.get("error") if isinstance(preprocess_retry, dict) else None,
                    },
                }

        if not parse.get("ok"):
            error_any2 = parse.get("error")
            error2: dict[str, Any] = error_any2 if isinstance(error_any2, dict) else {"message": "unknown"}
            return json.dumps(
                {
                    "ok": False,
                    "stage": "pdf_parse",
                    "error": error2,
                    "filename": filename,
                    "attachmentId": resolved_attachment_id,
                },
                ensure_ascii=False,
            )

    doc_type = str(parse.get("doc_type") or "")
    extracted_any = parse.get("extracted")
    extracted: dict[str, Any] = extracted_any if isinstance(extracted_any, dict) else {}
    signals: dict[str, Any] = {"doc_type": doc_type}

    success_payload: dict[str, Any] = {
        "ok": True,
        "messageId": resolved_message_id,
        "attachmentId": resolved_attachment_id,
        "filename": filename,
        "preprocess": {
            "total_pages": preprocess.get("total_pages"),
            "was_encrypted": preprocess.get("was_encrypted"),
            "dpi": preprocess.get("dpi"),
        },
        "signals": signals,
        "parse": parse,
    }
    if thread_attachment_id:
        success_payload["threadAttachmentId"] = thread_attachment_id
    if persist_error:
        success_payload["persistError"] = persist_error
    return json.dumps(success_payload, ensure_ascii=False)


def build_gmail_parse_pdf_attachment_tool(
    agent_id: str,
    user_id: str | None = None,
    source: str | None = None,
    thread_id: str | None = None,
) -> BaseTool:
    async def _gmail_parse_pdf_attachment_with_internal_token(**kwargs: Any) -> str:
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

        return await _gmail_parse_pdf_attachment(
            token=token,
            agent_id=agent_id,
            thread_id=thread_id,
            **kwargs,
        )

    return build_custom_tool(
        CustomToolProperties(
            name="gmail_parse_pdf_attachment",
            description=(
                "Download a Gmail PDF attachment and extract structured text from it using Vision AI. "
                "This tool handles everything internally: download → preprocess → parse. "
                "You do NOT need to download the file first — just provide message_id and attachment_id "
                "(obtained from gmail_fetch) and call this tool directly. "
                "There is NO file size limit by default (max_bytes=0). "
                "Returns extracted fields (dates, names, records, etc.) as structured JSON. "
                "Side effect: the downloaded PDF is also ATTACHED TO THE CURRENT CHAT THREAD — the user "
                "immediately sees it as an attachment chip and can click to preview the PDF inline. "
                "The result includes 'threadAttachmentId' proving the file is now visible to the user. "
                "When the user asks to view/check/download a PDF attachment, call this tool — do NOT "
                "refuse with messages like '직접 다운로드할 수 없습니다'."
            ),
            args_schema=GmailParsePdfAttachmentArgs,
            tags=["gmail", "document", "pdf", "vision"],
        ),
        coroutine=_gmail_parse_pdf_attachment_with_internal_token,
    )
