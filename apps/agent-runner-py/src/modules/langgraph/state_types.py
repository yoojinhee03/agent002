from typing import Annotated, Any
from typing_extensions import TypedDict
from langchain_core.messages import BaseMessage, AnyMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    current_agent: str | None
    plan: list[str]
    tool_results: dict[str, Any]
    human_input: Any | None
    metadata: dict[str, Any]
