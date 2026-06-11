"""OAuth MCP 표준 콜백 프록시.

sandbox 컨테이너 안의 MCP 서버는 컨테이너 9876/tcp 에 콜백 리스너를 띄우고,
provider 에는 본 라우트(``{PUBLIC_OAUTH_CALLBACK_URL}``)를 redirect_uri 로 등록한다.
provider 가 ``state=<thread_id>:<csrf>`` 형태로 콜백을 보내면 thread_id 로
sandbox 의 호스트 매핑 포트를 찾아 ``http://127.0.0.1:<port>/callback`` 으로 프록시한다.

표준 env (MCP 서버 측이 읽어야 함):
- ``MCP_OAUTH_REDIRECT_URI``    — provider 등록 + 토큰 교환에 사용할 외부 URI
- ``MCP_OAUTH_CALLBACK_HOST``   — 리스너 바인드 주소 (``0.0.0.0`` 권장)
- ``MCP_OAUTH_CALLBACK_PORT``   — 리스너 포트 (컨테이너 안 기준 ``9876``)
- ``MCP_OAUTH_STATE_PREFIX``    — state 앞에 붙일 thread_id

provider 등록 redirect_uri 는 thread별로 다를 필요가 없다. state 의 thread_id 로 라우팅.
"""

import logging

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response

from src.modules.deep.docker_sandbox import get_sandbox_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["OAuth"])


@router.get("/oauth/callback", include_in_schema=False)
async def oauth_callback(request: Request) -> Response:
    state = request.query_params.get("state", "")
    if not state or ":" not in state:
        return Response(content=b"invalid state", status_code=400, media_type="text/plain")

    thread_id, _ = state.split(":", 1)
    if not thread_id:
        return Response(content=b"invalid state", status_code=400, media_type="text/plain")

    host_port = await get_sandbox_manager().get_oauth_host_port(thread_id)
    if not host_port:
        logger.warning("oauth callback: no sandbox for thread_id=%s", thread_id)
        return Response(content=b"sandbox not found", status_code=404, media_type="text/plain")

    upstream_url = f"http://127.0.0.1:{host_port}/callback"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            upstream = await client.get(upstream_url, params=request.query_params)
    except httpx.HTTPError as e:
        logger.warning("oauth callback: upstream %s failed: %s", upstream_url, e)
        return Response(content=b"upstream error", status_code=502, media_type="text/plain")

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )
