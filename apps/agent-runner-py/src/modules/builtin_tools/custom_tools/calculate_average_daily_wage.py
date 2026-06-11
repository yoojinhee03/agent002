from __future__ import annotations

import json

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool


class CalculateAverageDailyWageArgs(BaseModel):
    monthly_avg_wage: float = Field(description="월 평균임금 — 재직기간 임금총액/12 (원)")
    annual_bonus: float = Field(default=0.0, description="연간 상여금 총액 (원, 없으면 0)")


def _calculate(monthly_avg_wage: float, annual_bonus: float) -> str:
    if monthly_avg_wage <= 0:
        return json.dumps(
            {"ok": False, "error": {"message": "월 평균임금은 0보다 커야 합니다."}},
            ensure_ascii=False,
        )

    # 근로자퇴직급여보장법 기준: 최근 3개월 임금 합산 / 해당 기간 일수(90일)
    three_month_wage = monthly_avg_wage * 3
    three_month_bonus = (annual_bonus / 12) * 3
    average_daily_wage = (three_month_wage + three_month_bonus) / 90

    return json.dumps(
        {
            "ok": True,
            "average_daily_wage": round(average_daily_wage),
        },
        ensure_ascii=False,
    )


def build_calculate_average_daily_wage_tool() -> BaseTool:
    def _tool(monthly_avg_wage: float, annual_bonus: float = 0.0) -> str:
        return _calculate(monthly_avg_wage, annual_bonus)

    return build_custom_tool(
        CustomToolProperties(
            name="calculate_average_daily_wage",
            description=(
                "월 평균임금과 연간 상여금을 받아 근로자퇴직급여보장법 기준 1일 평균임금을 산정합니다. "
                "3개월 임금 합산(상여금 배분 포함)을 90일로 나눕니다. "
                "반환 필드: average_daily_wage"
            ),
            args_schema=CalculateAverageDailyWageArgs,
            tags=["hr", "retirement"],
        ),
        func=_tool,
    )
