from __future__ import annotations

import json

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool


class GenerateSettlementReportArgs(BaseModel):
    hire_date: str = Field(description="입사일 (YYYY-MM-DD)")
    resignation_date: str = Field(description="퇴사일 (YYYY-MM-DD)")
    total_days: int = Field(description="총 재직일수")
    years: int = Field(description="재직 연수")
    months: int = Field(description="재직 잔여 개월수")
    average_daily_wage: float = Field(description="1일 평균임금 (원)")
    retirement_pay: int = Field(description="퇴직급여·퇴직금 (원)")


def _generate(
    hire_date: str,
    resignation_date: str,
    total_days: int,
    years: int,
    months: int,
    average_daily_wage: float,
    retirement_pay: int,
) -> str:
    period_parts: list[str] = []
    if years:
        period_parts.append(f"{years}년")
    if months:
        period_parts.append(f"{months}개월")
    period_label = " ".join(period_parts) if period_parts else "1개월 미만"

    report = (
        f"재직기간: {period_label} ({total_days:,}일)\n"
        f"퇴직급여: {retirement_pay:,}원\n"
        f"퇴직금: {retirement_pay:,}원"
    )

    return json.dumps({"ok": True, "report": report}, ensure_ascii=False)


def build_generate_settlement_report_tool() -> BaseTool:
    def _tool(
        hire_date: str,
        resignation_date: str,
        total_days: int,
        years: int,
        months: int,
        average_daily_wage: float,
        retirement_pay: int,
    ) -> str:
        return _generate(
            hire_date,
            resignation_date,
            total_days,
            years,
            months,
            average_daily_wage,
            retirement_pay,
        )

    return build_custom_tool(
        CustomToolProperties(
            name="generate_settlement_report",
            description=(
                "재직기간·평균임금·퇴직금 계산 결과를 받아 사용자에게 전달할 정산 결과 리포트를 생성합니다. "
                "반환 필드: report (표시용 텍스트)"
            ),
            args_schema=GenerateSettlementReportArgs,
            tags=["hr", "retirement"],
        ),
        func=_tool,
    )
