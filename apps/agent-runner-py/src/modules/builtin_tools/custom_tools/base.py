from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field


class CustomToolProperties(BaseModel):
    name: str
    description: str = ""
    args_schema: type[BaseModel] | None = None
    return_direct: bool = False
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


def build_custom_tool(
    props: CustomToolProperties,
    *,
    func: Callable[..., str] | None = None,
    coroutine: Callable[..., Awaitable[str]] | None = None,
) -> BaseTool:
    return StructuredTool.from_function(
        func=func,
        coroutine=coroutine,
        name=props.name,
        description=props.description,
        args_schema=props.args_schema,
        return_direct=props.return_direct,
        tags=props.tags,
        metadata=props.metadata,
    )
