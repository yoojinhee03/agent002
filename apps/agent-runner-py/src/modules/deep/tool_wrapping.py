"""도구 권한 정책 강제 — auto / requires_approval / restricted / disabled — deepagent-sdk tools/permission에서 이관"""
import asyncio
from typing import Any, Awaitable, Callable

import structlog
from langchain.tools import ToolRuntime
from langchain_core.tools import BaseTool, StructuredTool
from langgraph.errors import GraphBubbleUp

logger = structlog.get_logger(__name__)


ToolPolicy = str  # 'auto' | 'requires_approval' | 'restricted' | 'disabled'


class ToolPermissionError(Exception):
    pass


class ApprovalRequired(Exception):
    def __init__(self, tool_name: str, args: dict[str, Any]):
        self.tool_name = tool_name
        self.args = args
        super().__init__(f"Tool '{tool_name}' requires human approval")


def apply_policy(
    tool: BaseTool,
    policy: ToolPolicy,
    approval_callback: Callable[[str, dict[str, Any]], Awaitable[bool]] | None = None,
) -> BaseTool:
    """
    도구에 정책을 적용하여 래핑된 도구를 반환.

    - auto: 그대로 실행
    - requires_approval: approval_callback으로 승인 받은 후 실행
    - restricted: 실행 차단 + 경고 반환
    - disabled: 즉시 ToolPermissionError
    """
    if policy == "auto":
        return tool

    if policy == "disabled":
        async def _disabled(**kwargs: Any) -> str:
            raise ToolPermissionError(f"Tool '{tool.name}' is disabled by policy")

        return StructuredTool.from_function(
            coroutine=_disabled,
            name=tool.name,
            description=f"[DISABLED] {tool.description}",
        )

    if policy == "restricted":
        async def _restricted(**kwargs: Any) -> str:
            return f"Tool '{tool.name}' is restricted and cannot be executed."

        return StructuredTool.from_function(
            coroutine=_restricted,
            name=tool.name,
            description=f"[RESTRICTED] {tool.description}",
        )

    if policy == "requires_approval":
        original_coroutine = tool.coroutine
        original_func = tool.func
        _original_injected = tool._injected_args_keys

        async def _with_approval(runtime: ToolRuntime = None, **kwargs: Any) -> str:  # type: ignore[assignment]
            if approval_callback:
                approved = await approval_callback(tool.name, kwargs)
                if not approved:
                    return f"Tool '{tool.name}' execution was denied by human review."
            else:
                raise ApprovalRequired(tool.name, kwargs)

            call_kw = {**kwargs, "runtime": runtime} if "runtime" in _original_injected else kwargs
            if original_coroutine:
                return await original_coroutine(**call_kw)
            if original_func:
                if asyncio.iscoroutinefunction(original_func):
                    return await original_func(**call_kw)
                return original_func(**kwargs)
            return "Tool executed."

        # 원본 도구의 args_schema를 보존해야 kwargs가 올바르게 전달된다
        return StructuredTool.from_function(
            coroutine=_with_approval,
            name=tool.name,
            description=f"[REQUIRES APPROVAL] {tool.description}",
            args_schema=tool.args_schema,
        )

    return tool


def wrap_tool_with_error_handler(tool: BaseTool) -> BaseTool:
    """
    도구 실행 중 발생하는 예외를 ToolMessage 콘텐츠로 변환해 그래프가 중단되지 않도록 한다.

    - GraphBubbleUp(HITL interrupt 등) 은 그대로 전파해야 deepagents HITL 이 동작한다.
    - 그 외 모든 예외는 사용자에게 보일 한국어 오류 문자열로 반환 → LLM 이 다음 턴에서 대응 가능.
    """
    original_coroutine = tool.coroutine
    original_func = tool.func
    _original_injected = tool._injected_args_keys

    # ToolRuntime 타입 어노테이션을 명시해 LangGraph ToolNode 가 runtime 을 주입하도록 한다.
    # 원본 도구가 runtime 을 필요로 할 때만 call_kw 에 포함해 전달한다.
    async def _safe_coroutine(runtime: ToolRuntime = None, **kwargs: Any) -> Any:  # type: ignore[assignment]
        try:
            call_kw = {**kwargs, "runtime": runtime} if "runtime" in _original_injected else kwargs
            if original_coroutine:
                return await original_coroutine(**call_kw)
            if original_func:
                if asyncio.iscoroutinefunction(original_func):
                    return await original_func(**call_kw)
                return original_func(**kwargs)
            return "Tool executed."
        except GraphBubbleUp:
            raise
        except Exception as e:
            err_type = type(e).__name__
            err_msg = str(e) or err_type
            logger.warning(
                "tool_execution_error_caught",
                tool_name=tool.name,
                error_type=err_type,
                error=err_msg[:500],
            )
            return f"[도구 오류] '{tool.name}' 실행 중 오류가 발생했습니다 ({err_type}): {err_msg}"

    # _injected_args_keys 는 func or coroutine 중 앞것을 기준으로 감지하므로
    # _safe_func 에도 runtime 어노테이션을 맞춰야 LangGraph 가 주입을 인식한다.
    def _safe_func(runtime: ToolRuntime = None, **kwargs: Any) -> Any:  # type: ignore[assignment]
        try:
            call_kw = {**kwargs, "runtime": runtime} if "runtime" in _original_injected else kwargs
            if original_func and not asyncio.iscoroutinefunction(original_func):
                return original_func(**call_kw)
            # sync 경로가 없으면 동기 호출은 지원하지 않음을 명시
            return f"[도구 오류] '{tool.name}' 은 동기 호출을 지원하지 않습니다."
        except GraphBubbleUp:
            raise
        except Exception as e:
            err_type = type(e).__name__
            err_msg = str(e) or err_type
            logger.warning(
                "tool_execution_error_caught_sync",
                tool_name=tool.name,
                error_type=err_type,
                error=err_msg[:500],
            )
            return f"[도구 오류] '{tool.name}' 실행 중 오류가 발생했습니다 ({err_type}): {err_msg}"

    return StructuredTool.from_function(
        func=_safe_func,
        coroutine=_safe_coroutine,
        name=tool.name,
        description=tool.description,
        args_schema=tool.args_schema,
    )


VFS_TOOL_NAMES = frozenset(
    {"ls", "read_file", "write_file", "edit_file", "glob", "grep", "execute"}
)


def filter_vfs_tools(tools: list[BaseTool]) -> list[BaseTool]:
    """공식 deepagents 내장 VFS와 이름 충돌하는 도구를 제거한다.

    deepagents `FilesystemMiddleware` 가 `create_deep_agent()` 호출 시
    7종(ls/read_file/write_file/edit_file/glob/grep/execute) 을 자동 등록하므로,
    외부에서 같은 이름의 도구를 추가로 전달하면 langchain `bind_tools` 에서 중복된다.
    `execute` 사용 제어는 `deepagent_bridge` 의 `interrupt_on` 으로 처리한다."""
    return [t for t in tools if t.name not in VFS_TOOL_NAMES]
