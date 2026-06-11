"""MCP (Model Context Protocol) 클라이언트 서비스 — stdio / sse / streamable_http 지원

도구 호출 생명주기 주의: list_tools 로 도구 메타(name/description/inputSchema)만 한 번 조회한
뒤, 실제 call_tool 은 **매 호출마다 새 연결을 열어** 수행한다. (이전 구현은 list 시점의
session 을 도구에 캡처했는데, to_structured_tools 가 `async with` 블록을 빠져나오면 session/
stdio 가 닫혀 이후 call_tool 이 "MCP tool error" 로 실패하는 회귀가 있었다.)
"""
import logging
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool, ToolException

from src.common.utils import sanitize_tool_name

logger = logging.getLogger(__name__)


class McpClientService:
    @classmethod
    async def to_structured_tools(
        cls,
        server: dict[str, Any],
        allowed_tool_names: set[str] | None = None,
        *,
        thread_id: str | None = None,
    ) -> list[BaseTool]:
        """MCP 서버에서 LangChain StructuredTool 목록을 반환한다.

        필터링 우선순위:
        1. server dict 의 ``exposed_tools`` / ``exposedTools`` 가 비어있지 않으면 그 이름만 포함.
        2. 호출자가 ``allowed_tool_names`` 를 전달하면 (1) 결과와 교집합을 취한다.
        둘 다 None/빈 경우 전체 도구를 반환한다 (하위 호환).

        ``thread_id`` 가 주어지면 도구의 call 단계 stdio spawn 을 thread 의 sandbox
        컨테이너 안에서 ``docker exec`` 로 수행한다 (토큰/포트 격리). 메타 list 단계는
        sandbox 가 아직 없을 수 있어 항상 host 에서 수행한다.
        """
        transport = server.get("transport", "stdio")
        try:
            if transport == "stdio":
                raw_tools = await cls._stdio_tools(server, thread_id=thread_id)
            elif transport in ("sse", "streamable_http"):
                raw_tools = await cls._http_tools(server)
            else:
                return []
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"MCP server {server.get('id')} load failed: {e}")
            return []

        # exposed_tools 필터: snake_case / camelCase 양쪽 대응
        exposed: list[str] = (
            server.get("exposed_tools")
            or server.get("exposedTools")
            or []
        )
        allowed: set[str] | None = set(exposed) if exposed else None

        # caller 가 전달한 allowed_tool_names 와 교집합
        if allowed_tool_names is not None:
            allowed = allowed_tool_names if allowed is None else allowed & allowed_tool_names

        if allowed is None:
            return raw_tools

        # StructuredTool.name 은 sanitize_tool_name() 을 거쳤으므로
        # 원본 이름(MCP tool name)과 직접 비교한다.
        # _wrap_mcp_tool 에서 원본 이름을 클로저에 캡처하므로
        # tool.name 은 sanitized 이름이다. allowed set 도 sanitize 해서 비교한다.
        from src.common.utils import sanitize_tool_name
        sanitized_allowed = {sanitize_tool_name(n) for n in allowed}
        return [t for t in raw_tools if t.name in sanitized_allowed]

    @classmethod
    async def list_tool_meta(cls, server: dict[str, Any]) -> list[dict[str, Any]]:
        """MCP 서버에서 도구 메타(name/description/inputSchema)만 추출.

        백엔드(NestJS)가 mcp_servers.tools JSON 컬럼을 캐시하기 위해 호출한다.
        실제 도구 호출은 agents 실행 흐름에서 to_structured_tools 가 별도로 수행.
        """
        from mcp import ClientSession

        transport = server.get("transport", "stdio")
        if transport == "stdio":
            from mcp.client.stdio import stdio_client

            params = cls._stdio_params(server)
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.list_tools()
                    return [
                        {
                            "name": t.name,
                            "description": t.description or "",
                            "inputSchema": getattr(t, "inputSchema", {}) or {},
                        }
                        for t in result.tools
                    ]
        if transport in ("sse", "streamable_http"):
            from mcp.client.sse import sse_client

            url = server.get("url", "")
            headers = server.get("headers") or {}
            async with sse_client(url, headers=headers) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.list_tools()
                    return [
                        {
                            "name": t.name,
                            "description": t.description or "",
                            "inputSchema": getattr(t, "inputSchema", {}) or {},
                        }
                        for t in result.tools
                    ]
        raise ValueError(f"Unsupported MCP transport: {transport}")

    @classmethod
    def _stdio_params(cls, server: dict[str, Any]) -> Any:
        import os

        from mcp import StdioServerParameters

        user_env: dict[str, str] = server.get("env") or {}
        raw_args = server.get("args", []) or []
        args = cls._expand_env_placeholders(raw_args, user_env)

        # StdioServerParameters.env 는 dict 가 주어지면 부모 환경을 상속하지 않고 완전히
        # 대체한다. 그러면 npx 가 PATH 를 잃어 node 를 못 찾고, mcp-remote 는 HOME/NODE_PATH
        # 등 기본값 없이 동작해 인증 단에서 실패한다. Claude Desktop / Cursor 와 동일하게
        # os.environ 위에 user_env 를 덮어쓰는 머지로 전달한다.
        merged_env: dict[str, str] | None = None
        if user_env:
            merged_env = {**os.environ, **user_env}

        return StdioServerParameters(
            command=server["command"],
            args=args,
            env=merged_env,
        )

    @staticmethod
    def _expand_env_placeholders(args: list[str], env: dict[str, str]) -> list[str]:
        """args 내 ``${KEY}`` / ``$KEY`` 토큰을 ``env`` 값으로 치환.

        ``StdioServerParameters`` 는 shell 을 거치지 않고 직접 spawn 하므로 args 안의
        쉘 변수 문법이 expand 되지 않는다. 다른 MCP 클라이언트(Claude Desktop 등)와
        호환되도록 우리가 직접 치환해 넘긴다. 매칭 실패한 토큰은 그대로 둔다.
        """
        import re

        pattern = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)")

        def repl(match: "re.Match[str]") -> str:
            key = match.group(1) or match.group(2)
            return env.get(key, match.group(0))

        return [pattern.sub(repl, a) if isinstance(a, str) else a for a in args]

    @classmethod
    async def _stdio_tools(
        cls,
        server: dict[str, Any],
        *,
        thread_id: str | None = None,
    ) -> list[BaseTool]:
        from mcp import ClientSession
        from mcp.client.stdio import stdio_client

        # list 단계는 항상 host 에서 (메타만 조회, 토큰 영속화 없음).
        params = cls._stdio_params(server)
        tools: list[BaseTool] = []
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
                metas = list(result.tools)
        for mcp_tool in metas:
            tools.append(cls._wrap_mcp_tool(mcp_tool, server, thread_id=thread_id))
        return tools

    @classmethod
    async def _http_tools(cls, server: dict[str, Any]) -> list[BaseTool]:
        from mcp import ClientSession
        from mcp.client.sse import sse_client

        url = server.get("url", "")
        headers = server.get("headers", {})
        tools: list[BaseTool] = []
        async with sse_client(url, headers=headers) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
                metas = list(result.tools)
        for mcp_tool in metas:
            tools.append(cls._wrap_mcp_tool(mcp_tool, server, thread_id=None))
        return tools

    @classmethod
    async def _open_session(
        cls,
        server: dict[str, Any],
        *,
        thread_id: str | None = None,
    ):
        """transport 별 (read, write) context manager 를 반환 (호출 측에서 async with).

        ``thread_id`` 가 주어지고 해당 thread 의 sandbox 컨테이너가 존재하면
        stdio 의 spawn 을 ``docker exec`` 로 컨테이너 안에서 수행한다.
        """
        transport = server.get("transport", "stdio")
        if transport == "stdio":
            from mcp.client.stdio import stdio_client

            params = await cls._stdio_params_for_call(server, thread_id=thread_id)
            return stdio_client(params)
        from mcp.client.sse import sse_client

        return sse_client(server.get("url", ""), headers=server.get("headers", {}))

    @classmethod
    async def _stdio_params_for_call(
        cls,
        server: dict[str, Any],
        *,
        thread_id: str | None,
    ) -> Any:
        """call 시점용 StdioServerParameters — sandbox 컨테이너 안에서 docker exec 로 spawn.

        thread_id 없거나 컨테이너가 없으면 host spawn 으로 폴백.
        """
        import os

        from mcp import StdioServerParameters

        base = cls._stdio_params(server)
        if not thread_id:
            return base

        try:
            from src.modules.deep.docker_sandbox import get_sandbox_manager
        except Exception:  # noqa: BLE001
            return base

        container_name = await get_sandbox_manager().get_container_name(thread_id)
        if not container_name:
            logger.warning(
                "MCP stdio: sandbox container not found for thread %s — falling back to host spawn",
                thread_id,
            )
            return base

        user_env: dict[str, str] = server.get("env") or {}
        # docker exec -e KEY=VAL 플랫화. user_env 만 전달 (호스트 os.environ 누설 방지).
        env_flags: list[str] = []
        for k, v in user_env.items():
            env_flags.extend(["-e", f"{k}={v}"])

        # OAuth MCP 표준 env — 모든 stdio MCP 호출에 무조건 주입.
        # OAuth 안 쓰는 MCP 는 이 env 를 읽지 않으므로 무해. 별도 활성화 플래그 없음.
        from src.config import settings
        from src.modules.deep.docker_sandbox import SANDBOX_OAUTH_CALLBACK_PORT

        standard_oauth_env = {
            "MCP_OAUTH_REDIRECT_URI": settings.PUBLIC_OAUTH_CALLBACK_URL,
            "MCP_OAUTH_CALLBACK_HOST": "0.0.0.0",
            "MCP_OAUTH_CALLBACK_PORT": str(SANDBOX_OAUTH_CALLBACK_PORT),
            "MCP_OAUTH_STATE_PREFIX": thread_id,
        }
        for k, v in standard_oauth_env.items():
            # user_env 가 명시한 값이 우선.
            if k in user_env:
                continue
            env_flags.extend(["-e", f"{k}={v}"])

        original_command = base.command
        original_args = list(base.args or [])
        docker_args = [
            "exec",
            "-i",
            *env_flags,
            container_name,
            original_command,
            *original_args,
        ]
        return StdioServerParameters(
            command="docker",
            args=docker_args,
            env=dict(os.environ),
        )

    @classmethod
    def _wrap_mcp_tool(
        cls,
        mcp_tool: Any,
        server: dict[str, Any],
        *,
        thread_id: str | None = None,
    ) -> BaseTool:
        tool_name = mcp_tool.name
        tool_description = mcp_tool.description or ""
        # MCP 도구의 JSON Schema. args_schema 로 주지 않으면 langchain 이 _call(**kwargs)
        # 시그니처에서 단일 'kwargs' 필드를 추론해, LLM 인자가 {'kwargs': {...}} 로 한 번 더
        # 감싸져 MCP 서버에 잘못 전달된다.
        input_schema = getattr(mcp_tool, "inputSchema", None)

        async def _call(**kwargs: Any) -> str:
            from mcp import ClientSession

            call_args = kwargs
            if set(kwargs.keys()) == {"kwargs"} and isinstance(kwargs["kwargs"], dict):
                call_args = kwargs["kwargs"]
            try:
                # 매 호출마다 새 연결 — list 시점 session 이 이미 닫혔으므로 재연결 필수.
                client_cm = await cls._open_session(server, thread_id=thread_id)
                async with client_cm as (read, write):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        result = await session.call_tool(tool_name, call_args)
            except Exception as e:
                # 연결/RPC 실패를 문자열로 삼키면 LLM 이 성공으로 오인한다.
                # ToolException 으로 표면화해 status=error 로 모델에 전달 (전송 실패 false-report 방지).
                logger.warning("MCP tool call failed: %s: %s: %s", tool_name, type(e).__name__, e)
                raise ToolException(
                    f"MCP tool '{tool_name}' call failed: {type(e).__name__}: {e}"
                ) from e

            contents = result.content or []
            text = "\n".join(c.text if hasattr(c, "text") else str(c) for c in contents)
            # MCP 서버가 도구 실행 실패를 isError=true 로 반환하는 경우(예: slack-mcp-server
            # 메시지 전송 비활성/거부) 정상 출력으로 흘려보내면 LLM 이 성공으로 오인한다.
            if getattr(result, "isError", False):
                logger.warning("MCP tool returned error result: %s: %s", tool_name, text)
                raise ToolException(f"MCP tool '{tool_name}' returned an error: {text}")
            logger.debug("MCP tool ok: %s -> %s", tool_name, text[:500])
            return text

        if isinstance(input_schema, dict) and input_schema.get("properties"):
            return StructuredTool.from_function(
                coroutine=_call,
                name=sanitize_tool_name(tool_name),
                description=tool_description,
                args_schema=input_schema,
            )
        return StructuredTool.from_function(
            coroutine=_call,
            name=sanitize_tool_name(tool_name),
            description=tool_description,
        )
