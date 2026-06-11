"""Activity 라벨/아이콘/입력 요약 매핑 (Phase 9-4).

외부 client(`/v1/chat`) 가 받는 step 이벤트를 사람이 읽기 쉬운 라벨로 변환한다.
- tool/agent/skill/thinking 4종 분류
- 한국어 표시명 + 이모지 아이콘
- 입력은 도구별 핵심 필드만 짧게 추출
"""
from __future__ import annotations

from typing import Any

# ──────────────────────────────────────────────────────────────
# Tool 매핑 — 빌트인/커스텀 도구
# ──────────────────────────────────────────────────────────────

_TOOL_LABELS: dict[str, tuple[str, str]] = {
    # builtin VFS
    "ls": ("📁 디렉토리 조회", "📁"),
    "read_file": ("📄 파일 읽기", "📄"),
    "write_file": ("✍️ 파일 쓰기", "✍️"),
    "edit_file": ("✏️ 파일 편집", "✏️"),
    "grep": ("🔎 파일 검색", "🔎"),
    # web/search
    "web_search": ("🔍 웹 검색", "🔍"),
    "tavily_search": ("🔍 웹 검색", "🔍"),
    # general
    "current_time": ("🕐 현재 시각", "🕐"),
    "python": ("🐍 코드 실행", "🐍"),
    "code_interpreter": ("🐍 코드 실행", "🐍"),
    # gmail
    "gmail_search": ("📧 Gmail 검색", "📧"),
    "gmail_send": ("📧 Gmail 전송", "📧"),
    "gmail_fetch_attachment": ("📎 Gmail 첨부 다운로드", "📎"),
    "gmail_parse_pdf_attachment": ("📑 Gmail PDF 분석", "📑"),
    "pdf_parse": ("📑 PDF 분석", "📑"),
    "document_preprocess": ("📝 문서 전처리", "📝"),
    # planning
    "write_todos": ("📝 계획 수립", "📝"),
    "task": ("🤖 서브에이전트 호출", "🤖"),
}


def _summarize_value(value: Any, max_len: int = 80) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        s = value.strip()
        return s if len(s) <= max_len else s[: max_len - 1] + "…"
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, (list, tuple)):
        return f"[{len(value)} items]"
    if isinstance(value, dict):
        return f"{{{len(value)} keys}}"
    return _summarize_value(str(value), max_len)


_INPUT_FIELD_PRIORITY: dict[str, list[str]] = {
    "web_search": ["query", "q"],
    "tavily_search": ["query", "q"],
    "gmail_search": ["q", "query"],
    "gmail_send": ["to", "subject"],
    "gmail_fetch_attachment": ["message_id", "filename"],
    "read_file": ["file_path", "path"],
    "write_file": ["file_path", "path"],
    "edit_file": ["file_path", "path"],
    "grep": ["pattern", "path"],
    "ls": ["path"],
    "python": ["code"],
    "code_interpreter": ["code"],
    "task": ["subagent_type", "description"],
    "write_todos": ["todos"],
    "pdf_parse": ["file_path", "path"],
    "document_preprocess": ["file_path", "path"],
}


def _summarize_tool_input(name: str, raw_input: Any) -> str:
    """도구 입력에서 가장 중요한 1~2 필드만 뽑아 한 줄 요약."""
    if not isinstance(raw_input, dict):
        return _summarize_value(raw_input)

    priority = _INPUT_FIELD_PRIORITY.get(name)
    if priority:
        parts: list[str] = []
        for key in priority:
            if key in raw_input and raw_input[key] not in (None, ""):
                parts.append(f"{key}={_summarize_value(raw_input[key])}")
                if len(parts) >= 2:
                    break
        if parts:
            return ", ".join(parts)

    # fallback: 첫 1~2 키
    parts = []
    for k, v in list(raw_input.items())[:2]:
        if v in (None, ""):
            continue
        parts.append(f"{k}={_summarize_value(v)}")
    return ", ".join(parts)


# ──────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────


def classify_step(step_type: str | None, name: str | None) -> str:
    """step.started 이벤트의 stepType/name → kind: tool|agent|skill|thinking|llm."""
    st = (step_type or "").lower()
    nm = (name or "").lower()
    if st == "agent" or nm == "task" or nm.startswith("sub-"):
        return "agent"
    if st == "tool":
        return "tool"
    if st in ("middleware", "skill") or "skill" in nm:
        return "skill"
    if st == "llm" or any(p in nm for p in ("chatopenai", "chatanthropic", "chatgoogle")):
        return "thinking"
    return "tool"


def label_for(name: str, kind: str) -> tuple[str, str]:
    """(label, icon) 한국어 표시명 + 이모지."""
    if not name:
        return ("🔧 도구 실행", "🔧")

    mapped = _TOOL_LABELS.get(name)
    if mapped is not None:
        return mapped

    if kind == "agent":
        return (f"🤖 {name}", "🤖")
    if kind == "skill":
        return (f"🛠 스킬: {name}", "🛠")
    if kind == "thinking":
        return ("🧠 모델 추론", "🧠")
    return (f"🔧 {name}", "🔧")


def summarize_input(name: str, raw_input: Any) -> str:
    return _summarize_tool_input(name, raw_input)


def summarize_output(raw_output: Any, max_len: int = 120) -> str:
    """step.completed 출력 요약 — 외부 client 표시용."""
    if raw_output is None:
        return ""
    if isinstance(raw_output, str):
        s = raw_output.strip()
        return s if len(s) <= max_len else s[: max_len - 1] + "…"
    if isinstance(raw_output, dict):
        for key in ("content", "text", "message", "response", "summary", "status"):
            if key in raw_output and raw_output[key] not in (None, ""):
                return _summarize_value(raw_output[key], max_len)
        return f"{{{len(raw_output)} keys}}"
    if isinstance(raw_output, (list, tuple)):
        return f"[{len(raw_output)} items]"
    return _summarize_value(raw_output, max_len)
