from __future__ import annotations

import json
from datetime import date
from typing import Any

import httpx
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool


# ──────────────────────────────────────────────
# Args Schema
# ──────────────────────────────────────────────

class PdfParseArgs(BaseModel):
    pages: list[dict[str, Any]] | None = Field(
        default=None,
        description=(
            "Page image list from document_preprocess tool. "
            "Each item must have: page(int), image_base64(str), mime_type(str)."
        ),
    )
    file_data_base64: str | None = Field(
        default=None,
        description="If pages is not provided, base64 encoded PDF file data for internal preprocessing.",
    )
    password: str | None = Field(default=None, description="PDF password (if encrypted)")
    dpi: int = Field(default=150, ge=72, le=300)
    filename: str = Field(default="", description="Original filename — used as a hint for doc_type identification")
    candidate_name: str = Field(default="", description="Applicant name for cross-reference checks")


# ──────────────────────────────────────────────
# 서류 종류 식별 (파일명 키워드 매칭)
# ──────────────────────────────────────────────

async def _fetch_identify_keywords(agent_id: str) -> list[dict[str, Any]]:
    from src.config import settings

    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(
            f"{settings.MANAGEMENT_API_URL}/api/internal/agents/{agent_id}/pdf-parse-rules",
            headers={"X-API-Key": settings.INTERNAL_SERVICE_KEY},
        )
        res.raise_for_status()
        data = res.json() or []
        return [
            {"docType": d.get("docType", ""), "identifyKeywords": d.get("identifyKeywords", [])}
            for d in data
        ]


def _identify_doc_type(filename: str, keyword_configs: list[dict[str, Any]]) -> str:
    """파일명 키워드 매칭으로 서류 종류를 반환. 미식별 시 'unknown' 반환."""
    name_lower = filename.lower()
    for config in keyword_configs:
        for kw in (config.get("identifyKeywords") or []):
            if kw.lower() in name_lower:
                return config.get("docType", "unknown")
    return "unknown"


# ──────────────────────────────────────────────
# 추출 전용 Vision 프롬프트
# ──────────────────────────────────────────────

def _build_extract_prompt(doc_type: str, candidate_name: str) -> str:
    today_str = date.today().isoformat()
    candidate_hint = f"\n지원자 이름: {candidate_name}" if candidate_name else ""

    extract_specs: dict[str, str] = {
        "주민등록등본": """
- issue_date: 발급일 (YYYY-MM-DD)
- masking_status: 주민번호 뒷자리 마스킹 상태 ("전체_마스킹" | "일부_마스킹" | "미마스킹" | "확인불가")
- masking_detail: 마스킹 상태에 대한 구체적 설명 (예: "본인 마스킹, 배우자 미마스킹")
- owner_name: 세대주 이름
""",
        "주민등록초본": """
- issue_date: 발급일 (YYYY-MM-DD)
- masking_status: 주민번호 뒷자리 마스킹 상태 ("전체_마스킹" | "일부_마스킹" | "미마스킹" | "확인불가")
- has_military_record: 병역 사항 포함 여부 (true | false)
- military_detail: 병역 내용 요약 (없으면 null)
- owner_name: 본인 이름
""",
        "건강보험자격득실확인서": """
- records: 자격 득실 이력 배열. 각 항목:
    - company_name: 사업장명
    - acquire_date: 자격 취득일 (YYYY-MM-DD)
    - lose_date: 자격 상실일 (YYYY-MM-DD, 현재 재직 중이면 null)
    - insurance_type: 가입 종류 (예: "직장가입자")
- owner_name: 가입자 이름
""",
        "원천징수영수증": """
- year: 귀속 연도 (YYYY)
- company_name: 발급 회사(고용주)명
- total_salary: 총급여액 (숫자, 없으면 null)
- owner_name: 근로자 이름
""",
        "최종학력증명서": """
- issue_date: 발급일 (YYYY-MM-DD)
- school_name: 학교명
- major: 전공(학과)명
- degree: 학위 종류 (예: "학사", "석사")
- graduation_status: 졸업 여부 ("졸업" | "재학" | "수료" | "중퇴")
- owner_name: 증명서 상 이름
""",
        "통장사본": """
- bank_name: 은행명
- account_number: 계좌번호 (마스킹된 경우 마스킹된 형태 그대로)
- owner_name: 예금주 이름
""",
        "차량등록증": """
- owner_name: 소유자 이름
- vehicle_number: 차량 번호
- vehicle_model: 차종 (없으면 null)
""",
        "자격증": """
- certificate_name: 자격증명
- issuer: 발급 기관명
- issue_date: 취득일 (YYYY-MM-DD, 없으면 null)
- owner_name: 취득자 이름
""",
        "이력서": """
- name: 지원자 이름
- careers: 경력 배열. 각 항목:
    - company_name: 회사명
    - start_date: 입사일 (YYYY-MM 또는 YYYY-MM-DD)
    - end_date: 퇴사일 (YYYY-MM 또는 YYYY-MM-DD, 재직 중이면 null)
    - position: 직책/직무
- educations: 학력 배열. 각 항목:
    - school_name: 학교명
    - major: 전공
    - start_date: 입학일
    - end_date: 졸업일 또는 예정일
    - status: "졸업" | "재학" | "중퇴"
- certificates: 자격증 배열 (자격증명 문자열 리스트)
""",
    }

    spec = extract_specs.get(doc_type, """
- raw_text: 문서에서 읽을 수 있는 주요 텍스트 내용 요약
- detected_fields: 발견된 주요 정보 항목들 (키-값 쌍 배열)
""")

    return f"""이 이미지는 '{doc_type}' 서류입니다.{candidate_hint}
오늘 날짜: {today_str}

[지시사항]
아래 항목들을 이미지에서 사실 그대로 추출하세요.
합격/불합격 판정은 절대 하지 마세요. 오직 "보이는 사실"만 추출합니다.
확인이 불가능한 항목은 null로 표기하고, 이유를 note 필드에 기재하세요.
반드시 JSON 형식으로만 응답하세요. 마크다운 없이 순수 JSON만 반환하세요.

[추출 항목]
{spec}

[응답 형식]
{{
  "doc_type": "{doc_type}",
  "today": "{today_str}",
  "extracted": {{
    추출 항목들...
  }},
  "notes": "추출 중 특이사항 (없으면 null)"
}}"""


# ──────────────────────────────────────────────
# Vision LLM 호출
# ──────────────────────────────────────────────

async def _call_vision_llm(
    image_base64: str,
    mime_type: str,
    prompt: str,
) -> dict[str, Any]:
    from src.config import settings

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{settings.MANAGEMENT_API_URL}/api/internal/vision/analyze",
            headers={
                "X-API-Key": settings.INTERNAL_SERVICE_KEY,
                "Content-Type": "application/json",
            },
            json={"image_base64": image_base64, "mime_type": mime_type, "prompt": prompt},
        )
        res.raise_for_status()
        return res.json()


# ──────────────────────────────────────────────
# 핵심 로직 — 추출만 수행, 판정 없음
# ──────────────────────────────────────────────

async def _pdf_parse(
    pages: list[dict[str, Any]] | None = None,
    file_data_base64: str | None = None,
    password: str | None = None,
    dpi: int = 150,
    filename: str = "",
    candidate_name: str = "",
    agent_id: str = "",
) -> str:
    resolved_pages: list[dict[str, Any]] | None = pages
    if not resolved_pages:
        # file_data_base64가 비어있으면 즉시 에러 반환
        if not file_data_base64 or not file_data_base64.strip():
            return json.dumps(
                {
                    "ok": False,
                    "error": {
                        "message": "This tool is for internal pipeline use only. "
                                   "To parse a Gmail PDF attachment, use gmail_parse_pdf_attachment instead. "
                                   "Direct calls without file data are not supported.",
                    },
                },
                ensure_ascii=False,
            )

        from src.modules.builtin_tools.custom_tools.document_preprocess import _document_preprocess

        preprocess_raw = await _document_preprocess(
            file_data_base64=file_data_base64,
            filename=filename or "document.pdf",
            password=password,
            dpi=dpi,
        )
        try:
            preprocess = json.loads(preprocess_raw)
        except Exception:
            preprocess = {"ok": False, "error": {"message": "invalid_json"}}

        if not isinstance(preprocess, dict) or not preprocess.get("ok"):
            return json.dumps(
                {
                    "ok": False,
                    "stage": "document_preprocess",
                    "error": (preprocess.get("error") if isinstance(preprocess, dict) else None)
                    or {"message": "unknown"},
                    "filename": filename,
                },
                ensure_ascii=False,
            )

        pages_any = preprocess.get("pages")
        if not isinstance(pages_any, list) or not pages_any:
            return json.dumps(
                {
                    "ok": False,
                    "stage": "document_preprocess",
                    "error": {"message": "pages_missing"},
                    "filename": filename,
                },
                ensure_ascii=False,
            )
        resolved_pages = pages_any

    # 1. 서류 종류 식별 (파일명 키워드 매칭)
    try:
        keyword_configs = await _fetch_identify_keywords(agent_id)
    except Exception:
        keyword_configs = []

    doc_type = _identify_doc_type(filename, keyword_configs)

    # 2. 첫 페이지로 Vision LLM 추출 호출
    first_page = resolved_pages[0]
    image_base64 = first_page.get("image_base64", "")
    mime_type = first_page.get("mime_type", "image/jpeg")
    prompt = _build_extract_prompt(doc_type, candidate_name)

    try:
        vision_response = await _call_vision_llm(image_base64, mime_type, prompt)
    except httpx.HTTPStatusError as e:
        return json.dumps(
            {"ok": False, "error": {"status_code": e.response.status_code, "message": e.response.text}},
            ensure_ascii=False,
        )
    except Exception as e:
        return json.dumps({"ok": False, "error": {"message": f"Vision LLM call failed: {e}"}}, ensure_ascii=False)

    # 3. LLM 응답 파싱
    raw_text: str = vision_response.get("content", "")
    try:
        clean = raw_text.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        extracted_result: dict[str, Any] = json.loads(clean.strip())
    except Exception:
        return json.dumps(
            {"ok": False, "error": {"message": "Failed to parse Vision LLM response", "raw": raw_text}},
            ensure_ascii=False,
        )

    # 4. 반환
    return json.dumps(
        {
            "ok": True,
            "filename": filename,
            "doc_type": doc_type,
            "identified": doc_type != "unknown",
            "today": date.today().isoformat(),
            "extracted": extracted_result.get("extracted", {}),
            "notes": extracted_result.get("notes"),
        },
        ensure_ascii=False,
    )


# ──────────────────────────────────────────────
# 도구 빌더 (내부 파이프라인 전용 — registry에 등록하지 않음)
# ──────────────────────────────────────────────

def build_pdf_parse_tool(agent_id: str) -> BaseTool:
    async def _pdf_parse_with_agent_id(**kwargs: Any) -> str:
        return await _pdf_parse(agent_id=agent_id, **kwargs)

    return build_custom_tool(
        CustomToolProperties(
            name="pdf_parse",
            description=(
                "⚠️ INTERNAL PIPELINE TOOL — Do NOT call this directly. "
                "This tool is only called internally by gmail_parse_pdf_attachment. "
                "To read a Gmail PDF attachment, use gmail_parse_pdf_attachment instead."
            ),
            args_schema=PdfParseArgs,
            tags=["document", "pdf", "vision", "internal"],
        ),
        coroutine=_pdf_parse_with_agent_id,
    )
