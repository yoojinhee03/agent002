"""MCP 서버 도구 메타 조회용 라우터.

백엔드(NestJS) `mcp.service.ts::connect` / refresh-tools 가 MCP 서버 도구 메타를
캐시(mcp_servers.tools JSON 컬럼) 하기 위해 호출한다. 실제 도구 호출 자체는
에이전트 실행 흐름의 `McpClientService.to_structured_tools` 가 담당하고, 이 채널은
list_tools 결과의 name/description/inputSchema 만 가볍게 반환한다.
"""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.common.deps import require_api_key
from src.modules.mcp.mcp_client_service import McpClientService

router = APIRouter(prefix="/mcp", tags=["MCP"])
logger = structlog.get_logger(__name__)


class ListToolsBody(BaseModel):
    transport: str
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    headers: dict[str, str] | None = None


class McpToolMeta(BaseModel):
    name: str
    description: str
    # MCP 표준 필드명 (camelCase) — 백엔드 McpTool 인터페이스 및 mcp_servers.tools JSON
    # 스키마와 일치해야 하므로 N815 규칙 적용 제외.
    inputSchema: dict[str, Any]  # noqa: N815


class ListToolsResponse(BaseModel):
    tools: list[McpToolMeta]


@router.post("/list-tools", response_model=ListToolsResponse)
async def list_tools(
    body: ListToolsBody,
    api_key: dict = Depends(require_api_key),
) -> ListToolsResponse:
    server: dict[str, Any] = {
        "transport": body.transport,
        "command": body.command,
        "args": body.args or [],
        "env": body.env or None,
        "url": body.url,
        "headers": body.headers or {},
    }
    try:
        metas = await McpClientService.list_tool_meta(server)
    except Exception as e:  # noqa: BLE001
        logger.warning("mcp.list_tool_meta failed", transport=body.transport, error=str(e))
        raise HTTPException(
            status_code=502,
            detail=f"MCP list_tools failed: {type(e).__name__}: {e}",
        ) from e
    return ListToolsResponse(tools=[McpToolMeta(**m) for m in metas])
