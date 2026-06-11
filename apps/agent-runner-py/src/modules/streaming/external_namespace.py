"""External socket.io namespace `/v1/chat` (Phase 9-3).

외부 client 가 X-API-Key 1장으로 connect → subscribe(threadId) 후
external_event_adapter 가 발행하는 `chat.*` 이벤트를 수신한다.
"""
from __future__ import annotations

import hashlib
from typing import Any

import structlog

from src.database.client import fetch_one
from src.modules.streaming.external_event_adapter import EXTERNAL_NAMESPACE, is_enabled

logger = structlog.get_logger(__name__)


def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


async def _resolve_api_key(raw_key: str) -> dict[str, Any] | None:
    """raw key → (api_key row + agent_deployment 요약). 무효한 키면 None."""
    key_hash = _hash_api_key(raw_key)
    row = await fetch_one(
        """
        SELECT
            ak.id            AS api_key_id,
            ak.status        AS api_key_status,
            ak.enabled       AS api_key_enabled,
            ak.valid_from    AS api_key_valid_from,
            ak.expires_at    AS api_key_expires_at,
            ak.agent_deployment_id AS agent_deployment_id,
            ad.status        AS deployment_status,
            ad.agent_id      AS agent_id,
            ad.project_id    AS project_id
        FROM api_keys ak
        LEFT JOIN agent_deployments ad ON ad.id = ak.agent_deployment_id
        WHERE ak.key_hash = $1
        """,
        (key_hash,),
    )
    if not row:
        return None
    return row


def register(sio: Any) -> None:
    """`/v1/chat` namespace 핸들러 등록 (main.py 또는 hitl_gateway 모듈 로딩 시 1회 호출)."""

    @sio.event(namespace=EXTERNAL_NAMESPACE)
    async def connect(sid: str, environ: dict, auth: dict | None = None) -> bool:  # noqa: ARG001
        """connect 시 auth.apiKey 검증. 실패 시 False 반환 → socket.io 가 disconnect."""
        if not is_enabled():
            logger.warning("chat connect rejected: EXTERNAL_CHAT_ENABLED=false", sid=sid)
            return False

        raw_key: str | None = None
        if isinstance(auth, dict):
            raw_key = auth.get("apiKey") or auth.get("api_key")

        if not raw_key:
            # fallback: HTTP header X-API-Key (handshake)
            headers = {k.lower(): v for k, v in (environ.get("asgi.headers") or [])}
            raw_key = headers.get(b"x-api-key", b"").decode("utf-8") if headers else ""

        if not raw_key:
            logger.warning("chat connect rejected: no apiKey", sid=sid)
            return False

        row = await _resolve_api_key(raw_key)
        if not row:
            logger.warning("chat connect rejected: invalid apiKey", sid=sid)
            return False

        if row.get("api_key_status") != "active" or not row.get("api_key_enabled"):
            logger.warning("chat connect rejected: api key revoked", sid=sid)
            return False
        if not row.get("agent_deployment_id"):
            logger.warning("chat connect rejected: api key not bound to deployment", sid=sid)
            return False
        if row.get("deployment_status") != "active":
            logger.warning("chat connect rejected: deployment inactive",
                           sid=sid, status=row.get("deployment_status"))
            return False

        await sio.save_session(
            sid,
            {
                "apiKeyId": row["api_key_id"],
                "agentDeploymentId": row["agent_deployment_id"],
                "agentId": row["agent_id"],
                "projectId": row["project_id"],
            },
            namespace=EXTERNAL_NAMESPACE,
        )
        logger.info("chat connected", sid=sid, deployment_id=row["agent_deployment_id"])
        return True

    @sio.event(namespace=EXTERNAL_NAMESPACE)
    async def disconnect(sid: str) -> None:
        logger.info("chat disconnected", sid=sid)

    @sio.on("subscribe", namespace=EXTERNAL_NAMESPACE)
    async def on_subscribe(sid: str, data: dict) -> dict[str, Any]:
        """{"threadId": "..."} 를 받아 thread room 에 가입한다.
        thread.agentDeploymentId 가 connect 시 인증된 deployment 와 일치해야 한다."""
        thread_id = data.get("threadId") if isinstance(data, dict) else None
        if not thread_id:
            return {"ok": False, "error": "threadId required"}

        session = await sio.get_session(sid, namespace=EXTERNAL_NAMESPACE)
        deployment_id = (session or {}).get("agentDeploymentId")
        if not deployment_id:
            return {"ok": False, "error": "session missing deployment binding"}

        thread = await fetch_one(
            "SELECT agent_deployment_id FROM threads WHERE id = $1",
            (thread_id,),
        )
        if not thread:
            return {"ok": False, "error": "thread not found"}
        if thread.get("agent_deployment_id") != deployment_id:
            return {"ok": False, "error": "thread does not belong to this deployment"}

        await sio.enter_room(sid, f"thread:{thread_id}", namespace=EXTERNAL_NAMESPACE)
        logger.info("chat subscribed", sid=sid, thread_id=thread_id)
        return {"ok": True, "threadId": thread_id}

    @sio.on("unsubscribe", namespace=EXTERNAL_NAMESPACE)
    async def on_unsubscribe(sid: str, data: dict) -> dict[str, Any]:
        thread_id = data.get("threadId") if isinstance(data, dict) else None
        if not thread_id:
            return {"ok": False, "error": "threadId required"}
        await sio.leave_room(sid, f"thread:{thread_id}", namespace=EXTERNAL_NAMESPACE)
        return {"ok": True, "threadId": thread_id}
