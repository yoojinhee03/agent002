from __future__ import annotations

import json

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool


class AskMissingInfoArgs(BaseModel):
    missing_fields: list[str] = Field(
        description="누락된 항목명 리스트",
        min_length=1,
    )


def _build_question(missing_fields: list[str]) -> str:
    if len(missing_fields) == 1:
        items_str = f"**{missing_fields[0]}**"
    else:
        items_str = ", ".join(f"**{f}**" for f in missing_fields[:-1]) + f" 및 **{missing_fields[-1]}**"

    return f"다음 정보가 필요합니다. {items_str}을(를) 알려주세요."


def build_ask_missing_info_tool() -> BaseTool:
    def _tool(missing_fields: list[str]) -> str:
        if not missing_fields:
            return json.dumps(
                {"ok": False, "error": {"message": "missing_fields가 비어 있습니다."}},
                ensure_ascii=False,
            )
        question_message = _build_question(missing_fields)
        return json.dumps({"ok": True, "question_message": question_message}, ensure_ascii=False)

    return build_custom_tool(
        CustomToolProperties(
            name="ask_missing_info",
            description=(
                "누락된 정보 항목 목록을 받아 사용자에게 질문할 메시지를 생성합니다. "
                "반환 필드: question_message"
            ),
            args_schema=AskMissingInfoArgs,
            tags=["hr"],
        ),
        func=_tool,
    )
