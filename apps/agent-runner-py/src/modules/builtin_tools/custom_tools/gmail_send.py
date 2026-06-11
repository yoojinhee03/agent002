from __future__ import annotations

import base64
import json
import logging
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr
from typing import Any

import httpx
from langchain_core.tools import BaseTool, ToolException
from pydantic import BaseModel, Field

from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool

logger = logging.getLogger(__name__)


class GmailSendArgs(BaseModel):
    to: str = Field(description="수신자 이메일 주소 (예: user@example.com)")
    subject: str = Field(description="메일 제목")
    body: str = Field(description="메일 본문 (plain text)")
    user_id: str = Field(default="me")
    cc: str | None = Field(default=None, description="참조(CC) 이메일 주소 (선택)")
    bcc: str | None = Field(default=None, description="숨은 참조(BCC) 이메일 주소 (선택)")
    reply_to_message_id: str | None = Field(
        default=None,
        description="답장할 원본 메시지 ID (스레드 연결 시 사용)",
    )


def _encode_addr(addr: str) -> str:
    """이름 부분에 비 ASCII 문자가 있으면 RFC 2047로 인코딩."""
    name, email_addr = parseaddr(addr)
    if not name:
        return addr
    try:
        name.encode("ascii")
        return addr
    except UnicodeEncodeError:
        return formataddr((str(Header(name, "utf-8")), email_addr))


def _build_raw_message(
    to: str,
    subject: str,
    body: str,
    cc: str | None = None,
    bcc: str | None = None,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> str:
    """RFC 2822 메시지를 생성하고 base64url 인코딩해서 반환."""
    msg = MIMEMultipart("alternative")
    msg["To"] = _encode_addr(to)
    msg["Subject"] = str(Header(subject, "utf-8"))
    if cc:
        msg["Cc"] = _encode_addr(cc)
    if bcc:
        msg["Bcc"] = _encode_addr(bcc)
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references

    msg.attach(MIMEText(body, "plain", "utf-8"))
    raw_bytes = msg.as_bytes()
    return base64.urlsafe_b64encode(raw_bytes).decode("ascii")


async def _fetch_message_meta(
    client: httpx.AsyncClient,
    token: str,
    user_id: str,
    message_id: str,
) -> dict[str, Any]:
    """원본 메시지의 threadId / Message-ID 헤더를 조회."""
    url = f"https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages/{message_id}"
    resp = await client.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        params={"format": "metadata", "metadataHeaders": ["Message-ID", "References"]},
    )
    resp.raise_for_status()
    data = resp.json()
    headers_list = (data.get("payload") or {}).get("headers") or []
    hmap = {(h.get("name") or "").lower(): (h.get("value") or "") for h in headers_list}
    return {
        "threadId": data.get("threadId"),
        "messageId": hmap.get("message-id", ""),
        "references": hmap.get("references", ""),
    }


async def _gmail_send(
    token: str,
    to: str,
    subject: str,
    body: str,
    user_id: str = "me",
    cc: str | None = None,
    bcc: str | None = None,
    reply_to_message_id: str | None = None,
) -> str:
    if not token:
        raise ToolException("Gmail send failed: Missing access_token")

    send_url = f"https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages/send"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            thread_id: str | None = None
            in_reply_to: str | None = None
            references: str | None = None

            # 답장 스레드 연결
            if reply_to_message_id:
                try:
                    meta = await _fetch_message_meta(client, token, user_id, reply_to_message_id)
                    thread_id = meta.get("threadId")
                    orig_msg_id = meta.get("messageId", "")
                    orig_refs = meta.get("references", "")
                    if orig_msg_id:
                        in_reply_to = orig_msg_id
                        references = f"{orig_refs} {orig_msg_id}".strip() if orig_refs else orig_msg_id
                except Exception:
                    pass  # 메타 조회 실패 시 일반 발송으로 fallback

            raw = _build_raw_message(
                to=to,
                subject=subject,
                body=body,
                cc=cc,
                bcc=bcc,
                in_reply_to=in_reply_to,
                references=references,
            )

            payload: dict[str, Any] = {"raw": raw}
            if thread_id:
                payload["threadId"] = thread_id

            resp = await client.post(
                send_url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                content=json.dumps(payload),
            )
            resp.raise_for_status()
            result = resp.json()

            logger.debug("gmail_send ok: to=%s messageId=%s", to, result.get("id"))
            return json.dumps(
                {
                    "ok": True,
                    "messageId": result.get("id"),
                    "threadId": result.get("threadId"),
                    "labelIds": result.get("labelIds", []),
                },
                ensure_ascii=False,
            )

    except httpx.HTTPStatusError as e:
        # 4xx/5xx 를 정상 결과처럼 돌려주면 LLM 이 발송 성공으로 오인한다 → 표면화.
        logger.warning("gmail_send HTTP error: %s %s", e.response.status_code, e.response.text)
        raise ToolException(
            f"Gmail send failed (HTTP {e.response.status_code}): {e.response.text}"
        ) from e
    except Exception as e:
        logger.warning("gmail_send error: %s", e)
        raise ToolException(f"Gmail send failed: {e}") from e


def build_gmail_send_tool(
    agent_id: str,
    user_id: str | None = None,
    source: str | None = None,
) -> BaseTool:
    async def _gmail_send_with_internal_token(**kwargs: Any) -> str:
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
            logger.warning("gmail token issue failed: %s %s", e.response.status_code, e.response.text)
            raise ToolException(
                f"Gmail token issuance failed (HTTP {e.response.status_code}): {e.response.text}"
            ) from e
        except Exception as e:
            logger.warning("gmail token issue error: %s", e)
            raise ToolException(f"Gmail token issuance failed: {e}") from e

        if not token:
            raise ToolException("Gmail is not connected or token issuance failed")

        return await _gmail_send(token=token, **kwargs)

    return build_custom_tool(
        CustomToolProperties(
            name="gmail_send",
            description=(
                "Gmail로 메일을 발송한다. "
                "to(수신자), subject(제목), body(본문)는 필수. "
                "reply_to_message_id를 지정하면 해당 메일 스레드에 답장으로 발송된다. "
                "담당자 승인 후 호출할 것 — 승인 없이 절대 호출 금지."
            ),
            args_schema=GmailSendArgs,
            tags=["gmail"],
        ),
        coroutine=_gmail_send_with_internal_token,
    )
