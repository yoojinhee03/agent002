from __future__ import annotations

from langchain_core.tools import BaseTool

from src.modules.builtin_tools.custom_tools.ask_missing_info import build_ask_missing_info_tool
from src.modules.builtin_tools.custom_tools.calculate_average_daily_wage import build_calculate_average_daily_wage_tool
from src.modules.builtin_tools.custom_tools.calculate_retirement_pay import build_calculate_retirement_pay_tool
from src.modules.builtin_tools.custom_tools.calculate_service_period import build_calculate_service_period_tool
from src.modules.builtin_tools.custom_tools.generate_settlement_report import build_generate_settlement_report_tool
from src.modules.builtin_tools.custom_tools.gmail_fetch import build_gmail_fetch_tool
from src.modules.builtin_tools.custom_tools.gmail_fetch_attachment import build_gmail_fetch_attachment_tool
from src.modules.builtin_tools.custom_tools.gmail_parse_pdf_attachment import build_gmail_parse_pdf_attachment_tool
from src.modules.builtin_tools.custom_tools.gmail_search import build_gmail_search_tool
from src.modules.builtin_tools.custom_tools.gmail_send import build_gmail_send_tool
from src.modules.builtin_tools.custom_tools.skill_ops import build_skill_ops_tools


def get_custom_tools(
    agent_id: str,
    user_id: str | None = None,
    source: str | None = None,
    thread_id: str | None = None,
) -> list[BaseTool]:
    """
    agent_id 기준으로 커스텀 도구를 빌드해서 반환한다.
    Gmail 도구들은 내부적으로 agent_id를 사용하여 Gmail OAuth 토큰을 조회한다.

    source: 'studio' (admin 페이지 chat → 프로젝트 OAuth) | 'client' (client 페이지 chat
    → 사용자 OAuth) | None (기존 동작). NestJS 내부 토큰 발급 엔드포인트가 source 별로
    자격증명 소스를 분기한다.

    thread_id: 현재 실행 중인 thread 의 id. 첨부 다운로드 도구가 다운로드한 바이트를
    ThreadAttachment 로 자동 저장할 때 사용한다. None 이면 자동 저장을 건너뛴다.

    ⚠️ document_preprocess / pdf_parse 는 gmail_parse_pdf_attachment 내부 파이프라인에서만
    사용되는 내부 전용 도구다. 에이전트 툴 목록에 노출하지 않는다.
    PDF 판독이 필요하면 반드시 gmail_parse_pdf_attachment를 사용한다.
    """
    return [
        # Gmail 도구
        build_gmail_search_tool(agent_id, user_id=user_id, source=source),
        build_gmail_fetch_tool(agent_id, user_id=user_id, source=source),
        build_gmail_fetch_attachment_tool(agent_id, user_id=user_id, source=source, thread_id=thread_id),
        build_gmail_parse_pdf_attachment_tool(agent_id, user_id=user_id, source=source, thread_id=thread_id),
        build_gmail_send_tool(agent_id, user_id=user_id, source=source),
        # HR / 퇴직금 계산 도구
        build_calculate_service_period_tool(),
        build_calculate_average_daily_wage_tool(),
        build_calculate_retirement_pay_tool(),
        build_generate_settlement_report_tool(),
        build_ask_missing_info_tool(),
        # Skills CRUD 도구 (Agent Builder 로 Skill Assistant-급 어시스턴트 구성용)
        *build_skill_ops_tools(user_id),
    ]
