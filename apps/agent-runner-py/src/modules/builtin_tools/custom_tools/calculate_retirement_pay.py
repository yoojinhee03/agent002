
from __future__ import annotations

import json
import math

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool


class CalculateRetirementPayArgs(BaseModel):
    average_daily_wage: float = Field(description="1일 평균임금 (원) — calculate_average_daily_wage 결과")
    total_days: int = Field(description="총 재직일수 — calculate_service_period 결과")


def _calculate(average_daily_wage: float, total_days: int) -> str:
    if average_daily_wage <= 0:
        return json.dumps(
            {"ok": False, "error": {"message": "1일 평균임금은 0보다 커야 합니다."}},
            ensure_ascii=False,
        )
    if total_days < 365:
        return json.dumps(
            {"ok": False, "error": {"message": "재직기간이 1년 미만이면 퇴직금이 발생하지 않습니다."}},
            ensure_ascii=False,
        )

    # 퇴직금 = 1일 평균임금 × 30일 × (재직일수 / 365)
    retirement_pay = math.floor(average_daily_wage * 30 * (total_days / 365))

    return json.dumps(
        {
            "ok": True,
            "retirement_pay": retirement_pay,
            "severance_pay": retirement_pay,
        },
        ensure_ascii=False,
    )


def build_calculate_retirement_pay_tool() -> BaseTool:
    def _tool(average_daily_wage: float, total_days: int) -> str:
        return _calculate(average_daily_wage, total_days)

    return build_custom_tool(
        CustomToolProperties(
            name="calculate_retirement_pay",
            description=(
                "1일 평균임금과 총 재직일수를 받아 법정 퇴직급여·퇴직금을 산출합니다. "
                "재직 1년 미만은 퇴직금 미발생 처리. "
                "반환 필드: retirement_pay, severance_pay"
            ),
            args_schema=CalculateRetirementPayArgs,
            tags=["hr", "retirement"],
        ),
        func=_tool,
    )
