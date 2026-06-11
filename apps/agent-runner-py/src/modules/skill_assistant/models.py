"""Skill Assistant 모듈 Pydantic 모델."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CreateSessionBody(BaseModel):
    userId: str | None = None
    model: str | None = None
    skillId: str | None = None  # 편집 모드
    mode: Literal["auto", "builder", "analyze"] = "auto"


class CreateSessionResponse(BaseModel):
    threadId: str
    targetSkillId: str | None
    model: str
    mode: str


class InvokeBody(BaseModel):
    message: str
    userCredentials: dict[str, str] | None = None
    userId: str | None = None
    mode: Literal["auto", "builder", "analyze"] | None = None  # 턴별 override


class SkillFileDesign(BaseModel):
    path: str
    content: str


class SkillCreateDesign(BaseModel):
    name: str = Field(..., description="스킬 이름. snake/kebab/camel 모두 허용.")
    description: str
    instructions: str = Field(..., description="실행 단계를 markdown 으로 적은 사용자 인스트럭션.")
    allowed_tools: list[str] = Field(
        default_factory=list,
        description="이 스킬이 사용할 도구 이름 목록(builtin tool 이름 또는 MCP tool 이름).",
    )
    files: list[SkillFileDesign] = Field(default_factory=list)


class SkillEditDesign(BaseModel):
    name: str | None = None
    description: str | None = None
    instructions: str | None = None
    allowed_tools: list[str] | None = None
    add_files: list[SkillFileDesign] = Field(default_factory=list)
    remove_file_paths: list[str] = Field(default_factory=list)
    change_summary: str | None = None


class ToolFitItem(BaseModel):
    name: str
    fit: Literal["good", "unclear", "missing"]
    reason: str


class AnalysisSuggestion(BaseModel):
    title: str
    detail: str
    severity: Literal["low", "med", "high"]
    edit_hint: SkillEditDesign | None = None  # builder 로 자연 전환


class SkillAnalysisDesign(BaseModel):
    target_skill_id: str | None = None
    overview: str
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    tool_fit: list[ToolFitItem] = Field(default_factory=list)
    missing_steps: list[str] = Field(default_factory=list)
    suggestions: list[AnalysisSuggestion] = Field(default_factory=list)
    overall_score: int = Field(ge=0, le=100)


class ChoiceItem(BaseModel):
    """후속 빠른 선택 버튼 항목.

    LLM 응답 본문에 "1) X, 2) Y" 같은 선택지를 평문으로 나열할 때 함께 채워서
    프론트가 클릭 가능한 버튼으로 렌더한다. 클릭 시 value 가 다음 턴 user
    메시지로 그대로 전송된다.
    """

    label: str = Field(..., description="버튼 라벨. 한국어 1줄, ~40자 권장.")
    value: str = Field(
        ...,
        description="클릭 시 user 메시지로 전송할 자연어 완결문.",
    )


class AssistantResponse(BaseModel):
    """Skill Assistant 의 단일 LLM 호출 응답.

    `action` 으로 5가지 분기:
      - clarify: 더 구체적인 정보 요청
      - create_skill: 새 스킬 제안
      - edit_skill: 기존 스킬 부분 수정 patch (skillId 컨텍스트 있을 때만)
      - answer_directly: 도움말/일반 답변
      - analyze_skill: 스킬 분석 결과 카드 (analyze 모드 또는 auto 모드 analyze 의도)
    """

    action: Literal["create_skill", "edit_skill", "clarify", "answer_directly", "analyze_skill"] = Field(
        description=(
            "사용자 의도 분류. 시나리오 모호 → clarify. 새 스킬 만들기 → create_skill. "
            "기존 스킬 수정 → edit_skill. 도움말/일반 질문 → answer_directly. "
            "스킬 분석/평가/비교 요청 → analyze_skill."
        ),
    )
    new_skill: SkillCreateDesign | None = None
    edit_changes: SkillEditDesign | None = None
    clarification_question: str | None = None
    direct_answer: str | None = None
    summary: str | None = None
    analysis: SkillAnalysisDesign | None = None
    choices: list[ChoiceItem] = Field(
        default_factory=list,
        description=(
            "후속 빠른 선택 버튼 목록. 답변 본문에 둘 이상의 선택지를 평문으로 "
            "나열하면 같은 항목을 1:1 로 채워라. 선택지가 1개 이하이거나 자유 "
            "서술 답변이면 빈 배열로 둔다. 모든 action 에서 사용 가능."
        ),
    )
