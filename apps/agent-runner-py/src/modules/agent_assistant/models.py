"""Agent Assistant 모듈 Pydantic / TypedDict 모델."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class CreateSessionBody(BaseModel):
    projectId: str
    agentId: str
    userId: str | None = None
    model: str | None = Field(
        default=None,
        description="ProviderSlug:ModelId 형식 또는 modelId. None 이면 기본값 사용.",
    )


class InvokeBody(BaseModel):
    message: str
    userCredentials: dict[str, str] | None = None
    userId: str | None = None


class CreateSessionResponse(BaseModel):
    threadId: str
    targetAgentId: str
    model: str


class ProposedMainAgentArgs(BaseModel):
    agent_name: str = Field(description="Main agent 표시 이름")
    model_name: str = Field(description="대상 LLM 모델 id (카탈로그의 정확한 id, 예: gpt-5.4)")
    system_prompt: str = Field(description="Main agent 시스템 프롬프트")
    architecture: str = Field(
        default="react",
        description="react | plan_execute | tool_calling | custom_graph",
    )
    is_supervisor: bool = Field(default=False, description="sub agent를 위임하는 supervisor 여부")
    builtin_tool_ids: list[str] = Field(
        default_factory=list,
        description="활성화할 builtin 도구 id 목록 — list_available_tools 의 builtin[].id 정확히 사용",
    )
    db_tool_ids: list[str] = Field(
        default_factory=list,
        description="활성화할 HTTP/Code DB 도구 id 목록 — list_available_tools 의 tools[].id",
    )
    mcp_server_ids: list[str] = Field(
        default_factory=list,
        description="활성화할 MCP 서버 id 목록 — list_available_tools 의 mcp[].id",
    )
    skill_ids: list[str] = Field(
        default_factory=list,
        description="활성화할 skill id 목록 — list_available_tools 의 skills[].id",
    )


class ProposedSubAgentArgs(BaseModel):
    agent_name: str = Field(description="Sub agent 표시 이름")
    role: str = Field(description="search | analyze | generate | validate | tool")
    model_name: str = Field(description="대상 LLM 모델 표시명")
    system_prompt: str = Field(description="Sub agent 시스템 프롬프트")
    tool_ids: list[str] = Field(default_factory=list, description="Sub agent가 사용할 tool id 목록")
    tool_names: list[str] = Field(
        default_factory=list, description="Sub agent가 사용할 도구 이름(표시용) 목록"
    )


# Pending state per-thread — assistant_service 내부에서만 사용
class PendingState(BaseModel):
    main_node: dict[str, Any] | None = None
    sub_nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    # 사용자가 본 thread 에 보낸 메시지 수. 0=첫 시나리오, 1+=명확화 답변 이후.
    # propose 가 한 번이라도 실행되면 main_node/sub_nodes 가 채워지므로, prefix 분기에
    # turn_count + propose 여부 두 신호를 함께 사용한다.
    user_turn_count: int = 0
    # 다중 턴 명확화 누적 메시지 (user/assistant). LLM 에 매 턴 전체 history 를 넘기기 위한 저장소.
    chat_history: list[dict[str, str]] = Field(default_factory=list)


# ─── structured output 기반 단일 LLM 호출용 Pydantic schema ────────────────────
# Agent Assistant 의 핵심 LLM 응답 구조. deepagents tool calling 대신
# `model.with_structured_output(AgentDesign)` 으로 한 번에 모든 필드를 받는다.


class SkillDesign(BaseModel):
    """카탈로그에 없는 skill 을 어시스턴트가 즉석 생성할 때 사용하는 설계.

    동반 생성 위치:
      - MainAgentDesign / SubAgentDesign 의 `new_skills` — agent 생성과 동반.
      - AgentEditPatch 의 `new_skills` — 기존 agent 편집과 동반 (sub-agent 추가 등).
      - AssistantResponse 의 `new_skill` — action='create_skill' 단독 생성.

    생성된 skill 의 id 는 자동으로 해당 agent/sub-agent 의 skillIds 에 append 된다.
    """

    name: str = Field(
        description=(
            "kebab-case 영문 식별자. 예: 'plain-language-writer', 'changelog-writer'. "
            "공백·한글 금지. 최대 100자."
        ),
    )
    description: str = Field(
        description=(
            "한국어 1~3문장. 반드시 다음 2요소 포함: "
            "(1) 무엇을 하는 skill 인지, "
            "(2) '트리거 조건: 사용자가 ~ 등의 키워드를 언급할 때' 형태로 명확한 트리거. "
            "선택적으로 'SKIP: ~' 라인을 덧붙여 잘못 매칭 방지."
        ),
    )
    instructions: str = Field(
        description=(
            "한국어 Markdown. 출력 구조(섹션 헤더) + 작성 규칙(번호 매김) 두 부분 포함. "
            "기존 skill 들의 instructions 와 같은 톤·구조 (## 출력 구조 / ## 작성 규칙)."
        ),
    )


class ToolPolicyEntry(BaseModel):
    """도구 1개의 실행 정책. (OpenAI strict structured output 은 자유 dict 를 못 받으므로
    '도구이름→정책' 매핑 대신 항목 배열로 표현한다.)"""

    tool_name: str = Field(
        description=(
            "정책을 적용할 도구의 키. [현재 도구 상세] 에 표시된 도구 이름, 또는 '(정책 키: XXX)' "
            "가 있으면 그 XXX 를 그대로 사용한다. MCP 도구는 카탈로그의 tool 이름(예: "
            "conversations_add_message), builtin/DB 는 카탈로그 id 를 그대로 쓴다."
        ),
    )
    policy: Literal["auto", "requires_approval", "restricted", "disabled"] = Field(
        description="실행 정책. HITL(사람 승인 대기)은 'requires_approval'. 기본은 'auto'.",
    )


class MainAgentDesign(BaseModel):
    """Main agent 의 완전한 설계."""

    agent_name: str = Field(description="사용자 시나리오 키워드를 포함한 짧은 한국어 이름")
    architecture: str = Field(
        default="react",
        description="react | plan_execute | tool_calling | custom_graph 중 하나",
    )
    model_id: str = Field(description="카탈로그의 정확한 model id. 미지정 시 세션 메타 에이전트 모델 그대로 사용 가능.")
    system_prompt: str = Field(
        description=(
            "한국어 4~10줄. 첫 줄 '당신은 ~ 에이전트입니다.' 형식. "
            "역할/입력 처리/도구 사용 흐름/출력 형식/제약 명시. "
            "도구 id 가 있으면 system_prompt 안에도 사용 흐름을 명시."
        ),
    )
    builtin_tool_ids: list[str] = Field(
        default_factory=list,
        description="활성화할 builtin 도구 id 목록. 카탈로그의 정확한 id (예: gmail_search, current_time)",
    )
    db_tool_ids: list[str] = Field(
        default_factory=list,
        description="활성화할 HTTP/Code DB 도구 id 목록",
    )
    mcp_server_ids: list[str] = Field(
        default_factory=list,
        description="활성화할 MCP 서버 id 목록",
    )
    skill_ids: list[str] = Field(
        default_factory=list,
        description="활성화할 skill id 목록",
    )
    new_skills: list[SkillDesign] = Field(
        default_factory=list,
        description=(
            "기존 카탈로그에 적합한 skill 이 없을 때만 채운다. 백엔드가 이 SkillDesign 들을 "
            "DB 에 새로 생성하고 그 id 를 자동으로 skill_ids 에 append 한다. 기존 skill 이 "
            "충분히 일치하면 절대 채우지 말고 skill_ids 만 사용."
        ),
    )
    is_supervisor: bool = Field(default=False, description="sub agent 를 위임하는 supervisor 여부")
    tool_permissions: list[ToolPolicyEntry] = Field(
        default_factory=list,
        description=(
            "이 agent 도구의 실행 정책. 사용자가 특정 도구 실행 전 사람 승인(HITL)·확인을 "
            "원하면 해당 도구를 'requires_approval' 로 채운다. 비우면 모두 'auto'. "
            "위에서 선택한 builtin/db/mcp 도구 중 해당하는 것만 포함한다."
        ),
    )


class SubAgentDesign(BaseModel):
    """Sub agent 설계 (필요한 만큼)."""

    agent_name: str = Field(description="sub agent 의 짧은 한국어 이름")
    role: str = Field(description="search | analyze | generate | validate | tool 중 하나")
    model_id: str = Field(description="카탈로그의 정확한 model id")
    description: str = Field(
        default="",
        description=(
            "메인 에이전트가 이 sub-agent 를 라우팅(위임)할지 판단하는 데 쓰는 한국어 1~2문장. "
            "'무엇을 하는지' + '언제 호출해야 하는지(사용 시점)' 를 명확히 적는다. 30자 이상 권장. "
            "예: '웹 검색으로 최신 정보·출처를 수집하는 에이전트. 외부 자료·근거가 필요할 때 호출.'"
        ),
    )
    system_prompt: str = Field(description="한국어 sub agent 시스템 프롬프트")
    builtin_tool_ids: list[str] = Field(default_factory=list)
    db_tool_ids: list[str] = Field(default_factory=list)
    mcp_server_ids: list[str] = Field(default_factory=list)
    skill_ids: list[str] = Field(
        default_factory=list,
        description="활성화할 skill id 목록 — 카탈로그의 정확한 id. 빈 배열이면 skill 없음.",
    )
    new_skills: list[SkillDesign] = Field(
        default_factory=list,
        description=(
            "기존 카탈로그에 적합한 skill 이 없을 때만 채운다. 백엔드가 이 SkillDesign 들을 "
            "DB 에 새로 생성하고 그 id 를 자동으로 skill_ids 에 append 한다. 기존 skill 이 "
            "충분히 일치하면 절대 채우지 말고 skill_ids 만 사용."
        ),
    )
    tool_permissions: list[ToolPolicyEntry] = Field(
        default_factory=list,
        description=(
            "이 sub-agent 도구의 실행 정책. 사용자가 특정 도구(예: Slack 전송) 실행 전 "
            "사람 승인(HITL)·확인을 원하면 해당 도구를 'requires_approval' 로 채운다. "
            "비우면 모두 'auto'. 이 sub-agent 가 쓰는 도구 중 해당하는 것만 포함한다."
        ),
    )


class SubAgentPermissionPatch(BaseModel):
    """기존 sub-agent 의 도구 실행 정책(toolPermissions) 부분 수정.

    예: "Slack 으로 보낼 때 확인받게" → Slack sub-agent 의 전송류 도구를 requires_approval 로.
    프런트가 target_name 으로 캔버스의 기존 sub-agent 노드를 찾아 toolPermissions 를 merge 한다.
    """

    target_name: str = Field(
        description="수정할 기존 sub-agent 의 정확한 표시 이름(agentName). 캔버스/스냅샷에 있는 이름 그대로.",
    )
    tool_permissions: list[ToolPolicyEntry] = Field(
        description=(
            "변경할 도구만 담은 정책 항목 배열(나머지 도구는 기존 값 유지). "
            "각 항목의 tool_name 은 [현재 서브에이전트 도구 상세] 에 나열된 정확한 키여야 한다."
        ),
    )


class AgentEditPatch(BaseModel):
    """기존 agent 의 부분 수정 (partial update). None 인 필드는 변경 없음."""

    agent_name: str | None = Field(default=None, description="새 이름 (변경 시)")
    architecture: str | None = Field(
        default=None,
        description="react | plan_execute | tool_calling | custom_graph 중 하나 (변경 시)",
    )
    model_id: str | None = Field(default=None, description="카탈로그의 모델 id (변경 시)")
    system_prompt: str | None = Field(
        default=None,
        description=(
            "새 system_prompt 전체. 일부만 추가/수정하려면 기존 프롬프트를 먼저 받아서 "
            "최종본 전체를 작성해 넣어라. None 이면 변경 없음."
        ),
    )
    builtin_tool_ids: list[str] | None = Field(
        default=None,
        description="새 builtin 도구 id 전체 목록. None 이면 변경 없음. []는 모두 제거.",
    )
    db_tool_ids: list[str] | None = Field(default=None)
    mcp_server_ids: list[str] | None = Field(default=None)
    skill_ids: list[str] | None = Field(default=None)
    new_skills: list[SkillDesign] | None = Field(
        default=None,
        description=(
            "main agent 자신에게 부착할 새 skill 들 (카탈로그 매칭 실패 시). "
            "백엔드가 DB 생성 후 그 id 들을 skillIds 에 append. None 이면 새 skill 생성 없음."
        ),
    )
    add_sub_agents: list[SubAgentDesign] | None = Field(
        default=None,
        description=(
            "기존 agent 에 새 sub-agent 를 **추가**할 때 사용. "
            "예: '웹 검색 후 writer 로 답변하도록 추가해줘' → writer SubAgentDesign 1개를 넣는다. "
            "main 의 systemPrompt 변경(체인 안내)이 필요하면 system_prompt 도 함께 채운다. "
            "None 또는 [] 이면 sub-agent 추가 없음."
        ),
    )
    tool_permissions: list[ToolPolicyEntry] | None = Field(
        default=None,
        description=(
            "main agent 자신의 도구 실행 정책 부분 수정. 변경할 도구만 담은 정책 항목 배열. "
            "나머지 도구는 기존 값이 유지된다. HITL(승인 대기)은 policy='requires_approval'. "
            "None 이면 변경 없음. (Slack 등 도구가 sub-agent 에 있으면 이 필드가 아니라 "
            "sub_agent_permissions 를 사용한다.)"
        ),
    )
    sub_agent_permissions: list[SubAgentPermissionPatch] | None = Field(
        default=None,
        description=(
            "기존 sub-agent 들의 도구 실행 정책 수정. [현재 서브에이전트 도구 상세] 에 나열된 "
            "sub-agent 이름·도구 이름만 사용한다. None 또는 [] 이면 변경 없음. "
            "기존 sub-agent 에 HITL 을 거는 가장 일반적인 통로다."
        ),
    )
    change_summary: str | None = Field(
        default=None,
        description="사용자에게 보여줄 1~2줄 한국어 요약 (어떤 필드를 어떻게 바꿨는지).",
    )


class AssistantResponse(BaseModel):
    """Agent Assistant 의 단일 LLM 호출 응답.

    `action` 으로 5가지 분기 — clarify (질문) / create_agent (새 agent 제안) /
    edit_agent (기존 agent 부분 수정 제안) / answer_directly (Assistant 가 평문 답변) /
    create_skill (사용자가 명시적으로 단독 skill 만들기 요청 — agent 변경 없이 skill 만 신설).

    각 action 에서 필수로 채워야 할 필드:
      - clarify          → clarification_question
      - create_agent     → main_agent_design (+ sub_agents 선택, summary 권장)
      - edit_agent       → edit_changes (+ summary 권장)
      - answer_directly  → direct_answer
      - create_skill     → new_skill (+ summary 권장)
    """

    action: Literal[
        "clarify", "create_agent", "edit_agent", "answer_directly", "create_skill"
    ] = Field(
        description=(
            "사용자 의도 분류. 시나리오 모호 → clarify. 새 agent 만들기 → create_agent. "
            "기존 agent 의 프롬프트·도구·skill·모델·도구 실행 정책(권한/HITL) 변경 → edit_agent. "
            "agent 기능 설명 / 메타 질문 / 일반 안내 → answer_directly. "
            "단독 skill 만들기 (agent 변경 없음) → create_skill."
        ),
    )
    clarification_question: str | None = Field(
        default=None,
        description="action=clarify 일 때 한국어 질문 1~2개. 짧고 구체적.",
    )
    summary: str | None = Field(
        default=None,
        description=(
            "action=create_agent / edit_agent 일 때 1~2줄 한국어 요약. "
            "사용자가 [적용] 카드에서 결정한다는 안내 포함."
        ),
    )
    main_agent_design: MainAgentDesign | None = Field(
        default=None,
        description="action=create_agent 일 때 필수.",
    )
    sub_agents: list[SubAgentDesign] = Field(
        default_factory=list,
        description="action=create_agent 일 때 필요한 경우만. 단일 main 으로 충분하면 빈 배열.",
    )
    edit_changes: AgentEditPatch | None = Field(
        default=None,
        description="action=edit_agent 일 때 필수. 변경할 필드만 채우고 나머지는 None.",
    )
    direct_answer: str | None = Field(
        default=None,
        description=(
            "action=answer_directly 일 때 한국어 평문 답변. "
            "예: '이 agent 는 context7 으로 라이브러리 문서를 검색합니다' 같은 메타 설명."
        ),
    )
    new_skill: SkillDesign | None = Field(
        default=None,
        description=(
            "action=create_skill 일 때 필수. 사용자가 명시적으로 새 skill 만들기를 요청했고 "
            "기존 카탈로그에 같은 의도의 skill 이 없을 때만 사용. 백엔드가 DB 생성 후 사용자에게 "
            "결과를 알린다 (agent 변경 없음)."
        ),
    )
