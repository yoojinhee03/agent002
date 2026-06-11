from __future__ import annotations

from langchain_core.tools import BaseTool

from src.modules.builtin_tools.custom_tools.registry import get_custom_tools as _get_custom_tools


def get_custom_tools(agent_id: str) -> list[BaseTool]:
    return _get_custom_tools(agent_id)