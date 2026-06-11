"""deep/tool_wrapping.py 단위 테스트"""
import pytest
from unittest.mock import AsyncMock, MagicMock

from langchain_core.tools import StructuredTool

from src.modules.deep.tool_wrapping import (
    ApprovalRequired,
    ToolPermissionError,
    apply_policy,
    filter_vfs_tools,
)


def _make_tool(name: str = "test_tool") -> StructuredTool:
    async def _run(query: str) -> str:
        return f"result:{query}"

    return StructuredTool.from_function(
        coroutine=_run,
        name=name,
        description="A test tool",
    )


class TestApplyPolicy:
    @pytest.mark.asyncio
    async def test_auto_runs_normally(self):
        tool = _make_tool()
        wrapped = apply_policy(tool, "auto")
        result = await wrapped.arun({"query": "hello"})
        assert result == "result:hello"

    @pytest.mark.asyncio
    async def test_disabled_raises_permission_error(self):
        tool = _make_tool()
        wrapped = apply_policy(tool, "disabled")
        with pytest.raises(ToolPermissionError):
            await wrapped.arun({"query": "hello"})

    @pytest.mark.asyncio
    async def test_restricted_returns_message(self):
        tool = _make_tool()
        wrapped = apply_policy(tool, "restricted")
        result = await wrapped.arun({"query": "hello"})
        assert "restricted" in result.lower()

    @pytest.mark.asyncio
    async def test_requires_approval_raises_without_callback(self):
        tool = _make_tool()
        wrapped = apply_policy(tool, "requires_approval", approval_callback=None)
        with pytest.raises(ApprovalRequired) as exc_info:
            await wrapped.arun({"query": "hello"})
        assert exc_info.value.tool_name == "test_tool"

    @pytest.mark.asyncio
    async def test_requires_approval_runs_when_approved(self):
        tool = _make_tool()
        callback = AsyncMock(return_value=True)
        wrapped = apply_policy(tool, "requires_approval", approval_callback=callback)
        result = await wrapped.arun({"query": "hello"})
        assert result == "result:hello"
        callback.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_requires_approval_denied_by_callback(self):
        tool = _make_tool()
        callback = AsyncMock(return_value=False)
        wrapped = apply_policy(tool, "requires_approval", approval_callback=callback)
        result = await wrapped.arun({"query": "hello"})
        assert "denied" in result.lower()

    def test_unknown_policy_returns_original_tool(self):
        tool = _make_tool()
        wrapped = apply_policy(tool, "unknown_policy")
        assert wrapped is tool


class TestFilterVfsTools:
    def test_removes_vfs_tools(self):
        tools = [
            _make_tool("ls"),
            _make_tool("read_file"),
            _make_tool("write_file"),
            _make_tool("grep"),
            _make_tool("my_custom_tool"),
        ]
        filtered = filter_vfs_tools(tools)
        names = [t.name for t in filtered]
        assert names == ["my_custom_tool"]

    def test_keeps_non_vfs_tools(self):
        tools = [_make_tool("search"), _make_tool("calculator")]
        filtered = filter_vfs_tools(tools)
        assert len(filtered) == 2

    def test_empty_list(self):
        assert filter_vfs_tools([]) == []
