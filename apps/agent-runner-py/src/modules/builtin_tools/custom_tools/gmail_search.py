"""Gmail search 도구. 결과는 자동으로 /state/last_gmail_search.json 에 영속화.

NOTE: 이 파일은 의도적으로 `from __future__ import annotations` 를 사용하지 않는다.
StructuredTool 의 `_injected_args_keys` 가 `inspect.signature` 의 raw annotation 으로
ToolRuntime 주입을 판별하는데, future-annotations 가 켜져 있으면 annotation 이 string
이 되어 `_is_directly_injected_arg_type` 의 `issubclass` 검사가 통과 못 함 →
ToolRuntime 인젝션 누락 → 호출 시 `runtime` positional 누락 에러.
"""

import base64
import json
from datetime import datetime, timezone
from typing import Any

import httpx
from deepagents.backends.protocol import FileData
from langchain.tools import ToolRuntime
from langchain_core.messages import ToolMessage
from langchain_core.tools import BaseTool
from langgraph.types import Command
from pydantic import BaseModel, Field

from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool

# 에이전트가 read_file/write_file 에서 보는 경로 (CompositeBackend 의 `/state/` 라우트).
STATE_LAST_SEARCH_PATH = "/state/last_gmail_search.json"
# state["files"] 에 실제로 저장되는 키 — CompositeBackend 가 routing 시 `/state/` 를
# strip 해서 StateBackend 에 넘기므로, 우리가 Command(update={"files":...}) 로
# 직접 state 에 쓸 때는 strip 된 키를 사용해야 read 와 일치한다.
_STATE_LAST_SEARCH_FILES_KEY = "/last_gmail_search.json"


def _base64url_decode(data: str) -> bytes:
    if not data:
        return b""
    return base64.urlsafe_b64decode(data + "==")


def _extract_text_plain(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    mime_type = str(payload.get("mimeType") or "")
    body = payload.get("body") if isinstance(payload.get("body"), dict) else {}
    if mime_type == "text/plain":
        data_str = str(body.get("data") or "")
        if data_str:
            try:
                return _base64url_decode(data_str).decode("utf-8", errors="replace")
            except Exception:
                return ""
    parts = payload.get("parts")
    if isinstance(parts, list):
        for part in parts:
            text = _extract_text_plain(part)
            if text:
                return text
    return ""


def _truncate_body(text: str, max_chars: int) -> str:
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    return text[:max_chars] + f"… (truncated {len(text) - max_chars} chars)"


class GmailSearchArgs(BaseModel):
    q: str = Field(min_length=1, description="Gmail search query (from:, subject:, after:, has:attachment, etc.)")
    user_id: str = Field(default="me")
    max_results: int = Field(
        default=10,
        ge=1,
        le=100,
        description=(
            "Number of emails to return. "
            "MUST match the exact count the user requested: "
            "e.g., user says '3개' (3 emails) → set to 3; user says '하나' or 'one' → set to 1. "
            "Use the default (10) only when the user has not specified a count."
        ),
    )
    include_spam_trash: bool = Field(default=False)
    page_token: str | None = Field(default=None)
    include_body: bool = Field(
        default=True,
        description=(
            "If true (default), fetch and include the body text of each email in the same call. "
            "Set to false only when the user explicitly wants a metadata list (subjects/senders) without reading content."
        ),
    )
    max_body_chars: int = Field(
        default=3000,
        ge=0,
        description="Maximum body text characters per email when include_body=True.",
    )


async def _gmail_search(
    token: str,
    q: str,
    user_id: str = "me",
    max_results: int = 10,
    include_spam_trash: bool = False,
    page_token: str | None = None,
    include_body: bool = True,
    max_body_chars: int = 3000,
) -> str:
    if not token:
        payload = {"ok": False, "error": {"message": "Missing access_token"}}
        return json.dumps(payload, ensure_ascii=False)

    url = f"https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages"
    params: dict[str, Any] = {
        "q": q,
        "maxResults": max_results,
        "includeSpamTrash": include_spam_trash,
    }
    if page_token:
        params["pageToken"] = page_token

    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()

            messages = data.get("messages") or []
            enriched: list[dict[str, Any]] = []
            for m in messages[:max_results]:
                mid = m.get("id")
                if not mid:
                    continue

                detail_url = f"https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages/{mid}"
                if include_body:
                    detail_params: dict[str, Any] = {"format": "full"}
                else:
                    detail_params = {
                        "format": "metadata",
                        "metadataHeaders": ["Subject", "From", "Date"],
                    }

                dresp = await client.get(detail_url, headers=headers, params=detail_params)
                dresp.raise_for_status()
                djson = dresp.json()
                payload_data = djson.get("payload") or {}
                headers_list = payload_data.get("headers") or []
                header_map = {
                    (h.get("name") or "").lower(): (h.get("value") or "")
                    for h in headers_list
                    if isinstance(h, dict)
                }

                entry: dict[str, Any] = {
                    "id": mid,
                    "threadId": djson.get("threadId") or m.get("threadId"),
                    "subject": header_map.get("subject", ""),
                    "from": header_map.get("from", ""),
                    "date": header_map.get("date", ""),
                    "snippet": djson.get("snippet") or "",
                }

                if include_body:
                    body_text = _extract_text_plain(payload_data)
                    entry["body"] = _truncate_body(body_text, max_body_chars)

                enriched.append(entry)

    except httpx.HTTPStatusError as e:
        payload = {
            "ok": False,
            "error": {"status_code": e.response.status_code, "message": e.response.text},
        }
        return json.dumps(payload, ensure_ascii=False)
    except Exception as e:
        payload = {"ok": False, "error": {"message": str(e)}}
        return json.dumps(payload, ensure_ascii=False)

    base_payload: dict[str, Any] = {
        "ok": True,
        "resultSizeEstimate": data.get("resultSizeEstimate"),
        "nextPageToken": data.get("nextPageToken"),
        "messages": enriched,
    }

    if enriched and include_body:
        # SubAgent description이 "1개" 등 더 적은 수를 지시해도 실제 반환된 전체를 보고하도록 강제
        payload = {
            "_AGENT_INSTRUCTION": (
                f"=== OVERRIDE TASK DESCRIPTION === "
                f"The search returned {len(enriched)} email(s) with full body content. "
                f"You MUST report ALL {len(enriched)} emails to the caller — "
                "do NOT reduce the count based on any prior task description or instruction. "
                "Each email's subject, sender, date, and body is already included in 'messages'. "
                f"These results are also persisted at {STATE_LAST_SEARCH_PATH} — "
                "follow-up turns can read_file it to recover message_id without re-searching."
            ),
            **base_payload,
        }
    elif enriched and not include_body:
        next_calls = [{"tool": "gmail_fetch", "params": {"message_id": m["id"]}} for m in enriched]
        payload = {
            "_AGENT_INSTRUCTION": (
                f"Found {len(enriched)} email(s). "
                "To read the full content of each email, call gmail_fetch for EVERY message_id in _next_calls — one by one. "
                f"These results are also persisted at {STATE_LAST_SEARCH_PATH}."
            ),
            "_next_calls": next_calls,
            **base_payload,
        }
    else:
        payload = base_payload

    return json.dumps(payload, ensure_ascii=False)


def _should_persist(json_str: str) -> bool:
    """결과 payload 가 메일 1건 이상을 담고 있을 때만 /state/ 저장."""
    try:
        parsed = json.loads(json_str)
    except (TypeError, ValueError):
        return False
    if not isinstance(parsed, dict):
        return False
    if not parsed.get("ok"):
        return False
    messages = parsed.get("messages") or []
    return isinstance(messages, list) and len(messages) > 0


def build_gmail_search_tool(
    agent_id: str,
    user_id: str | None = None,
    source: str | None = None,
) -> BaseTool:
    async def _gmail_search_with_internal_token(
        runtime: ToolRuntime,
        **kwargs: Any,
    ) -> str | Command:
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

        result_json = await _gmail_search(token=token, **kwargs)

        # 결과가 있고 ToolRuntime 이 있을 때만 /state/ 영속화 (Command pattern).
        # 그 외에는 기존처럼 JSON string 반환 — LLM 동작에 영향 없음.
        if not (runtime and runtime.tool_call_id and _should_persist(result_json)):
            return result_json

        now_iso = datetime.now(timezone.utc).isoformat()
        file_data: FileData = {
            "content": result_json,
            "encoding": "utf-8",
            "created_at": now_iso,
            "modified_at": now_iso,
        }
        return Command(
            update={
                "messages": [
                    ToolMessage(result_json, tool_call_id=runtime.tool_call_id),
                ],
                "files": {_STATE_LAST_SEARCH_FILES_KEY: file_data},
            }
        )

    return build_custom_tool(
        CustomToolProperties(
            name="gmail_search",
            description=(
                "Search Gmail messages and return results with body text included by default (include_body=True). "
                "Set max_results to the exact count the user requested. "
                "Set include_body=False only when the user wants a metadata list without reading content. "
                "When include_body=True, no separate gmail_fetch calls are needed — body is already in the response. "
                f"Results are also persisted to {STATE_LAST_SEARCH_PATH} — follow-up turns can read_file it "
                "to recover message_id (and full content) without re-issuing the same search."
            ),
            args_schema=GmailSearchArgs,
            tags=["gmail"],
        ),
        coroutine=_gmail_search_with_internal_token,
    )
