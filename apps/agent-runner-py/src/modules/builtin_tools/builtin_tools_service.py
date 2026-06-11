from datetime import datetime, timezone

from langchain_core.tools import BaseTool, StructuredTool

from src.modules.builtin_tools.custom_tools.registry import get_custom_tools


def _current_time() -> str:
    return datetime.now(timezone.utc).isoformat()


# VFS 도구(ls/read_file/write_file/edit_file/glob/grep/execute) 는
# deepagents `FilesystemMiddleware` 가 `create_deep_agent()` 호출 시 자동 등록한다.
# 따라서 본 모듈에서 중복 구현하지 않는다. (이전 vfs_service 래퍼 5종 제거 — 동명 도구
# 충돌 + in-memory vs docker sandbox backend 결과 불일치 위험 회피.)
# `execute` 권한 게이트는 `deepagent_bridge` 의 `interrupt_on` 분기에서 처리한다.


def _build_all(
    agent_id: str,
    thread_id: str,
    user_id: str | None = None,
    source: str | None = None,
) -> dict[str, BaseTool]:
    tools: dict[str, BaseTool] = {
        "current_time": StructuredTool.from_function(
            func=_current_time,
            name="current_time",
            description="Returns the current UTC ISO timestamp",
        ),
    }

    for t in get_custom_tools(agent_id, user_id=user_id, source=source, thread_id=thread_id):
        tools[t.name] = t

    return tools


class BuiltinToolsService:
    @classmethod
    def get_tools(
        cls,
        names: list[str],
        agent_id: str,
        thread_id: str,
        user_id: str | None = None,
        source: str | None = None,
    ) -> list[BaseTool]:
        all_tools = _build_all(agent_id, thread_id, user_id=user_id, source=source)
        if not names:
            return []
        return [all_tools[n] for n in names if n in all_tools]
