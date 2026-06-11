from __future__ import annotations

import base64
import io
import json
import zipfile
from typing import Any

import httpx
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool


class GmailFetchArgs(BaseModel):
    message_id: str = Field(min_length=1, description="Gmail message id")
    user_id: str = Field(default="me")
    include_attachments: bool = Field(default=True)
    unzip_attachments: bool = Field(default=True, description="If true, unzip .zip attachments (with safety limits).")
    include_attachment_data: bool = Field(
        default=False,
        description=(
            "If true, download each attachment and include its base64 data. "
            "WARNING: triggers actual downloads for every attachment — slow and large. "
            "Default false: returns only metadata (filename, attachmentId, size, mimeType)."
        ),
    )
    include_unzipped_data: bool = Field(default=False)
    include_payload: bool = Field(default=False)
    max_body_chars: int = Field(default=20000, ge=0)


def _base64url_decode(data: str) -> bytes:
    if not data:
        return b""
    return base64.urlsafe_b64decode(data + "==")


def _to_std_base64(raw: bytes) -> str:
    if not raw:
        return ""
    return base64.b64encode(raw).decode("ascii")


def _truncate_text(value: str, max_chars: int) -> tuple[str, bool]:
    if max_chars <= 0:
        return value, False
    if len(value) <= max_chars:
        return value, False
    return value[:max_chars] + f"… (truncated {len(value) - max_chars} chars)", True


def _truncate_base64(value: str, max_chars: int) -> tuple[str, bool, int]:
    if max_chars <= 0:
        return value, False, len(value)
    if len(value) <= max_chars:
        return value, False, len(value)
    return value[:max_chars], True, len(value)


def _is_zip_attachment(filename: str, mime_type: str, raw: bytes) -> bool:
    if filename.lower().endswith(".zip"):
        return True
    if mime_type in {"application/zip", "application/x-zip-compressed"}:
        return True
    return bool(raw[:4] == b"PK\x03\x04" or raw[:4] == b"PK\x05\x06" or raw[:4] == b"PK\x07\x08")


def _unzip_attachment_bytes(
    raw: bytes,
    *,
    max_files: int,
    max_total_bytes: int,
    max_file_bytes: int,
    include_data: bool,
    max_data_base64_chars: int,
) -> dict[str, Any]:
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        return {"ok": False, "error": {"message": "bad_zip"}}
    except Exception as e:
        return {"ok": False, "error": {"message": str(e)}}

    infos = [i for i in zf.infolist() if not i.is_dir()]
    if len(infos) > max_files:
        return {"ok": False, "error": {"message": "too_many_files", "maxFiles": max_files, "fileCount": len(infos)}}

    extracted: list[dict[str, Any]] = []
    total = 0
    for info in infos:
        size = int(getattr(info, "file_size", 0) or 0)
        if size > max_file_bytes:
            extracted.append({"filename": info.filename, "size": size, "skipped": True, "reason": "file_too_large"})
            continue
        if total + size > max_total_bytes:
            extracted.append({"filename": info.filename, "size": size, "skipped": True, "reason": "total_too_large"})
            continue
        try:
            content = zf.read(info)
        except Exception as e:
            extracted.append({"filename": info.filename, "size": size, "skipped": True, "reason": str(e)})
            continue
        total += len(content)
        item: dict[str, Any] = {"filename": info.filename, "size": len(content), "skipped": False}
        if include_data:
            b64 = _to_std_base64(content)
            tb64, was_trunc, total_chars = _truncate_base64(b64, max_data_base64_chars)
            item["dataBase64"] = tb64
            if was_trunc:
                item["dataBase64Truncated"] = True
                item["dataBase64TotalChars"] = total_chars
        extracted.append(item)

    return {"ok": True, "result": {"fileCount": len(infos), "extractedCount": len([e for e in extracted if not e.get("skipped")]), "files": extracted}}


def _find_header(headers_list: Any, name: str) -> str:
    if not isinstance(headers_list, list):
        return ""
    target = name.lower()
    for h in headers_list:
        if isinstance(h, dict) and (h.get("name") or "").lower() == target:
            return str(h.get("value") or "")
    return ""


def _normalize_payload_base64(part: Any) -> Any:
    if not isinstance(part, dict):
        return part
    out: dict[str, Any] = dict(part)
    body = out.get("body")
    if isinstance(body, dict) and isinstance(body.get("data"), str) and body.get("data"):
        raw = _base64url_decode(body["data"])
        out["body"] = {**body, "data": _to_std_base64(raw)}
    parts = out.get("parts")
    if isinstance(parts, list):
        out["parts"] = [_normalize_payload_base64(p) for p in parts]
    return out


async def _fetch_attachment_raw(*, client: httpx.AsyncClient, token: str, user_id: str, message_id: str, attachment_id: str) -> dict[str, Any]:
    url = f"https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages/{message_id}/attachments/{attachment_id}"
    resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
    resp.raise_for_status()
    data = resp.json() or {}
    raw = _base64url_decode(str(data.get("data") or ""))
    return {"attachmentId": attachment_id, "dataBase64": _to_std_base64(raw), "size": len(raw)}


def _build_next_calls(message_id: str, attachments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    첨부 목록에서 파싱 순서와 정확한 파라미터를 생성한다.
    이력서/입사지원서를 첫 번째로, PDF → DOCX 순으로 정렬한다.
    """
    priority_keywords = ["이력서", "입사지원서"]
    pdf_priority: list[dict[str, Any]] = []
    pdf_rest: list[dict[str, Any]] = []
    docx_calls: list[dict[str, Any]] = []

    for att in attachments:
        filename = att.get("filename", "")
        attachment_id = att.get("attachmentId", "")
        mime_type = att.get("mimeType", "")
        if not attachment_id:
            continue
        is_priority = any(kw in filename for kw in priority_keywords)
        if mime_type == "application/pdf":
            entry = {"tool": "gmail_parse_pdf_attachment", "params": {"message_id": message_id, "attachment_id": attachment_id, "filename": filename, "user_id": "me"}}
            if is_priority:
                pdf_priority.append(entry)
            else:
                pdf_rest.append(entry)
        elif "wordprocessingml" in mime_type or filename.lower().endswith(".docx"):
            entry = {"tool": "gmail_fetch_attachment", "params": {"message_id": message_id, "attachment_id": attachment_id, "user_id": "me", "include_data": True}}
            if is_priority:
                docx_calls.insert(0, entry)
            else:
                docx_calls.append(entry)

    return pdf_priority + pdf_rest + docx_calls


def _guess_doc_type_hint(filename: str) -> str:
    name = (filename or "").lower()
    mapping: list[tuple[str, str]] = [
        ("주민등록등본", "주민등록등본"),
        ("등본", "주민등록등본"),
        ("주민등록초본", "주민등록초본"),
        ("초본", "주민등록초본"),
        ("건강보험", "건강보험자격득실확인서"),
        ("자격득실", "건강보험자격득실확인서"),
        ("원천", "원천징수영수증"),
        ("원천징수", "원천징수영수증"),
        ("학력", "최종학력증명서"),
        ("졸업", "최종학력증명서"),
        ("재학", "최종학력증명서"),
        ("통장", "통장사본"),
        ("계좌", "통장사본"),
        ("자격증", "자격증"),
        ("경력", "경력증명서"),
        ("경력증명", "경력증명서"),
        ("이력서", "이력서"),
        ("입사지원서", "입사지원서"),
    ]
    for kw, doc_type in mapping:
        if kw.lower() in name:
            return doc_type
    return "unknown"


def _build_classification(attachments: list[dict[str, Any]]) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    for a in attachments:
        filename = str(a.get("filename") or "")
        mime_type = str(a.get("mimeType") or "")
        attachment_id = str(a.get("attachmentId") or "")
        skipped = bool(a.get("skipped"))
        category = "other"
        if mime_type == "application/pdf" or filename.lower().endswith(".pdf"):
            category = "pdf"
        elif "wordprocessingml" in mime_type or filename.lower().endswith(".docx"):
            category = "docx"
        elif filename.lower().endswith(".zip") or mime_type in {"application/zip", "application/x-zip-compressed"}:
            category = "zip"

        items.append(
            {
                "filename": filename,
                "mimeType": mime_type,
                "attachmentId": attachment_id,
                "category": category,
                "docTypeHint": _guess_doc_type_hint(filename),
                "skipped": skipped,
                **({"reason": a.get("reason")} if skipped else {}),
                **({"size": a.get("size")} if "size" in a else {}),
            }
        )

    counts: dict[str, int] = {"pdf": 0, "docx": 0, "zip": 0, "other": 0}
    for it in items:
        cat = str(it.get("category") or "other")
        counts[cat] = int(counts.get(cat, 0)) + 1

    return {"counts": counts, "items": items}


async def _parse_payload(
    *,
    client: httpx.AsyncClient,
    token: str,
    user_id: str,
    message_id: str,
    payload: Any,
    max_attachment_bytes: int,
    max_attachment_data_bytes_each: int,
    max_attachment_data_bytes_total: int,
    max_data_base64_chars: int,
    include_attachments: bool,
    unzip_attachments: bool,
    include_attachment_data: bool,
    include_unzipped_data: bool,
) -> dict[str, Any]:
    text_plain: list[str] = []
    attachments: list[dict[str, Any]] = []
    included_attachment_data_total = 0

    async def walk(part: Any) -> None:
        nonlocal included_attachment_data_total
        if not isinstance(part, dict):
            return
        mime_type = str(part.get("mimeType") or "")
        filename = str(part.get("filename") or "")
        body = part.get("body") if isinstance(part.get("body"), dict) else {}

        if filename and include_attachments:
            attachment_id = str(body.get("attachmentId") or "")
            size = body.get("size")
            size_int = int(size) if isinstance(size, (int, float, str)) and str(size).isdigit() else 0

            if not attachment_id:
                attachments.append({"filename": filename, "mimeType": mime_type, "skipped": True, "reason": "missing_attachment_id", "size": size_int})
            elif not include_attachment_data:
                item: dict[str, Any] = {"filename": filename, "mimeType": mime_type, "attachmentId": attachment_id, "skipped": False, "size": size_int}
                if unzip_attachments and filename.lower().endswith(".zip"):
                    item["unzipped"] = {"ok": False, "error": {"message": "data_not_downloaded"}}
                attachments.append(item)
            elif size_int > max_attachment_bytes:
                attachments.append({"filename": filename, "mimeType": mime_type, "attachmentId": attachment_id, "skipped": True, "reason": "too_large", "size": size_int})
            else:
                try:
                    fetched = await _fetch_attachment_raw(client=client, token=token, user_id=user_id, message_id=message_id, attachment_id=attachment_id)
                    raw_b64 = str(fetched.get("dataBase64") or "")
                    try:
                        raw_bytes = base64.b64decode(raw_b64) if raw_b64 else b""
                    except Exception:
                        raw_bytes = b""
                    unzip_result: dict[str, Any] | None = None
                    if unzip_attachments and raw_bytes and _is_zip_attachment(filename, mime_type, raw_bytes):
                        try:
                            unzip_result = _unzip_attachment_bytes(raw_bytes, max_files=20, max_total_bytes=5*1024*1024, max_file_bytes=1*1024*1024, include_data=include_unzipped_data, max_data_base64_chars=max_data_base64_chars)
                        except Exception as e:
                            unzip_result = {"ok": False, "error": {"message": str(e)}}
                    fetched_size = int(fetched.get("size") or 0)
                    fi: dict[str, Any] = {"filename": filename, "mimeType": mime_type, "attachmentId": attachment_id, "skipped": False, "size": fetched.get("size") or size_int}
                    can_each = fetched_size <= max_attachment_data_bytes_each
                    can_total = included_attachment_data_total + fetched_size <= max_attachment_data_bytes_total
                    if can_each and can_total:
                        b64 = str(fetched.get("dataBase64") or "")
                        tb64, was_trunc, total_chars = _truncate_base64(b64, max_data_base64_chars)
                        fi["dataBase64"] = tb64
                        if was_trunc:
                            fi["dataBase64Truncated"] = True
                            fi["dataBase64TotalChars"] = total_chars
                        included_attachment_data_total += fetched_size
                    else:
                        fi["dataSkipped"] = True
                        fi["dataSkipReason"] = "data_too_large" if not can_each else "data_total_too_large"
                    if unzip_result is not None:
                        fi["unzipped"] = unzip_result
                    attachments.append(fi)
                except httpx.HTTPStatusError as e:
                    attachments.append({"filename": filename, "mimeType": mime_type, "attachmentId": attachment_id, "skipped": True, "reason": "download_failed", "status_code": e.response.status_code})
                except Exception as e:
                    attachments.append({"filename": filename, "mimeType": mime_type, "attachmentId": attachment_id, "skipped": True, "reason": "download_failed", "message": str(e)})

        data_str = str(body.get("data") or "")
        if data_str:
            raw = _base64url_decode(data_str)
            try:
                decoded = raw.decode("utf-8", errors="replace")
            except Exception:
                decoded = ""
            if mime_type == "text/plain":
                text_plain.append(decoded)

        parts = part.get("parts")
        if isinstance(parts, list):
            for p in parts:
                await walk(p)

    await walk(payload)
    return {"textPlain": "\n".join([s for s in text_plain if s]), "attachments": attachments}


async def _gmail_fetch(
    token: str,
    message_id: str,
    user_id: str = "me",
    include_attachments: bool = True,
    unzip_attachments: bool = True,
    include_attachment_data: bool = False,
    include_unzipped_data: bool = False,
    include_payload: bool = False,
    max_body_chars: int = 20000,
) -> str:
    if not token:
        return json.dumps({"ok": False, "error": {"message": "Missing access_token"}}, ensure_ascii=False)

    url = f"https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages/{message_id}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"}, params={"format": "full"})
            resp.raise_for_status()
            data = resp.json() or {}
            payload = data.get("payload") or {}
            headers_list = payload.get("headers")
            normalized_payload = _normalize_payload_base64(payload) if include_payload else None

            parsed = await _parse_payload(
                client=client, token=token, user_id=user_id, message_id=message_id, payload=payload,
                max_attachment_bytes=10 * 1024 * 1024, max_attachment_data_bytes_each=256 * 1024,
                max_attachment_data_bytes_total=512 * 1024, max_data_base64_chars=4096,
                include_attachments=include_attachments, unzip_attachments=unzip_attachments,
                include_attachment_data=include_attachment_data, include_unzipped_data=include_unzipped_data,
            )

            # 파싱 호출 목록 생성 (attachmentId 포함)
            next_calls: list[dict[str, Any]] = []
            if include_attachments and parsed["attachments"]:
                next_calls = _build_next_calls(message_id, parsed["attachments"])

            attachments_summary = [
                {
                    "filename": a.get("filename", ""),
                    "mimeType": a.get("mimeType", ""),
                    "attachmentId": a.get("attachmentId", ""),
                    "size": a.get("size", 0),
                    "skipped": a.get("skipped", False),
                }
                for a in parsed["attachments"]
            ]

            classification = _build_classification(parsed["attachments"])

            result = {
                "id": data.get("id") or message_id,
                "headers": {
                    "subject": _find_header(headers_list, "Subject"),
                    "from": _find_header(headers_list, "From"),
                    "to": _find_header(headers_list, "To"),
                    "date": _find_header(headers_list, "Date"),
                },
                **({"payload": normalized_payload} if normalized_payload is not None else {}),
                "body": {"textPlain": _truncate_text(str(parsed["textPlain"]), int(max_body_chars))[0]},
                "attachments": attachments_summary,
                "classification": classification,
            }

            # ⚠️ _AGENT_INSTRUCTION을 JSON 최상단(first key)에 배치
            # → 에이전트가 거대한 result를 읽기 전에 지시를 먼저 인식하도록
            if next_calls:
                response: dict[str, Any] = {
                    "_AGENT_INSTRUCTION": (
                        "=== DO NOT CALL gmail_fetch AGAIN === "
                        "You now have all attachment IDs in _next_calls. "
                        "Call gmail_parse_pdf_attachment for each PDF NOW, one by one, in _next_calls order. "
                        "Do NOT call gmail_search or gmail_fetch again under any circumstances."
                    ),
                    "_next_calls": next_calls,
                    "ok": True,
                    "result": result,
                }
            else:
                response = {"ok": True, "result": result}

            return json.dumps(response, ensure_ascii=False)

    except httpx.HTTPStatusError as e:
        return json.dumps({"ok": False, "error": {"status_code": e.response.status_code, "message": e.response.text}}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"ok": False, "error": {"message": str(e)}}, ensure_ascii=False)


def build_gmail_fetch_tool(
    agent_id: str,
    user_id: str | None = None,
    source: str | None = None,
) -> BaseTool:
    async def _gmail_fetch_with_internal_token(**kwargs: Any) -> str:
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
                token = (res.json() or {}).get("accessToken")
        except httpx.HTTPStatusError as e:
            return json.dumps({"ok": False, "error": {"status_code": e.response.status_code, "message": e.response.text}}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"ok": False, "error": {"message": str(e)}}, ensure_ascii=False)

        if not token:
            return json.dumps({"ok": False, "error": {"message": "Gmail is not connected or token issuance failed"}}, ensure_ascii=False)

        return await _gmail_fetch(token=token, **kwargs)

    return build_custom_tool(
        CustomToolProperties(
            name="gmail_fetch",
            description=(
                "Fetch Gmail message headers, body text, and attachment metadata. "
                "Returns _AGENT_INSTRUCTION (READ THIS FIRST) and _next_calls with exact parameters "
                "to call for each attachment. Follow _next_calls immediately after this tool returns. "
                "Do NOT call gmail_fetch again — attachmentIds are in _next_calls."
            ),
            args_schema=GmailFetchArgs,
            tags=["gmail"],
        ),
        coroutine=_gmail_fetch_with_internal_token,
    )
