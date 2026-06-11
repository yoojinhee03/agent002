from __future__ import annotations

import json
from datetime import date

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool


class CalculateServicePeriodArgs(BaseModel):
    hire_date: str = Field(description="입사일 (YYYY-MM-DD)")
    resignation_date: str = Field(description="퇴사일 (YYYY-MM-DD)")


def _parse_date(s: str) -> date:
    return date.fromisoformat(s.strip())


def _calculate(hire_date: str, resignation_date: str) -> str:
    try:
        d_hire = _parse_date(hire_date)
        d_resign = _parse_date(resignation_date)
    except ValueError as e:
        return json.dumps({"ok": False, "error": {"message": f"날짜 형식 오류: {e}"}}, ensure_ascii=False)

    if d_resign <= d_hire:
        return json.dumps(
            {"ok": False, "error": {"message": "퇴사일은 입사일보다 이후여야 합니다."}},
            ensure_ascii=False,
        )

    total_days: int = (d_resign - d_hire).days
    years = total_days // 365
    months = (total_days % 365) // 30

    period_parts: list[str] = []
    if years:
        period_parts.append(f"{years}년")
    if months:
        period_parts.append(f"{months}개월")
    period_label = " ".join(period_parts) if period_parts else "1개월 미만"

    return json.dumps(
        {
            "ok": True,
            "total_days": total_days,
            "years": years,
            "months": months,
            "period_label": period_label,
        },
        ensure_ascii=False,
    )


def build_calculate_service_period_tool() -> BaseTool:
    def _tool(hire_date: str, resignation_date: str) -> str:
        return _calculate(hire_date, resignation_date)

    return build_custom_tool(
        CustomToolProperties(
            name="calculate_service_period",
            description=(
                "입사일과 퇴사일을 받아 재직일수·연수·개월수를 계산합니다. "
                "반환 필드: total_days, years, months, period_label"
            ),
            args_schema=CalculateServicePeriodArgs,
            tags=["hr", "retirement"],
        ),
        func=_tool,
    )
