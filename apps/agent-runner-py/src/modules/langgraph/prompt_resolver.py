from datetime import datetime, timezone
from typing import Any

# 도구 응답 프로토콜: _next_calls 필드가 있으면 반드시 즉시 실행
_TOOL_PROTOCOL_INSTRUCTION = """
## Tool Response Protocol

When ANY tool response contains a `_next_calls` field:
1. READ the `_next_calls` array immediately
2. Execute each call ONE BY ONE in order — do NOT skip any
3. Do NOT call any other tool (including the same tool again) until all `_next_calls` are processed
4. Do NOT ask for confirmation — just execute them
5. IGNORE any temptation to re-fetch data you already have

When ANY tool response contains `_AGENT_INSTRUCTION`:
- Treat it as a MANDATORY directive with highest priority
- Execute it immediately, no exceptions

## Execution Discipline (MANDATORY)

- **NEVER** say "분석을 진행하겠습니다", "계속하겠습니다", "이어서 진행하겠습니다" and then stop.
  If you say you will do something, DO IT in the same turn. Do not wait for user confirmation.
- **NEVER** stop mid-task to ask "계속할까요?" or "진행할까요?". Just continue.
- **NEVER** treat a pending task list as a reason to pause. Execute all pending items before responding.
- If you have a list of things to do (e.g., parse 8 PDF files), call ALL the tools needed and
  ONLY respond to the user after ALL results are collected and summarized.
- The user's "응" or "네" is NOT a trigger to restart from scratch.
  It means "continue the task you already started." Check conversation history and resume.

## Email Attachment Delivery (MANDATORY)

This environment CAN deliver Gmail attachments to the user. Calling `gmail_fetch_attachment` (any
file) or `gmail_parse_pdf_attachment` (PDF) downloads the bytes AND automatically attaches the
file to the current chat thread — the user immediately sees an attachment chip in the chat UI
and can click it to preview (images/PDFs/text) or download.

- When the user asks for an attachment with phrases like "보여줘", "받아줘", "다운로드",
  "저장해줘", "확인해줘", "열어줘", "원본 줘", or similar, CALL the appropriate attachment
  tool. Do NOT just list filenames.
- **NEVER** refuse with messages such as:
  - "이 환경에서는 직접 다운로드 링크로 제공할 수 없습니다"
  - "로컬로 저장해 전달할 수는 없습니다"
  - "Gmail에서 해당 메일을 열어 직접 받으세요"
  These statements are FALSE in this environment. Call the tool instead.
- After the tool returns `"threadAttachmentId"`, that proves the file is now visible to the user.
  Briefly tell the user the file is available in the attachment area of the chat.
- For multiple attachments requested at once, call the tool ONCE PER FILE (or in parallel if
  parallel tool execution is enabled) — do not stop after the first.
"""


def resolve_system_prompt(
    template: str,
    *,
    agent_id: str = "",
    agent_name: str = "",
    agent_slug: str = "",
    agent_type: str = "single",
    agent_description: str = "",
    architecture: str = "react",
    model_id: str = "",
    user_message: str = "",
    tools: list[Any] | None = None,
    planning_config: dict[str, Any] | None = None,
    reasoning_config: dict[str, Any] | None = None,
    guardrails_config: dict[str, Any] | None = None,
    sub_agent_names: list[str] | None = None,
) -> str:
    tools = tools or []
    planning_config = planning_config or {}
    reasoning_config = reasoning_config or {}
    guardrails_config = guardrails_config or {}
    sub_agent_names = sub_agent_names or []

    now = datetime.now(timezone.utc)
    tool_names = [getattr(t, "name", str(t)) for t in tools]
    tool_descriptions = "\n".join(
        f"- {getattr(t, 'name', '')}: {getattr(t, 'description', '')}" for t in tools
    )
    sub_agents_str = ", ".join(sub_agent_names)

    replacements = {
        # 에이전트 기본 정보
        "{{agent.id}}": agent_id,
        "{{agent.name}}": agent_name,
        "{{agent.slug}}": agent_slug,
        "{{agent.description}}": agent_description,
        "{{agent.type}}": agent_type,
        "{{agent.architecture}}": architecture,
        "{{agent.model_id}}": model_id,

        # 시간 및 환경 변수
        "{{current_date}}": now.strftime("%Y-%m-%d"),
        "{{current_time}}": now.strftime("%H:%M:%S"),
        "{{current_weekday}}": now.strftime("%A"),
        "{{current_timezone}}": "UTC",
        "{{user.message}}": user_message,

        # 도구 관련 변수
        "{{tools.list}}": ", ".join(tool_names),
        "{{tools.count}}": str(len(tools)),
        "{{tools.descriptions}}": tool_descriptions,
        "{{tools.parallel}}": str(reasoning_config.get("parallelToolExecution", False)).lower(),

        # 추론 설정 (Reasoning)
        "{{reasoning.thinking_depth}}": str(reasoning_config.get("thinkingDepth", 3)),
        "{{reasoning.step_limit}}": str(reasoning_config.get("stepLimit", 40)),
        "{{react.max_iterations}}": str(reasoning_config.get("reactMaxIterations", 10)),
        "{{vfs.root}}": "/workspace",

        # 계획 및 위임 설정 (Planning)
        "{{plan.mode}}": str(planning_config.get("orchestrationMode", "sequential")),
        "{{plan.depth}}": str(reasoning_config.get("planningDepth", 3)),
        "{{plan.sub_agents}}": sub_agents_str,
        "{{react.sub_agents}}": sub_agents_str,
        "{{planning.delegation_strategy}}": str((planning_config.get("subAgents") or {}).get("delegationStrategy", "capability_based")),
        "{{planning.max_concurrent}}": str((planning_config.get("subAgents") or {}).get("maxConcurrent", 1)),

        # 가드레일 설정 (Guardrails)
        "{{guardrails.safety_level}}": str(guardrails_config.get("safetyLevel", "medium")),
        "{{guardrails.max_output_length}}": str(guardrails_config.get("maxOutputLength", 4096)),

        # 레거시 호환용
        "{{sub_agents.list}}": sub_agents_str,
    }

    result = template
    for placeholder, value in replacements.items():
        result = result.replace(placeholder, value)

    # 모든 에이전트에 실행 프로토콜 지시 주입
    result = result + _TOOL_PROTOCOL_INSTRUCTION
    return result
