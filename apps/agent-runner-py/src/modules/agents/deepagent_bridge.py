"""
DeepAgent 브릿지 — 공식 deepagents 패키지 기반 실행.

create_deep_agent().astream_events() 경로를 통해 모든 에이전트를 실행한다.
입력 가드레일, 출력 가드레일/PII, 도구 권한 정책, 메모리 컨텍스트 주입을 담당한다.
"""
import asyncio
import json
import re
import time as _time
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessageChunk, BaseMessage, HumanMessage
from langchain_core.tools import BaseTool
from langgraph.errors import GraphBubbleUp, GraphRecursionError
from langgraph.types import Command

from src.common.utils import sanitize_tool_name
from src.config import settings
from src.database.client import fetch_all
from src.modules.attachments import attachments_service
from src.modules.deep.docker_sandbox import get_sandbox_manager
from src.modules.deep.file_content_middleware import FileBlockToTextMiddleware
from src.modules.deep.guardrails import InputGuardrail, OutputGuardrail
from src.modules.deep.memory import MemoryManager
from src.modules.deep.models import GuardrailsConfig, MemoryConfig
from src.modules.deep.sandbox_middleware import (
    AttachmentSyncMiddleware,
    build_attachment_hint,
)
from src.modules.deep.tool_wrapping import apply_policy, filter_vfs_tools, wrap_tool_with_error_handler
from src.modules.langgraph.checkpoint_service import get_saver
from src.modules.langgraph.graph_builder import _create_model
from src.modules.langgraph.prompt_resolver import resolve_system_prompt
from src.modules.langgraph.store_service import get_store
from src.modules.skills.skills_service import skills_service


def _patch_anthropic_no_parallel(model: Any) -> Any:
    """
    ChatAnthropic 모델의 bind_tools를 패치하여 병렬 도구 호출을 비활성화한다.

    create_deep_agent()는 내부에서 model.bind_tools(tools)를 호출하는데,
    이때 tool_choice 파라미터를 넘기지 않아 parallel tool calls가 기본 활성화된다.
    이 패치는 bind_tools 호출 시 항상 disable_parallel_tool_use=True를 주입한다.

    Anthropic 모델에만 적용하고, 다른 제공자 모델은 원본 그대로 반환한다.
    """
    if not isinstance(model, ChatAnthropic):
        return model

    original_bind_tools = model.bind_tools

    def patched_bind_tools(tools: Any, **kwargs: Any) -> Any:
        # tool_choice 파라미터에 disable_parallel_tool_use 강제 주입
        tool_choice = kwargs.get("tool_choice")
        if tool_choice is None:
            # tool_choice가 없으면 auto + disable_parallel 설정
            kwargs["tool_choice"] = {"type": "auto", "disable_parallel_tool_use": True}
        elif isinstance(tool_choice, dict):
            # 이미 dict면 disable_parallel_tool_use 추가
            tool_choice = dict(tool_choice)
            tool_choice.setdefault("disable_parallel_tool_use", True)
            kwargs["tool_choice"] = tool_choice
        elif tool_choice == "auto":
            # "auto" 문자열이면 dict로 변환
            kwargs["tool_choice"] = {"type": "auto", "disable_parallel_tool_use": True}
        # tool_choice가 "any", "required", specific tool name인 경우는 건드리지 않음
        return original_bind_tools(tools, **kwargs)

    # langchain-anthropic 최신 버전의 ChatAnthropic 은 Pydantic V2 BaseModel 이라 일반 속성
    # 할당(model.bind_tools = ...)이 `ValueError: ... has no field` 로 차단된다. pydantic 의
    # __setattr__ 검증을 우회하기 위해 object.__setattr__ 을 사용한다 (BaseModel 은 __slots__
    # 을 쓰지 않으므로 안전).
    object.__setattr__(model, "bind_tools", patched_bind_tools)
    return model


def _patch_openai_no_parallel(model: Any) -> Any:
    """
    ChatOpenAI 모델의 bind_tools를 패치하여 병렬 도구 호출을 비활성화한다.

    OpenAI Chat Completions API 의 `parallel_tool_calls` 파라미터는 `tools` 가 함께
    지정될 때만 허용된다. 따라서 모델 생성자나 model_kwargs 로 미리 설정하면
    `with_structured_output(...)`(response_format 기반, 도구 없음) 호출이 400 으로
    실패한다. 이 패치는 deepagents 가 `bind_tools(tools)` 를 호출하는 시점에만
    `parallel_tool_calls=False` 를 주입해, 도구가 실제로 바인딩된 호출에만 적용한다.

    sub-agent 가 여러 도구를 한 턴에 병렬로 호출하면 노드 다중 점등·HITL 충돌이
    발생하므로 한 번에 하나씩만 호출하도록 강제한다.

    OpenAI 모델에만 적용하고, 다른 제공자 모델은 원본 그대로 반환한다.
    """
    if not isinstance(model, ChatOpenAI):
        return model

    original_bind_tools = model.bind_tools

    def patched_bind_tools(tools: Any, **kwargs: Any) -> Any:
        # 호출자가 명시적으로 값을 지정했으면 존중, 아니면 False 로 비활성화
        kwargs.setdefault("parallel_tool_calls", False)
        return original_bind_tools(tools, **kwargs)

    object.__setattr__(model, "bind_tools", patched_bind_tools)
    return model


def _flatten_content(raw: Any) -> str:
    """LangChain message content 를 한 줄 string 으로 정규화.

    Anthropic 같은 provider 는 응답 content 를 list[dict] 형태로 반환할 수 있다
    (`[{'type': 'text', 'text': '...', 'index': 0}, ...]`). 이걸 `str(...)` 으로 직접
    변환하면 Python list repr 이 그대로 들어가 사용자 화면에 raw 객체가 노출되는
    회귀가 생긴다. 여기서 text block 만 추출해 이어 붙인다.
    """
    if isinstance(raw, str):
        return raw
    if isinstance(raw, list):
        parts: list[str] = []
        for block in raw:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(str(block.get("text") or ""))
                elif block.get("text"):
                    parts.append(str(block["text"]))
        return "".join(parts)
    return str(raw) if raw is not None else ""


def _serialize_messages(messages: list[BaseMessage]) -> list[dict[str, Any]]:
    result = []
    for msg in messages:
        content = _flatten_content(msg.content)
        entry: dict[str, Any] = {
            "role": {"human": "user", "ai": "assistant", "system": "system", "tool": "tool"}.get(
                msg.type, "assistant"
            ),
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            entry["toolCalls"] = msg.tool_calls
        result.append(entry)
    return result


def _filter_last_assistant_message(
    messages: list[dict[str, Any]],
    output_guard: "OutputGuardrail",
) -> list[dict[str, Any]]:
    """run.completed.messages 의 마지막 어시스턴트 응답 content에 output filter를 적용한다.

    토큰 streaming 시점에는 chunk 경계로 인해 정규식/PII 패턴이 깨질 수 있어
    defer_token_filter 모드에서 streaming은 건너뛰고 최종 텍스트에만 한 번 적용한다.
    """
    for msg in reversed(messages):
        if msg.get("role") != "assistant":
            continue
        if msg.get("toolCalls"):
            continue
        content = msg.get("content")
        if isinstance(content, str) and content:
            msg["content"] = output_guard.filter(content)
        break
    return messages


def _last_assistant_content(messages: list[dict[str, Any]]) -> str | None:
    """run.completed.messages 에서 마지막 어시스턴트 응답 텍스트를 추출."""
    for msg in reversed(messages):
        if msg.get("role") != "assistant":
            continue
        if msg.get("toolCalls"):
            continue
        content = msg.get("content")
        if isinstance(content, str) and content:
            return content
    return None


_QUICK_ACTION_PREFIX = "다음 TODO 항목을 이어서 진행해줘 — "


async def _auto_mark_quick_action_target(
    graph: Any,
    run_config: dict[str, Any],
    final_messages_raw: list[Any],
    logger: Any,
) -> None:
    """quick action(`다음 TODO 항목을 이어서 진행해줘 — XXX`)로 들어온 turn 의 정상 종료 시점에
    매칭되는 pending todo 가 있고 모델이 write_todos 마킹을 누락한 경우, 그 todo 를 in_progress
    로 set 해 후속 `_sweep_final_todos` 단계에서 completed 로 변환되도록 보정한다.

    오용을 막기 위해 답변 본문이 충분히 길 때만 적용(짧은 거절/되묻기 등은 skip).
    """
    last_user_text = ""
    for msg in reversed(final_messages_raw):
        msg_type = getattr(msg, "type", None)
        if msg_type == "human":
            content = msg.content if isinstance(msg.content, str) else ""
            last_user_text = content
            break
    if not last_user_text.startswith(_QUICK_ACTION_PREFIX):
        return
    matched_content = last_user_text[len(_QUICK_ACTION_PREFIX):].strip()
    if not matched_content:
        return

    last_ai_text = ""
    for msg in reversed(final_messages_raw):
        if getattr(msg, "type", None) != "ai":
            continue
        if getattr(msg, "tool_calls", None):
            continue
        if isinstance(msg.content, str):
            last_ai_text = msg.content
        elif isinstance(msg.content, list):
            buf = ""
            for block in msg.content:
                if isinstance(block, dict) and block.get("type") == "text":
                    buf += block.get("text", "")
            last_ai_text = buf
        break
    if len(last_ai_text.strip()) < 50:
        return

    try:
        state = await asyncio.shield(graph.aget_state(run_config))
    except Exception:  # noqa: BLE001
        logger.exception("auto-mark: aget_state failed")
        return
    todos = state.values.get("todos") if isinstance(state.values, dict) else None
    if not isinstance(todos, list) or not todos:
        return
    patched: list[dict[str, str]] = []
    changed = False
    for t in todos:
        if not isinstance(t, dict):
            continue
        content = str(t.get("content") or "")
        status = str(t.get("status") or "pending")
        if status == "pending" and content == matched_content:
            status = "in_progress"
            changed = True
        patched.append({"content": content, "status": status})
    if not changed:
        return
    try:
        await asyncio.shield(graph.aupdate_state(run_config, {"todos": patched}))
        logger.info("auto-mark: matched pending → in_progress for quick action", content=matched_content)
    except Exception:  # noqa: BLE001
        logger.exception("auto-mark: aupdate_state failed")


async def _revert_in_progress_todos_on_cancel(graph: Any, run_config: dict[str, Any], logger: Any) -> None:
    """cancel 경로에서 graph state.todos 를 이번 turn 시작 직전 상태로 rollback.

    이번 turn(마지막 user 메시지 이후)에서 모델이 write_todos 로 'in_progress' 또는
    'completed' 로 마킹한 항목은 실제로 작업이 끝나기 전에 cancel 된 것이므로 모두 pending
    으로 되돌린다. 단순히 in_progress 만 revert 하면 LLM 이 "선언적으로 먼저 completed
    마킹 → 본문 생성 도중 cancel" 패턴에서 정상 완료처럼 보이는 문제가 발생.

    구현: LangGraph state_history 를 역순으로 훑어 messages 길이가 last_user_idx 이하인
    가장 최근 checkpoint(=마지막 user 메시지가 추가되기 직전 checkpoint) 의 todos 를 base
    로 잡고, 현재 todos 와 base 의 status 가 달라진 항목을 모두 pending 으로 patch.

    cancellation 영향을 받지 않도록 aget_state/aget_state_history/aupdate_state 모두
    asyncio.shield 로 보호한다.
    """
    try:
        state = await asyncio.shield(graph.aget_state(run_config))
    except Exception:  # noqa: BLE001
        logger.exception("cancel revert: aget_state failed")
        return
    current_todos = state.values.get("todos") if isinstance(state.values, dict) else None
    messages = state.values.get("messages") if isinstance(state.values, dict) else None
    if not isinstance(current_todos, list) or not current_todos:
        return

    last_user_idx = -1
    if isinstance(messages, list):
        for i, msg in enumerate(messages):
            msg_type = getattr(msg, "type", None) if not isinstance(msg, dict) else msg.get("type")
            if msg_type == "human":
                last_user_idx = i

    base_by_content: dict[str, str] = {}
    if last_user_idx >= 0:
        try:
            async def _find_base() -> dict[str, str]:
                mapping: dict[str, str] = {}
                async for snap in graph.aget_state_history(run_config):
                    snap_msgs = snap.values.get("messages") if isinstance(snap.values, dict) else None
                    if not isinstance(snap_msgs, list):
                        continue
                    if len(snap_msgs) <= last_user_idx:
                        snap_todos = snap.values.get("todos") if isinstance(snap.values, dict) else None
                        if isinstance(snap_todos, list):
                            for t in snap_todos:
                                if isinstance(t, dict):
                                    mapping[str(t.get("content") or "")] = str(t.get("status") or "pending")
                        return mapping
                return mapping
            base_by_content = await asyncio.shield(_find_base())
        except Exception:  # noqa: BLE001
            logger.exception("cancel revert: aget_state_history failed")
            base_by_content = {}

    reverted: list[dict[str, str]] = []
    changed = False
    for t in current_todos:
        if not isinstance(t, dict):
            continue
        content = str(t.get("content") or "")
        status = str(t.get("status") or "pending")
        base_status = base_by_content.get(content)
        # 이전 turn 에서 이미 'completed' 였던 항목은 cancel 로 인해 잃지 않도록 보존.
        # (모델이 cancel 된 turn 에서 write_todos 호출 시 1번 항목까지 잘못 변경하더라도 복원.)
        if base_status == "completed" and status != "completed":
            status = "completed"
            changed = True
        # 이번 turn 에서 새로 in_progress/completed 로 변경된(또는 추가된) 항목은 pending 으로 revert.
        elif status in ("in_progress", "completed") and base_status != status:
            status = "pending"
            changed = True
        reverted.append({"content": content, "status": status})
    if not changed or not reverted:
        return
    try:
        await asyncio.shield(graph.aupdate_state(run_config, {"todos": reverted}))
        logger.info("cancel revert: todos rolled back to pre-turn state", count=len(reverted))
    except Exception:  # noqa: BLE001
        logger.exception("cancel revert: aupdate_state failed")


def _todo_appears_in_answer(content: str, answer: str) -> bool:
    """todo 의 content 가 답변 본문에 실제로 다뤄졌는지 휴리스틱으로 판정.

    - "1일차", "Step2", "3단계" 등 숫자+한글/영문 식별 토큰이 있으면, **모든** 식별 토큰이
      답변 본문에 등장해야 한다 (예: "2일차" 가 답변에 없으면 비매칭).
    - 식별 토큰이 없으면 핵심 키워드(2자 이상 한글/영문) 중 절반 이상이 답변에 등장하면 매칭으로 본다.
    """
    if not content or not answer:
        return False
    digit_tokens = re.findall(r"\d+[\w가-힣]*|[A-Za-z]+\d+[\w]*", content)
    if digit_tokens:
        return all(tok in answer for tok in digit_tokens)
    keywords = [k for k in re.findall(r"[A-Za-z0-9가-힣]+", content) if len(k) >= 2]
    if not keywords:
        return False
    hits = sum(1 for k in keywords if k in answer)
    return hits * 2 >= len(keywords)


def _sweep_final_todos(final_todos: list[Any], answer_text: str = "") -> list[dict[str, str]]:
    """turn 정상 완료 시점의 todos 를 normalize 하고 in_progress 항목을 보정한다.

    - 모델이 답변 직전 write_todos 의 'completed' 마킹을 누락해도 화면에 NOW 가 영구히
      남지 않도록 안전망을 둔다.
    - 단, 모델이 여러 항목을 in_progress 로 마킹했지만 답변에 실제로 산출물을 담지 않은
      항목까지 자동 completed 로 변환되면 진척도가 부풀려진다. 이를 막기 위해
      answer_text 에 todo 의 식별 키워드가 등장한 경우에만 completed 로 변환하고,
      그렇지 않은 경우 pending 으로 되돌린다.
    - answer_text 가 비어 있어 검증이 불가능하면 기존 동작(in_progress → completed)을 유지한다.
    - pending 은 건드리지 않는다 (모델이 의도적으로 다음 turn 에 미룬 항목일 수 있음).
    - HITL interrupt 케이스는 이 helper 호출 이전에 graph 가 paused 로 return 되므로 영향 없음.
    """
    normalized: list[dict[str, str]] = []
    has_answer = bool(answer_text and answer_text.strip())
    for t in final_todos:
        if not isinstance(t, dict):
            continue
        content = t.get("content") or ""
        status = t.get("status") or "pending"
        if status == "in_progress":
            if has_answer:
                status = "completed" if _todo_appears_in_answer(content, answer_text) else "pending"
            else:
                status = "completed"
        normalized.append({"content": content, "status": status})
    return normalized


def _build_guardrails_cfg(guardrails_raw: dict[str, Any]) -> GuardrailsConfig:
    return GuardrailsConfig(
        blocked_topics=guardrails_raw.get("blockedTopics", []),
        output_filters=guardrails_raw.get("outputFilters", []),
        json_schema_validation=guardrails_raw.get("jsonSchemaValidation", False),
        output_schema=guardrails_raw.get("outputSchema"),
        safety_level=guardrails_raw.get("safetyLevel", "medium"),
        pii_detection=guardrails_raw.get("piiDetection", False),
    )


def _hitl_policy_to_interrupt_on(hitl_policy: dict[str, Any]) -> dict[str, bool]:
    """Agent/sub-agent 의 hitlPolicy → deepagents `interrupt_on` dict (8-D5)."""
    tools_cfg = hitl_policy.get("tools") if isinstance(hitl_policy, dict) else None
    if not isinstance(tools_cfg, list):
        return {}
    return {
        t.get("toolName"): True
        for t in tools_cfg
        if isinstance(t, dict) and t.get("toolName")
    }


_KOREAN_INSTRUCTION = "\n\n모든 응답은 반드시 한국어로 작성하세요."


_TODO_OPERATING_RULES_BODY = (
    "- 요청을 실행하기에 필수 정보가 부족하면 사용자에게 질문하세요. "
    "이 경우 write_todos를 호출하지 마세요. (의미 없는 빈 작업 목록 생성 금지)\n"
    "- 합리적인 가정을 명시하고 진행할 수 있다면 질문하지 말고 곧바로 실행하세요.\n"
    "- 요청을 바로 실행할 수 있다면 다음 절차를 따르세요:\n"
    "  1) write_todos 도구로 작업 목록을 만들고, 이번 답변에서 즉시 다룰 항목들의 status를 'in_progress'로 표시합니다.\n"
    "  2) 답변 직전에 write_todos를 호출해 이번 답변에서 실제로 다룬 항목들을 모두 'completed'로, "
    "아직 다루지 않은 항목은 그대로 두되 다음에 이어서 다룰 항목이 있다면 'in_progress'로 표시하세요.\n"
    "  3) 모든 항목이 끝나면 마지막 답변 직전에 write_todos를 호출해 "
    "모든 항목의 status를 'completed'로 마감한 뒤 답변하세요.\n"
    "- **진척도 일치 규칙(중요)**: TODO 진행률은 매 답변마다 그 답변에서 사용자에게 실제로 "
    "제공한 산출물의 양과 정확히 일치해야 합니다. 한 번의 답변으로 여러 TODO 항목의 산출물을 "
    "동시에 제공했다면, 1개씩 따로 마킹하지 말고 **답변 직전 한 번의 write_todos 호출로 그 "
    "여러 항목을 한꺼번에 'completed'로 마킹**하세요. 반대로 답변에서 사실상 다루지 못한 "
    "항목까지 미리 'completed'로 마킹해서는 안 됩니다. 다룬 만큼만, 빠짐없이 마감하세요. "
    "예: 4개 항목 중 이번 답변에 1·2번 내용을 모두 담았다면 write_todos에 1·2번을 'completed', "
    "3번을 'in_progress'(또는 다음에 이어 다룰 첫 항목)로 보내세요.\n"
    "- **순차 진행 요청의 처리(중요)**: 사용자 메시지가 '순차적으로 진행', '일자별로', "
    "'단계별로', '차례대로', '하나씩' 등 한 번에 한 항목씩 진행하라는 의미라면, "
    "**이번 답변에서는 첫 번째 항목 한 개의 산출물만 작성**하고 write_todos 로 그 한 "
    "항목만 'completed' 로 마킹하세요. 다음 항목은 답변하지도, in_progress 로 미리 "
    "마킹하지도 마세요(다음 항목은 다음 사용자 요청 시 진행). 답변 끝에 "
    "'다음 항목(○○)을 이어서 진행할까요?' 와 같이 다음 미완료 항목 진행 여부만 안내하세요. "
    "예: TODO 가 [1일차, 2일차, 3일차, 준비 팁] 이고 사용자가 '일자별로 순차적으로 진행해줘' "
    "라고 했다면, 이번 답변은 **1일차만** 작성하고 write_todos 에 1일차만 'completed', "
    "나머지 3개는 그대로 'pending' 으로 두세요. 2일차를 in_progress 로 미리 마킹하지 마세요.\n"
    "- **in_progress 마킹 범위 제한**: 한 번의 write_todos 호출에서 in_progress 로 마킹할 "
    "수 있는 항목은 **이번 답변 본문에 실제로 산출물이 들어가는 항목들**뿐입니다. "
    "'다음에 이어서 할 예정' 인 항목을 in_progress 로 미리 마킹하면 안 됩니다 — 그런 항목은 "
    "pending 으로 두세요.\n"
    "- 아직 미완료(pending/in_progress) TODO 항목이 남아 있는 동안에는, 그와 무관한 "
    "새 작업(예: '예산별 일정표', '맛집/호텔 추가' 등)을 별도의 선택지로 제안하지 마세요. "
    "대신 답변 말미에서 다음 미완료 TODO 항목의 제목을 그대로 안내하고, "
    "'다음 항목(○○)을 이어서 진행할까요?'와 같이 남은 항목의 진행 여부만 물어보세요. "
    "새로운 작업 제안이 필요하다면 모든 TODO 항목이 'completed'로 마감된 이후에만 하세요.\n"
    "- **Quick Action 정확 매칭(중요)**: 사용자 메시지가 "
    "`다음 TODO 항목을 이어서 진행해줘 — XXX` 형식이면, **반드시 XXX 와 정확히 일치하는 "
    "TODO 항목 한 개만** 다루어 답변하세요. 다른 항목까지 같이 답변하면 안 됩니다. "
    "예: 사용자가 '— 1일차 상세 시간표 및 장소 구성' 을 보냈으면 1일차만 다루고, "
    "2일차나 전체 일정 정리는 다음 사용자 요청을 기다리세요. "
    "여러 항목을 한 번에 묶어 답변하지 말 것 — 진행률은 한 번에 1단계씩 정확히 올라가야 합니다.\n"
    "- Quick Action 메시지를 받으면 본문 응답을 시작하기 전에 write_todos 로 매칭되는 "
    "항목 한 개를 'in_progress' 로 마킹하고, 답변 직전에 그 항목만 'completed' 로 마킹하세요. "
    "매칭되지 않는 다른 항목의 status 는 절대 임의로 변경하지 마세요 — 특히 이미 "
    "'completed' 인 이전 항목을 다시 'pending' 으로 돌리면 안 됩니다.\n"
    "- **일반 자연어 요청(Quick Action 아님)의 처리**: 사용자 메시지가 "
    "`다음 TODO 항목을 이어서 진행해줘 — XXX` 형식이 아닌 일반 자연어 요청일 때, "
    "그 요청이 기존 TODO 항목과 **의미적으로 정확히 동일하지 않다면 기존 항목을 임의로 "
    "in_progress/completed 로 마킹하지 마세요.** 예: 기존 todo 가 '최종 여행계획표와 준비 팁 정리' 이고 "
    "사용자가 '일별로 자세한 시간표 만들어줘' 를 보냈다면, 이는 별개의 작업이므로 기존 항목을 "
    "건드리지 말고 write_todos 로 새 작업 단계를 추가(또는 새 TODO List 를 새로 구성)해 "
    "그 작업만 다루세요. 사용자가 명시적으로 기존 미완료 항목을 지칭하지 않는 한 기존 항목의 "
    "status 는 변경하지 않습니다."
)


def _todo_operating_rules_prompt(architecture: str | None) -> str:
    """architecture 와 무관하게 동일한 TODO 운영 규칙을 부착하되, 도입부 한 줄로
    mode별 write_todos 사용 권장 강도만 약하게 차별화한다. react 모드는 작업 분해가
    유익할 때만 자율적으로 write_todos 를 호출하고, plan_execute 모드는 정보 부족이
    아닌 한 가능한 한 write_todos 부터 만들고 시작한다.
    """
    if architecture == "react":
        intro = (
            "- 단순 잡담/짧은 질의응답이거나 작업 분해가 불필요한 요청이면 "
            "write_todos 를 호출하지 말고 자연스럽게 답하세요. 작업 분해가 도움된다고 "
            "판단되면 자율적으로 write_todos 를 사용해도 됩니다.\n"
        )
    else:
        intro = (
            "- 필수 정보가 부족해 사용자에게 질문해야 하는 경우가 아니라면, "
            "가능한 한 write_todos 로 작업 목록부터 만들고 시작하세요.\n"
        )
    return (
        "\n\n[TODO 도구 사용 시 운영 규칙]\n"
        + intro
        + "- write_todos 를 한 번이라도 호출하기로 결정했다면 같은 thread 내에서는 아래 규칙을 일관되게 따르세요.\n"
        + _TODO_OPERATING_RULES_BODY
    )


def _resolve_provider_key(
    user_credentials: dict[str, str] | None,
    provider_slug: str,
    fallback_key: str | None,  # noqa: ARG001 — deprecated parameter, kept for backwards compat
) -> tuple[str | None, str]:
    """사용자 자격증명만 사용. 글로벌 fallback 키는 더 이상 사용하지 않는다.

    각 사용자가 본인의 provider API key 를 등록해야 하며, 미등록 시 credential_missing
    으로 처리. (이전 Phase 10-7 의 DB fallback 은 deprecated.)

    반환:
        (api_key | None, source) — source ∈ {"user", "missing"}
    """
    if user_credentials:
        user_key = user_credentials.get(f"provider:{provider_slug}")
        if user_key:
            return user_key, "user"
    return None, "missing"


def _classify_node_role(name: str) -> str:
    lower = name.lower()
    for k in ("coordinator", "coordinat", "조율", "조정", "계획", "planner", "orchestrat"):
        if k in lower:
            return "coordinator"
    for k in ("research", "researcher", "조사", "검색", "탐색", "gather", "search"):
        if k in lower:
            return "researcher"
    for k in ("writ", "writer", "작성", "설명", "요약", "content", "draft"):
        if k in lower:
            return "writer"
    return "generic"


def _summarize_prompt_for_desc(system_prompt: str, max_len: int = 220) -> str:
    """서브에이전트 systemPrompt 앞부분에서 목적을 추출해 description 본문으로 사용한다.

    name 이 sanitize 로 깨져도(예: 한글→언더스코어) main 이 description 으로 라우팅할 수
    있도록, 실제 역할이 드러나는 첫 1~2문장을 description 에 반영한다.
    """
    text = (system_prompt or "").strip()
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?。])\s+|\n+", text)
    picked = " ".join(s.strip() for s in sentences[:2] if s.strip())
    if len(picked) > max_len:
        picked = picked[:max_len].rstrip() + "…"
    return picked


# role 별 '사용 시점(when to use)' 힌트 — deepagents 권장 패턴. description 에 부착해
# main 이 적합한 서브에이전트를 더 정확히 선택하도록 한다.
_ROLE_USE_WHEN: dict[str, str] = {
    "coordinator": "복잡한 작업의 실행 계획·단계 분해가 필요할 때 사용. 직접 조사·작성은 하지 않고 계획만 반환한다.",
    "researcher": "최신 정보·외부 자료·웹 근거 수집이 필요할 때 사용. 웹 검색으로 사실과 출처를 수집한다.",
    "writer": "수집된 근거를 사용자가 이해하기 쉬운 글·설명·요약으로 다시 작성해야 할 때 사용. 조사·검색 이후 최종 설명 작성을 담당한다.",
}


def _auto_describe_subagent(name: str, existing_desc: str, system_prompt: str = "") -> str:
    """라우팅에 유리하도록 서브에이전트 description 을 구성한다.

    구성: `[원문 이름] {본문} 사용 시점: {role 힌트}`
      - 원문 이름: sanitize 전 사람이 읽는 이름(한글 포함) — registered name 이 깨져도 의도 매칭 가능.
      - 본문: 명시 description(>30자) 우선, 없으면 systemPrompt 첫 문장에서 도출.
      - 사용 시점: role 기반 'when to use' 힌트.
    """
    role = _classify_node_role(name)

    body = existing_desc.strip() if existing_desc and len(existing_desc.strip()) > 30 else ""
    if not body:
        body = _summarize_prompt_for_desc(system_prompt)
    if not body:
        body = {
            "coordinator": "작업 계획을 수립하는 조율 전담 에이전트입니다.",
            "researcher": "정보 탐색·자료 수집 전담 에이전트입니다.",
            "writer": "수집된 근거로 글·설명을 작성하는 에이전트입니다.",
        }.get(role, f"{name} 전담 에이전트입니다." if name else "전담 서브에이전트입니다.")

    parts: list[str] = []
    if name:
        parts.append(f"[{name}]")
    parts.append(body)
    use_when = _ROLE_USE_WHEN.get(role)
    if use_when:
        parts.append(f"사용 시점: {use_when}")
    return " ".join(parts).strip()


def _coordinator_restriction_prompt() -> str:
    return (
        "\n\n[역할 제약 — 절대 준수]\n"
        "당신은 계획 수립 전문가입니다. 반드시 아래 규칙을 따르세요:\n"
        "1. 직접 조사·검색·리서치를 수행하지 마세요. 계획만 수립하세요.\n"
        "2. 직접 글·문서·콘텐츠를 작성하지 마세요. 계획만 수립하세요.\n"
        "3. write_file, grep, ls, read_file 등 파일 관련 도구를 절대 사용하지 마세요.\n"
        "4. 구조화된 실행 계획을 텍스트로 작성하여 반환하세요.\n"
    )


_KOREAN_WEEKDAYS = ("월", "화", "수", "목", "금", "토", "일")


def _today_header() -> str:
    """매 invoke 시 시스템 프롬프트 상단에 붙는 '오늘 날짜' 헤더.

    LLM 이 "5월"/"이번달"/"지난주" 같은 자연어 기간을 정확한 YYYY/MM/DD 로 환산할 수 있게
    하는 컨텍스트. timezone 은 서버 로컬(보통 KST) 기준.
    """
    now = datetime.now()
    wd = _KOREAN_WEEKDAYS[now.weekday()]
    return f"[현재 날짜: {now.strftime('%Y-%m-%d')} ({wd})]\n\n"


def _requester_header(metadata: dict[str, Any] | None) -> str:
    """외부 채널(NAVER WORKS 1:1 등)에서 들어온 thread 의 요청자 정보를 system prompt 상단에 주입.

    NAVER WORKS 1:1 대화 등에서 "요청자가 곧 컨텍스트"이므로 (예: 요청자 ID로 회의실 예약)
    metadata.requester 가 있을 때만 헤더를 prepend 한다. 다른 진입점은 영향 없음.
    """
    if not metadata or not isinstance(metadata, dict):
        return ""
    requester = metadata.get("requester")
    if requester is None:
        requester = {}
    if not isinstance(requester, dict):
        return ""

    name = requester.get("name")
    email = requester.get("email")
    naver_user_id = requester.get("naverUserId") or metadata.get("naverUserId")

    if not (name or email or naver_user_id):
        return ""

    lines = ["## 요청자 정보"]
    if name:
        lines.append(f"- 이름: {name}")
    if email:
        lines.append(f"- 이메일: {email}")
    if naver_user_id:
        lines.append(f"- NAVER WORKS userId: {naver_user_id}")
    lines.append(
        "현재 대화의 모든 작업(예: 회의실 예약, 일정 등록, 메일 발송)은 이 사용자의 ID로 실행한다."
    )
    return "\n".join(lines) + "\n\n"


async def _fetch_thread_metadata(thread_id: str) -> dict[str, Any]:
    """thread metadata 를 안전하게 조회. 실패 시 빈 dict."""
    try:
        from src.modules.threads import threads_service as _threads_service
        thread = await _threads_service.get(thread_id)
        metadata = thread.get("metadata") or {}
        if isinstance(metadata, str):
            import json as _json
            try:
                metadata = _json.loads(metadata)
            except Exception:  # noqa: BLE001
                metadata = {}
        if not isinstance(metadata, dict):
            return {}
        return metadata
    except Exception:  # noqa: BLE001
        return {}


def build_subagents(
    specs: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """`agents_service.load_agent_with_deps()` 의 `subAgentSpecs` 리스트를
    공식 deepagents `subagents` 파라미터(dict 리스트) 로 변환한다.

    각 spec 에서:
      - 모델 인스턴스는 `_create_model()` 로 생성
      - 도구는 VFS 필터링만 적용하고 그대로 전달 (도구 권한 정책은 spec.guardrailsConfig 에서 별도 처리 가능하나
        현재 MVP 는 sub-agent 도구 권한 미지원 — 상위 에이전트 수준에서만 적용)
      - `interrupt_on` 은 spec.hitlPolicy 에서 도출
    """
    import structlog
    _log = structlog.get_logger(__name__)

    if not specs:
        return []

    subagents: list[dict[str, Any]] = []
    for spec in specs:
        try:
            sub_model = _create_model(
                provider_slug=spec.get("providerSlug") or "",
                provider_api_key=spec.get("providerApiKey"),
                model_id=spec.get("modelId") or "",
                config=spec.get("config") or {},
            )
        except Exception as exc:
            _log.warning("build_subagents: _create_model failed, skipping spec",
                         name=spec.get("name"), error=str(exc))
            continue

        # 서브에이전트도 동일하게 병렬 도구 호출 비활성화 패치 적용
        sub_model = _patch_anthropic_no_parallel(sub_model)
        sub_model = _patch_openai_no_parallel(sub_model)

        sub_tools_raw = filter_vfs_tools(spec.get("tools") or [])

        # 서브에이전트 도구 권한 적용 — 메인 에이전트와 동일한 _apply_tool_policies 사용
        # (disabled 제외, requires_approval → interrupt_on, restricted → 래핑, auto → 원본)
        sub_tool_permissions: dict[str, Any] = spec.get("toolPermissions") or {}
        sub_tools, interrupt_on_from_perms = _apply_tool_policies(sub_tools_raw, sub_tool_permissions)

        # 레거시 hitlPolicy 와 병합 (DB-linked sub-agent 호환)
        interrupt_on_from_hitl = _hitl_policy_to_interrupt_on(spec.get("hitlPolicy") or {})
        interrupt_on = {**interrupt_on_from_perms, **interrupt_on_from_hitl}

        raw_spec_name: str = spec.get("name") or spec.get("slug") or spec.get("id") or ""
        # OpenAI/Anthropic 은 agent·tool name 에 공백·특수문자 금지 → sanitize 필수
        # (LangChain AIMessage.name 이 OpenAI messages[].name 패턴 '^[^\s<|\\/>]+$' 로 검증됨)
        spec_name: str = sanitize_tool_name(raw_spec_name)
        if spec_name != raw_spec_name:
            _log.info("build_subagents: sanitized subagent name",
                      raw=raw_spec_name, sanitized=spec_name)
        role = _classify_node_role(raw_spec_name)

        description = _auto_describe_subagent(
            raw_spec_name, spec.get("description") or "", spec.get("systemPrompt") or ""
        )

        sys_prompt = _today_header() + (spec.get("systemPrompt") or "")
        if role == "coordinator":
            sys_prompt += _coordinator_restriction_prompt()
        if "한국어" not in sys_prompt and "Korean" not in sys_prompt:
            sys_prompt += _KOREAN_INSTRUCTION

        subagent_dict: dict[str, Any] = {
            "name": spec_name,
            "description": description,
            "system_prompt": sys_prompt,
            "tools": sub_tools,
            "model": sub_model,
        }
        if interrupt_on:
            subagent_dict["interrupt_on"] = interrupt_on

        sub_skill_ids: list[str] = spec.get("skillIds") or []
        if sub_skill_ids:
            # 서브에이전트는 자체 skill namespace 분리: /skills/{slug}/
            subagent_dict["skills"] = [f"/skills/{spec_name}/"]
            # 스킬 내용은 _inject_skill_contents_to_specs()에서 system_prompt에 직접 주입됨.
            # 추가 강제 지시: 주입된 스킬 지시사항을 반드시 준수하도록 명시.
            subagent_dict["system_prompt"] += (
                "\n\n[스킬 지시사항 준수 — 필수] 위 [필수 스킬 지시사항]에 정의된 형식, 구조, "
                "출력 규칙을 반드시 그대로 따르세요. 임의로 형식을 변경하거나 생략하지 마세요."
            )

        subagents.append(subagent_dict)

    return subagents


async def _inject_main_skill_contents(
    system_prompt: str,
    skill_ids: list[str],
) -> str:
    """메인 에이전트 스킬 내용을 DB에서 직접 로드하여 system_prompt에 주입한다.

    deepagents progressive disclosure 방식은 에이전트가 read_file을 자발적으로
    호출해야 하는데, LLM이 이 단계를 건너뛰는 경우가 많다.
    스킬 전체 내용을 system prompt에 직접 삽입하여 에이전트가 반드시 따르게 한다.
    (_inject_skill_contents_to_specs 의 메인 에이전트 버전)
    """
    if not skill_ids:
        return system_prompt

    placeholders = ", ".join(f"${i + 1}" for i in range(len(skill_ids)))
    skills = await fetch_all(
        f"SELECT name, description, instructions FROM skills WHERE id IN ({placeholders}) AND enabled = true",
        tuple(skill_ids),
    )

    if not skills:
        return system_prompt

    skill_section = "\n\n[필수 스킬 지시사항 — 반드시 준수]"
    for s in skills:
        skill_section += f"\n\n## 스킬: {s['name']}"
        if s.get("description"):
            skill_section += f"\n{s['description']}"
        if s.get("instructions"):
            skill_section += f"\n\n{s['instructions']}"

    skill_section += (
        "\n\n[스킬 지시사항 준수 — 필수] 위 [필수 스킬 지시사항]에 정의된 형식, 구조, "
        "출력 규칙을 반드시 그대로 따르세요. 임의로 형식을 변경하거나 생략하지 마세요."
    )

    return system_prompt + skill_section


async def _inject_skill_contents_to_specs(
    sub_agent_specs: list[dict[str, Any]] | None,
) -> list[dict[str, Any]] | None:
    """서브에이전트 스킬 내용을 DB에서 직접 로드하여 systemPrompt에 주입한다.

    deepagents progressive disclosure 방식은 에이전트가 read_file을 자발적으로
    호출해야 하는데, LLM이 이 단계를 건너뛰는 경우가 많다.
    스킬 전체 내용을 system prompt에 직접 삽입하여 에이전트가 반드시 따르게 한다.
    """
    if not sub_agent_specs:
        return sub_agent_specs

    result: list[dict[str, Any]] = []
    for spec in sub_agent_specs:
        sub_ids: list[str] = spec.get("skillIds") or []
        if not sub_ids:
            result.append(spec)
            continue

        placeholders = ", ".join(f"${i + 1}" for i in range(len(sub_ids)))
        skills = await fetch_all(
            f"SELECT name, description, instructions FROM skills WHERE id IN ({placeholders}) AND enabled = true",
            tuple(sub_ids),
        )

        if not skills:
            result.append(spec)
            continue

        skill_section = "\n\n[필수 스킬 지시사항 — 반드시 준수]"
        for s in skills:
            skill_section += f"\n\n## 스킬: {s['name']}"
            if s.get("description"):
                skill_section += f"\n{s['description']}"
            if s.get("instructions"):
                skill_section += f"\n\n{s['instructions']}"

        new_spec = dict(spec)
        new_spec["systemPrompt"] = (spec.get("systemPrompt") or "") + skill_section
        result.append(new_spec)

    return result


async def _sync_skills_for_run(
    main_agent_id: str,
    main_skill_ids: list[str],
    sub_agent_specs: list[dict[str, Any]] | None,
) -> tuple[list[str], bool]:
    """invoke 직전에 메인+서브 에이전트의 skill 파일을 PostgresStore에 동기화.

    반환:
        (main_skill_paths, any_skills_used)
        - main_skill_paths: ["/skills/<agent_id>/"] 또는 빈 리스트
        - any_skills_used: True 면 backend/store 인자가 필요
    """
    main_paths: list[str] = []
    any_used = False

    if main_skill_ids:
        await skills_service.sync_agent_skills(
            agent_id=main_agent_id,
            skill_ids=main_skill_ids,
        )
        main_paths = [f"/skills/{main_agent_id}/"]
        any_used = True

    for spec in sub_agent_specs or []:
        sub_ids: list[str] = spec.get("skillIds") or []
        if not sub_ids:
            continue
        # build_subagents 와 동일하게 sanitize 한 이름을 namespace로 사용
        raw_name: str = spec.get("name") or spec.get("slug") or spec.get("id") or ""
        slug_name: str = sanitize_tool_name(raw_name)
        await skills_service.sync_agent_skills(
            agent_id=slug_name,
            skill_ids=sub_ids,
        )
        any_used = True

    return main_paths, any_used


class _NoExecBackend:
    """`SandboxBackendProtocol` 미상속 sandbox wrapper — deepagents `FilesystemMiddleware` 가
    `execute` 도구를 자동으로 제거하도록 유도한다 (`filesystem.py: supports_execution()` 이
    isinstance 검사 기반이라 상속 트리에서 빠지면 False 반환).

    파일 ls/read/write/grep/glob/edit 등 `BackendProtocol` 메서드는 모두 inner sandbox 로 위임.
    ToolsTab 의 `execute` 토글이 OFF 인 에이전트에 사용한다.
    """

    _DELEGATED = (
        "ls", "als", "read", "aread", "grep", "agrep", "glob", "aglob",
        "write", "awrite", "edit", "aedit",
        "upload_files", "aupload_files", "download_files", "adownload_files",
        "ls_info", "als_info", "glob_info", "aglob_info", "grep_raw", "agrep_raw",
        "artifacts_root", "id",
    )

    def __init__(self, inner: Any) -> None:
        self._inner = inner

    def __getattr__(self, name: str) -> Any:
        # __init__ 의 self._inner 설정 이전엔 호출되지 않음 (object.__setattr__ 사용)
        return getattr(self._inner, name)


def _make_thread_sandbox_backend(
    sandbox: Any, store: Any | None, *, execute_enabled: bool = True
) -> Any:
    """sandbox(DockerSandbox) 를 default 로, /state/ 와 /skills/ 라우팅까지 합성.

    - default(DockerSandbox): 실행/첨부/일반 파일 — execute 도구 제공
      `execute_enabled=False` 일 때는 `_NoExecBackend` 로 감싸 execute 도구 자동 제거.
    - /state/ → StateBackend: 서브에이전트 간 영속 공유 데이터 (LangGraph checkpoint)
      공식 패턴 (deepagents docs: "Files a subagent writes will remain in the LangGraph
      agent state ... will continue to be available to the supervisor agent and other
      subagents").
    - /skills/ → StoreBackend: SKILL.md 동기화 (store 가 있을 때만)
    """
    routes: dict[str, Any] = {"/state/": StateBackend()}
    if store is not None:
        routes["/skills/"] = StoreBackend(
            store=store,
            namespace=lambda _rt: ("filesystem",),
        )
    default_backend = sandbox if execute_enabled else _NoExecBackend(sandbox)
    return lambda _rt: CompositeBackend(default=default_backend, routes=routes)


def _normalize_tool_policy(raw: Any) -> str:
    """toolPermissions 값을 정책 문자열로 정규화.

    - string ('requires_approval' 등) → 그대로
    - object ({policy: '...', cardId?: '...'}) → policy 추출 (Phase 2 표준)
    - 그 외 → 'auto'
    """
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        policy = raw.get("policy")
        if isinstance(policy, str):
            return policy
    return "auto"


def _apply_tool_policies(
    tools: list[BaseTool],
    tool_permissions: dict[str, Any],
) -> tuple[list[BaseTool], dict[str, bool]]:
    """
    도구 권한 정책 적용 후 (wrapped_tools, interrupt_on) 반환.

    - disabled  → 리스트에서 제외
    - restricted → apply_policy 래퍼 적용
    - requires_approval → 원본 유지 + interrupt_on 등록 (deepagents HITL 처리)
    - auto → 원본 유지
    """
    wrapped: list[BaseTool] = []
    interrupt_on: dict[str, bool] = {}

    for t in tools:
        policy = _normalize_tool_policy(tool_permissions.get(t.name, "auto"))
        if policy == "disabled":
            continue
        elif policy == "requires_approval":
            # HITL 승인 후 실제 호출되는 원본 도구에도 에러 핸들러를 씌워
            # 도구 예외가 그래프를 중단시키지 않도록 한다.
            wrapped.append(wrap_tool_with_error_handler(t))
            interrupt_on[t.name] = True
        elif policy == "restricted":
            # restricted 래퍼는 자체적으로 예외를 던지지 않지만 일관성을 위해 동일하게 감싼다.
            wrapped.append(wrap_tool_with_error_handler(apply_policy(t, "restricted")))
        else:
            wrapped.append(wrap_tool_with_error_handler(t))

    return wrapped, interrupt_on


_SKIP_CHAIN_NAMES = frozenset({
    "LangGraph",
    "RunnableLambda",
    "RunnableSequence",
    "RunnableParallel",
    "ChannelRead",
    "ChannelWrite",
    "__start__",
    "__end__",
    "RunnableAssign",
    "RunnablePick",
    "RouterRunnable",
    "CompiledStateGraph",
    "CompiledGraph",
})


def _should_show_chain(name: str, depth: int) -> bool:
    if depth == 0 or not name or name in _SKIP_CHAIN_NAMES:
        return False
    if depth == 1:
        return True
    if "Middleware" in name:
        return True
    if any(p in name for p in ("ChatOpenAI", "ChatAnthropic", "ChatGoogle", "AzureChat", "ChatBedrock", "ChatCohere")):
        return True
    return False


def _get_step_type(name: str) -> str:
    if any(p in name for p in ("ChatOpenAI", "ChatAnthropic", "ChatGoogle", "AzureChat", "ChatBedrock", "ChatCohere")):
        return "llm"
    if "Middleware" in name:
        return "middleware"
    if name in ("tools", "tool"):
        return "tool"
    return "agent"


def _task_subagent_name_from_input(tool_input: Any) -> str:
    """`task` 도구 input 에서 sub-agent 식별자 추출."""
    if isinstance(tool_input, str):
        try:
            tool_input = json.loads(tool_input)
        except Exception:
            return "sub-agent"
    if isinstance(tool_input, dict):
        return tool_input.get("subagent_type") or tool_input.get("name") or "sub-agent"
    return "sub-agent"


def _safe_serialize(obj: Any) -> Any:
    if isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    if isinstance(obj, (list, tuple)):
        return [_safe_serialize(i) for i in obj]
    if isinstance(obj, dict):
        return {str(k): _safe_serialize(v) for k, v in obj.items()}
    content = getattr(obj, "content", None)
    if content is not None:
        return content if isinstance(content, str) else str(content)
    for method in ("model_dump", "dict"):
        fn = getattr(obj, method, None)
        if callable(fn):
            try:
                return fn()
            except Exception:
                pass
    return str(obj)


async def _pump_astream_events(
    graph: Any,
    input_payload: Any,
    run_config: dict[str, Any],
    output_guard: OutputGuardrail,
    step_started_at: dict[str, float],
    emitted_ids: set[str],
    logger: Any,
    defer_token_filter: bool = False,
    usage_acc: dict[str, int] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """LangGraph astream_events → 표준 이벤트 어댑터. 초기 실행/재개 공용.

    defer_token_filter=True 인 경우 chunk 단위 token emit을 건너뛴다.
    출력 정규식/PII 패턴이 토큰 chunk 경계에서 깨지는 것을 막기 위해
    호출자(stream_with_deepagent)가 종료 후 최종 텍스트에 filter를 한 번 더 적용한다.
    """

    async for ae in graph.astream_events(input_payload, config=run_config, version="v2"):
        kind: str = ae["event"]
        name: str = ae.get("name", "")
        run_id: str = ae["run_id"]
        parent_ids: list[str] = ae.get("parent_ids", [])
        data: dict[str, Any] = ae.get("data", {})

        parent_step_id: str | None = None
        ui_depth = 0
        for pid in parent_ids:
            if pid in emitted_ids:
                if parent_step_id is None:
                    parent_step_id = pid
                ui_depth += 1

        if kind == "on_chat_model_stream":
            chunk = data.get("chunk")
            if isinstance(chunk, AIMessageChunk):
                # usage_metadata 는 일반적으로 마지막 chunk 에만 채워져 있음 — 누적해 합산.
                if usage_acc is not None:
                    meta = getattr(chunk, "usage_metadata", None)
                    if isinstance(meta, dict):
                        usage_acc["input_tokens"] = usage_acc.get("input_tokens", 0) + int(meta.get("input_tokens") or 0)
                        usage_acc["output_tokens"] = usage_acc.get("output_tokens", 0) + int(meta.get("output_tokens") or 0)

                content = ""
                if isinstance(chunk.content, str):
                    content = chunk.content
                elif isinstance(chunk.content, list):
                    for block in chunk.content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            content += block.get("text", "")

                if not defer_token_filter and content:
                    filtered_content = output_guard.filter(content)
                    # ui_depth>0 은 sub-agent 의 LLM 토큰 — client 는 depth!==0 토큰을 본문에
                    # 렌더하지 않으므로 main(depth=0) 답변만 노출된다. depth 를 실어 전달.
                    yield {"event": "token", "data": {"token": filtered_content, "runStepId": run_id, "depth": ui_depth}}

        elif kind == "on_tool_start":
            step_started_at[run_id] = _time.monotonic()
            emitted_ids.add(run_id)
            raw_input = data.get("input")
            if isinstance(raw_input, str):
                try:
                    tool_input = json.loads(raw_input)
                except Exception:
                    tool_input = {}
            else:
                tool_input = raw_input or {}
            logger.debug("on_tool_start", tool_name=name, tool_input=tool_input)
            if name == "write_todos":
                todos = tool_input.get("todos", []) if isinstance(tool_input, dict) else []
                yield {"event": "plan.created", "data": {"steps": todos if isinstance(todos, list) else []}}

            if name == "task" and isinstance(tool_input, dict):
                subagent_name = tool_input.get("subagent_type") or tool_input.get("name") or "sub-agent"
                yield {"event": "step.started", "data": {
                    "stepId": run_id,
                    "stepType": "agent",
                    "name": subagent_name,
                    "nodeId": f"agent:{subagent_name}",
                    "input": {"message": tool_input.get("description") or ""},
                    "parentStepId": parent_step_id,
                    "depth": ui_depth,
                }}
            else:
                yield {"event": "step.started", "data": {
                    "stepId": run_id,
                    "stepType": "tool",
                    "name": name,
                    "nodeId": f"tools:{name}",
                    "input": _safe_serialize(tool_input),
                    "parentStepId": parent_step_id,
                    "depth": ui_depth,
                }}

        elif kind == "on_tool_end":
            started = step_started_at.pop(run_id, None)
            latency_ms = int((_time.monotonic() - started) * 1000) if started else 0
            logger.debug("on_tool_end", tool_name=name,
                         output=str(_safe_serialize(data.get("output")))[:1000])
            if name == "task":
                output_raw = data.get("output")
                output_content = _safe_serialize(output_raw)
                yield {"event": "step.completed", "data": {
                    "stepId": run_id,
                    "stepType": "agent",
                    "name": _task_subagent_name_from_input(data.get("input")),
                    "nodeId": f"agent:{_task_subagent_name_from_input(data.get('input'))}",
                    "output": {"content": output_content if isinstance(output_content, str) else str(output_content)},
                    "latencyMs": latency_ms,
                    "parentStepId": parent_step_id,
                    "depth": ui_depth,
                }}
            else:
                yield {"event": "step.completed", "data": {
                    "stepId": run_id,
                    "stepType": "tool",
                    "name": name,
                    "nodeId": f"tools:{name}",
                    "output": _safe_serialize(data.get("output")),
                    "latencyMs": latency_ms,
                    "parentStepId": parent_step_id,
                    "depth": ui_depth,
                }}

        elif kind == "on_tool_error":
            started = step_started_at.pop(run_id, None)
            latency_ms = int((_time.monotonic() - started) * 1000) if started else 0
            error_obj = data.get("error")
            logger.debug("on_tool_error",
                         tool_name=name,
                         error_type=type(error_obj).__name__ if error_obj else None,
                         is_bubble_up=isinstance(error_obj, GraphBubbleUp))
            # GraphBubbleUp (GraphInterrupt 포함) 는 HITL 정상 동작의 일부 —
            # step.failed 로 올리면 경고 탭에 노이즈가 된다. 대신 step.completed(paused) 로 마감
            if isinstance(error_obj, GraphBubbleUp):
                if name == "task":
                    sub_name = _task_subagent_name_from_input(data.get("input"))
                    yield {"event": "step.completed", "data": {
                        "stepId": run_id,
                        "stepType": "agent",
                        "name": sub_name,
                        "nodeId": f"agent:{sub_name}",
                        "output": {"status": "paused", "reason": "hitl_interrupt"},
                        "latencyMs": latency_ms,
                        "parentStepId": parent_step_id,
                        "depth": ui_depth,
                    }}
                else:
                    yield {"event": "step.completed", "data": {
                        "stepId": run_id,
                        "stepType": "tool",
                        "name": name,
                        "nodeId": f"tools:{name}",
                        "output": {"status": "paused", "reason": "hitl_interrupt"},
                        "latencyMs": latency_ms,
                        "parentStepId": parent_step_id,
                        "depth": ui_depth,
                    }}
            elif name == "task":
                sub_name = _task_subagent_name_from_input(data.get("input"))
                err_text = str(error_obj or "Sub-agent execution failed")
                # 서브에이전트 실패도 step.completed(error) 로 마감해 대화 흐름을 유지한다.
                yield {"event": "step.completed", "data": {
                    "stepId": run_id,
                    "stepType": "agent",
                    "name": sub_name,
                    "nodeId": f"agent:{sub_name}",
                    "output": {"status": "error", "error": err_text,
                               "content": f"[서브에이전트 오류] {sub_name}: {err_text}"},
                    "latencyMs": latency_ms,
                    "parentStepId": parent_step_id,
                    "depth": ui_depth,
                }}
            else:
                err_text = str(error_obj or "Tool execution failed")
                # 도구 실패는 step.failed 가 아닌 step.completed(error) 로 emit 해
                # 채팅이 중단되지 않고 LLM 이 오류 메시지를 보고 다음 턴을 진행하게 한다.
                yield {"event": "step.completed", "data": {
                    "stepId": run_id,
                    "stepType": "tool",
                    "name": name,
                    "nodeId": f"tools:{name}",
                    "output": {"status": "error", "error": err_text,
                               "content": f"[도구 오류] '{name}' 실행 실패: {err_text}"},
                    "latencyMs": latency_ms,
                    "parentStepId": parent_step_id,
                    "depth": ui_depth,
                }}

        elif kind == "on_chain_start" and _should_show_chain(name, len(parent_ids)):
            step_started_at[run_id] = _time.monotonic()
            emitted_ids.add(run_id)
            yield {"event": "step.started", "data": {
                "stepId": run_id,
                "stepType": _get_step_type(name),
                "name": name,
                "nodeId": name,
                "input": _safe_serialize(data.get("input")),
                "parentStepId": parent_step_id,
                "depth": ui_depth,
            }}

        elif kind == "on_chain_end" and run_id in step_started_at:
            started = step_started_at.pop(run_id)
            latency_ms = int((_time.monotonic() - started) * 1000)
            yield {"event": "step.completed", "data": {
                "stepId": run_id,
                "stepType": _get_step_type(name),
                "name": name,
                "nodeId": name,
                "output": _safe_serialize(data.get("output")),
                "latencyMs": latency_ms,
                "parentStepId": parent_step_id,
                "depth": ui_depth,
            }}



def _extract_text_content(content: Any) -> str:
    """chunk.content 가 list 일 때(Anthropic 형식) text block 만 추출."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(str(block.get("text") or ""))
                elif block.get("text"):
                    parts.append(str(block["text"]))
        return "".join(parts)
    return str(content) if content is not None else ""



async def _extract_interrupt(graph: Any, run_config: dict[str, Any]) -> dict[str, Any] | None:
    """현재 그래프 상태에서 pending interrupt 정보를 추출한다.

    StateSnapshot 은 두 위치에 interrupt 를 보관한다:
      1. `state.interrupts` — 현 step 에서 pending 인 전역 interrupt (v0.6+ 권장)
      2. `state.tasks[*].interrupts` — 각 태스크 단위 interrupt (하위 호환)

    반환 형식:
        { "actionRequests": [{"name": str, "args": dict}, ...],
          "reviewConfigs":  [{"actionName": str, "allowedDecisions": [str]}, ...] }
    interrupt 가 없으면 None.
    """
    import structlog
    _log = structlog.get_logger(__name__)

    state = await graph.aget_state(run_config)

    # 1) 전역 state.interrupts (StateSnapshot v0.6+)
    state_interrupts = getattr(state, "interrupts", None) or ()
    # 2) tasks[*].interrupts
    tasks = getattr(state, "tasks", None) or ()
    task_interrupts: list[Any] = []
    for task in tasks:
        task_interrupts.extend(getattr(task, "interrupts", None) or ())

    # state.interrupts 와 tasks[*].interrupts 는 같은 interrupt 가 중복될 수 있으므로
    # id 기준으로 dedup
    seen_ids: set[str] = set()
    interrupts: list[Any] = []
    for itr in list(state_interrupts) + task_interrupts:
        itr_id = getattr(itr, "id", None)
        if itr_id is not None and itr_id in seen_ids:
            continue
        if itr_id is not None:
            seen_ids.add(itr_id)
        interrupts.append(itr)

    _log.info(
        "extract_interrupt",
        state_interrupt_count=len(state_interrupts),
        task_count=len(tasks),
        dedup_interrupt_count=len(interrupts),
        state_next=getattr(state, "next", None),
    )

    if not interrupts:
        return None

    action_requests: list[dict[str, Any]] = []
    review_configs: list[dict[str, Any]] = []
    for itr in interrupts:
        value = getattr(itr, "value", None)
        if value is None:
            continue
        if not isinstance(value, dict):
            _log.warning("extract_interrupt: non-dict value", value_type=type(value).__name__)
            continue
        for req in value.get("action_requests", []) or []:
            if isinstance(req, dict):
                action_requests.append({
                    "name": req.get("name", ""),
                    "args": req.get("args", {}) or {},
                })
        for cfg in value.get("review_configs", []) or []:
            if isinstance(cfg, dict):
                review_configs.append({
                    "actionName": cfg.get("action_name", ""),
                    "allowedDecisions": list(cfg.get("allowed_decisions", []) or []),
                })

    if not action_requests:
        _log.warning("extract_interrupt: interrupts found but no action_requests",
                     interrupt_count=len(interrupts))
        return None

    # SubAgent (task) 내부에서 발생한 인터럽트인지 확인 — 부모 task tool_call 의 args(description) 를
    # 함께 추출해 두면 HITL preview_edit 가 부모 description 도 자연어로 재작성할 수 있다.
    parent_task_args: dict[str, Any] | None = None
    state_messages = (getattr(state, "values", None) or {}).get("messages", []) or []
    for msg in reversed(state_messages):
        tool_calls = getattr(msg, "tool_calls", None)
        if not tool_calls:
            continue
        for tc in tool_calls:
            tc_name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
            if tc_name == "task":
                tc_args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", None)
                if isinstance(tc_args, dict):
                    parent_task_args = dict(tc_args)
                    break
        if parent_task_args is not None:
            break

    return {
        "actionRequests": action_requests,
        "reviewConfigs": review_configs,
        "parentTaskArgs": parent_task_args,
    }


async def stream_with_deepagent(
    loaded: dict[str, Any],
    thread_id: str,
    message: str,
    tools: list[BaseTool],
) -> AsyncGenerator[dict[str, Any], None]:
    """
    공식 deepagents 패키지로 에이전트를 실행하고 표준 이벤트를 yield한다.
    """
    import structlog
    logger = structlog.get_logger(__name__)

    guardrails_raw = dict(loaded.get("guardrailsConfig") or {})
    # outputSchema 는 Agent.outputSchema 컬럼이 표준 위치 — guardrailsConfig 와 통합.
    if not guardrails_raw.get("outputSchema") and loaded.get("outputSchema"):
        guardrails_raw["outputSchema"] = loaded.get("outputSchema")
    reasoning_raw = loaded.get("reasoningConfig") or {}
    memory_raw = loaded.get("memoryConfig") or {}
    tool_permissions = loaded.get("toolPermissions") or {}

    guardrails_cfg = _build_guardrails_cfg(guardrails_raw)
    input_guard = InputGuardrail(guardrails_cfg)
    output_guard = OutputGuardrail(guardrails_cfg)

    allowed, reason = input_guard.check(message)
    if not allowed:
        yield {"event": "error", "data": {"message": reason, "type": "guardrail_blocked"}}
        return

    resolved_prompt = resolve_system_prompt(
        loaded["systemPrompt"],
        agent_id=loaded["id"],
        agent_name=loaded["name"],
        agent_slug=loaded.get("slug", ""),
        agent_type=loaded.get("type", "single"),
        agent_description=loaded.get("description", ""),
        architecture=loaded["architecture"],
        model_id=loaded["modelId"],
        user_message=message,
        tools=tools,
        planning_config=loaded.get("planningConfig"),
        reasoning_config=reasoning_raw,
        guardrails_config=guardrails_raw,
    )
    # 외부 채널 요청자 정보(NAVER WORKS 1:1 등) — 있을 때만 prepend
    _thread_metadata = await _fetch_thread_metadata(thread_id)
    resolved_prompt = _today_header() + _requester_header(_thread_metadata) + resolved_prompt

    memory_cfg = MemoryConfig(
        strategy=memory_raw.get("strategy", "hybrid"),
        short_term_backend=memory_raw.get("shortTermBackend", "redis"),
        short_term_ttl_seconds=memory_raw.get("shortTermTtlSeconds", 3600),
        long_term_max_entries=memory_raw.get("maxEntries", 1000),
        summary_trigger_count=memory_raw.get("summaryTriggerCount", 20),
    )
    memory_mgr = MemoryManager(
        config=memory_cfg,
        agent_id=loaded["id"],
        redis_url=settings.redis_url,
        database_url=settings.DATABASE_URL,
    )
    context_messages = await memory_mgr.get_context(thread_id)
    if context_messages:
        context_str = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in context_messages)
        resolved_prompt += f"\n\n[이전 대화 컨텍스트]:\n{context_str}"

    # 한국어 기본값: 시스템 프롬프트에 언어 지정이 없으면 한국어 응답 강제
    if "한국어" not in resolved_prompt and "Korean" not in resolved_prompt:
        resolved_prompt += _KOREAN_INSTRUCTION

    # TODO 운영 규칙 — architecture 무관 동일 invariant. 도입부 한 줄만 mode별로 차별화.
    resolved_prompt += _todo_operating_rules_prompt(loaded.get("architecture"))

    # 메인 에이전트 스킬 내용 직접 주입 — read_file 단계를 건너뛰는 LLM 대응
    resolved_prompt = await _inject_main_skill_contents(
        resolved_prompt,
        skill_ids=loaded.get("skillIds") or [],
    )

    # 서브에이전트 위임 전략.
    # 기본: 선택 라우팅 — 요청에 적합한 서브에이전트만 task 도구로 호출 (deepagents 네이티브 동작).
    # systemPrompt 에 `[ALL_AGENTS]` 마커가 있으면 연결된 전체 서브에이전트를
    # BFS(depth-aware) 순서로 모두 순회 호출하도록 강제.
    graph_edges: list[dict[str, Any]] = loaded.get("graphEdges") or []
    sub_agent_specs: list[dict[str, Any]] = loaded.get("subAgentSpecs") or []
    if sub_agent_specs and "[ALL_AGENTS]" in resolved_prompt:
        # sanitize 된 이름을 사용 — task 도구의 subagent_type 과 일치시키기 위함
        node_id_to_name: dict[str, str] = {
            spec["id"]: sanitize_tool_name(spec["name"]) for spec in sub_agent_specs
        }
        adjacency: dict[str, list[str]] = {}
        if graph_edges:
            for edge in graph_edges:
                src = edge.get("source") or ""
                tgt = edge.get("target") or ""
                if src and tgt:
                    adjacency.setdefault(src, []).append(tgt)

        # BFS로 main에서 도달 가능한 sub-agent 호출 순서 및 depth 결정
        depth_map: dict[str, int] = {}
        visited_bfs: set[str] = set()
        queue_bfs: list[tuple[str, int]] = [("main", 0)]
        ordered_ids: list[str] = []
        while queue_bfs:
            cur, depth = queue_bfs.pop(0)
            if cur in visited_bfs:
                continue
            visited_bfs.add(cur)
            if cur != "main":
                ordered_ids.append(cur)
                depth_map[cur] = depth
            for child in adjacency.get(cur, []):
                if child not in visited_bfs:
                    queue_bfs.append((child, depth + 1))

        if not ordered_ids:
            ordered_ids = [spec["id"] for spec in sub_agent_specs]
            for nid in ordered_ids:
                depth_map[nid] = 1

        ordered_names = [node_id_to_name[nid] for nid in ordered_ids if nid in node_id_to_name]

        if ordered_names:
            count = len(ordered_names)
            # depth 1 = main의 직접 자식 (coordinator 등), depth 2+ = 그 자식 (researcher, writer 등)
            depth1_names = [node_id_to_name[nid] for nid in ordered_ids
                            if nid in node_id_to_name and depth_map.get(nid, 1) == 1]
            depth2_names = [node_id_to_name[nid] for nid in ordered_ids
                            if nid in node_id_to_name and depth_map.get(nid, 1) >= 2]

            if depth2_names:
                # 계층 구조: coordinator → researcher/writer
                coord_str = "·".join(depth1_names) if depth1_names else "coordinator"
                leaf_str = "·".join(depth2_names)
                steps_str = "\n".join(
                    f"  {i + 1}단계: task 도구로 '{n}' 호출"
                    for i, n in enumerate(ordered_names)
                )
                leaf_steps = "".join(
                    f"  {i + 2}단계: task 도구로 '{n}' 호출 (1단계 계획 + 이전 결과 포함)\n"
                    for i, n in enumerate(depth2_names)
                )
                resolved_prompt += (
                    f"\n\n[멀티 에이전트 실행 규칙 — 반드시 준수]\n\n"
                    f"이 작업은 아래 {count}개 에이전트를 모두 순서대로 호출해야 완료됩니다:\n"
                    + steps_str + "\n\n"
                    f"[단계별 역할]\n"
                    f"● {coord_str}: 계획 수립 전용. 직접 조사·작성 불가. 실행 계획만 반환.\n"
                    f"● {leaf_str}: 실제 조사·작성 담당. {coord_str}의 계획을 받아 각자 실행.\n\n"
                    f"[실행 순서]\n"
                    f"  1단계: task 도구로 '{depth1_names[0] if depth1_names else 'coordinator'}' 호출 → 계획 수령\n"
                    + leaf_steps +
                    f"\n[절대 금지 — 이 규칙을 어기면 작업 실패]\n"
                    f"● {coord_str} 한 번만 호출하고 작업 완료 처리 금지\n"
                    f"● {coord_str}가 조사·작성까지 했다고 가정 금지\n"
                    f"● task 도구 {count}회 모두 호출 완료 전 최종 답변 생성 절대 금지\n\n"
                    f"위 {count}단계 모두 완료된 후에만 최종 답변을 작성하세요."
                )
            else:
                # 평면 구조: 모든 서브에이전트가 depth 1
                steps = "\n".join(f"  {i + 1}. {n}" for i, n in enumerate(ordered_names))
                resolved_prompt += (
                    f"\n\n[멀티 에이전트 실행 규칙 — 필수]\n"
                    f"task 도구를 사용해 아래 {count}개 서브에이전트를 반드시 각각 별도로, 순서대로 호출하세요:\n"
                    + steps + "\n\n"
                    f"task 도구를 정확히 {count}번 호출해야 합니다 — 각 에이전트마다 한 번씩\n"
                    "모든 에이전트 호출 완료 후에만 최종 답변을 작성하세요.\n"
                )
    elif sub_agent_specs:
        # 기본 선택 라우팅 — 서브에이전트가 있으면 적극 위임하되, 무관한 것까지 전부 호출하진 않음.
        readable_names = "·".join(
            (spec.get("name") or spec.get("slug") or spec.get("id") or "")
            for spec in sub_agent_specs
        )
        resolved_prompt += (
            f"\n\n[서브에이전트 활용 규칙 — 적극 위임]\n"
            f"사용 가능한 서브에이전트: {readable_names}\n"
            f"- 요청과 조금이라도 관련된 서브에이전트가 있으면 직접 답하지 말고 반드시 task 도구로 위임하세요.\n"
            f"- 검색·조사·작성·설명·요약·파일 처리·외부 채널(메일/Slack 등) 등 전문 작업은 담당 서브에이전트에 위임하는 것이 원칙입니다.\n"
            f"- 여러 단계가 필요하면 적합한 서브에이전트들을 순서대로 호출해 결과를 취합하세요. (단, 무관한 에이전트까지 전부 호출할 필요는 없습니다.)\n"
            f"- main 이 직접 최종 답변을 작성하는 것은 어떤 서브에이전트도 관련 없는 경우(단순 인사·잡담 등)로 한정하세요.\n"
        )

    # 2.9 VFS 도구 필터링 (공식 내장 VFS와 충돌 방지)
    filtered_tools = filter_vfs_tools(tools)
    wrapped_tools, interrupt_on = _apply_tool_policies(filtered_tools, tool_permissions)

    # 2.9.1 execute 가용성 결정 — ToolsTab 의 `execute` 토글이 ON 일 때만 사용 가능.
    # deepagents `FilesystemMiddleware` 는 backend 가 SandboxBackendProtocol 미구현일 때
    # execute 도구를 자동 제거하므로(`filesystem.py: has_execute_tool and not backend_supports_execution`),
    # 토글 OFF 면 sandbox 를 비-execute wrapper 로 감싸 같은 효과를 낸다.
    # 토글 ON 일 때는 HITL 승인 게이트를 강제로 해제한다(요구사항: 활성화면 무승인 호출 허용).
    builtin_tool_ids: list[str] = loaded.get("builtinToolIds") or []
    execute_enabled = "execute" in builtin_tool_ids
    if execute_enabled:
        interrupt_on.pop("execute", None)

    step_limit = reasoning_raw.get("stepLimit", 40)
    # 서브에이전트가 있으면 서브에이전트도 동일 limit을 상속받으므로 충분히 확보
    # (서브에이전트 recursion_limit = 이 값 그대로 상속 — 서브에이전트 자체 step counter는 0부터 시작)
    if sub_agent_specs:
        step_limit = max(step_limit, 50)

    # 사용자 자격증명만 사용. 미등록 시 credential_missing emit + return.
    user_credentials: dict[str, str] = loaded.get("userCredentials") or {}
    provider_slug = loaded["providerSlug"]
    resolved_key, key_source = _resolve_provider_key(
        user_credentials, provider_slug, loaded.get("providerApiKey")
    )
    if not resolved_key:
        target_id = provider_slug or "unknown-provider"
        logger.warning("credential missing", agent_id=loaded["id"], target_id=target_id)
        yield {
            "event": "error",
            "data": {
                "message": f"{target_id} provider 자격증명이 등록되어 있지 않습니다. 도구 관리에서 등록해 주세요.",
                "type": "credential_missing",
                "details": {"kind": "provider", "targetId": target_id},
            },
        }
        return
    logger.info("provider key resolved", agent_id=loaded["id"], slug=provider_slug, source=key_source)

    model = _create_model(
        provider_slug=provider_slug,
        provider_api_key=resolved_key,
        model_id=loaded["modelId"],
        config=loaded.get("config") or {},
    )

    # Anthropic / OpenAI 모델의 bind_tools 에 병렬 도구 호출 비활성화 강제 적용
    # create_deep_agent()가 내부에서 bind_tools를 호출할 때 이 패치가 적용됨
    model = _patch_anthropic_no_parallel(model)
    model = _patch_openai_no_parallel(model)

    saver = await get_saver()

    # 2.2 create_deep_agent
    # `permissions=[]` 는 deepagents 기준 permissive default — VFS 도구(ls/read_file/write_file/edit_file/
    # glob/grep) 모두 허용. (`graph.py:if permissions:` 에서 빈 리스트는 falsy → PermissionMiddleware 미부착)
    # 서브에이전트 간 영속 공유는 backend 의 `/state/` 라우트(StateBackend) + Command(update={"files":...})
    # 패턴으로 처리 — gmail_search 가 자동으로 /state/last_gmail_search.json 에 결과를 영속화.
    # Phase 8: 공식 deepagents `subagents` 파라미터로 서브 에이전트 위임 자동화
    enriched_sub_specs = await _inject_skill_contents_to_specs(loaded.get("subAgentSpecs"))
    subagents_param = build_subagents(enriched_sub_specs)
    logger.info("create_deep_agent subagents",
                agent_id=loaded["id"],
                subagent_count=len(subagents_param),
                subagent_names=[s.get("name") for s in subagents_param])

    # Skills: SKILL.md 를 PostgresStore 에 동기화하고 backend/skills 인자로 전달
    main_skill_paths, skills_in_use = await _sync_skills_for_run(
        main_agent_id=loaded["id"],
        main_skill_ids=loaded.get("skillIds") or [],
        sub_agent_specs=loaded.get("subAgentSpecs"),
    )
    skills_store = await get_store() if skills_in_use else None
    if skills_in_use:
        logger.info("create_deep_agent skills",
                    agent_id=loaded["id"],
                    main_skill_paths=main_skill_paths,
                    sub_skill_count=sum(
                        1 for s in (loaded.get("subAgentSpecs") or []) if s.get("skillIds")
                    ))

    # Per-thread Docker sandbox: deepagents 가 sandbox 도구(execute/read_file/...)를 자동 추가.
    # 첨부가 있으면 SyncMiddleware 로 /workspace/ 에 매 turn 직전 업로드 + system_prompt 안내 보강.
    sandbox = await get_sandbox_manager().get_or_create(thread_id)
    thread_attachments = await attachments_service.list_for_thread(thread_id)
    thread_backend_factory = _make_thread_sandbox_backend(
        sandbox, skills_store, execute_enabled=execute_enabled
    )
    sandbox_middleware = AttachmentSyncMiddleware(thread_id, sandbox)
    file_text_middleware = FileBlockToTextMiddleware(provider_slug)
    if thread_attachments:
        resolved_prompt = resolved_prompt + build_attachment_hint(thread_attachments)
        # 첨부 분석은 read_file/execute/python 코드 작성·재시도가 반복돼 step 소진이 빠르다.
        step_limit = max(step_limit, 60)

    # 진단 로깅 — LLM 으로 최종 전달되는 system_prompt 의 길이 + 어떤 도구가 bind 되는지.
    # "system_prompt 가 strict 한데 LLM 이 도구 호출 안 함" 회귀를 정확히 분류하기 위함.
    try:
        _tool_names = [getattr(t, "name", str(t)) for t in (wrapped_tools or [])]
    except Exception:  # noqa: BLE001
        _tool_names = []
    logger.info(
        "deepagent.create_deep_agent",
        agent_id=loaded["id"],
        prompt_len=len(resolved_prompt or ""),
        prompt_head=(resolved_prompt or "")[:200],
        prompt_tail=(resolved_prompt or "")[-200:],
        tool_count=len(wrapped_tools or []),
        tool_names=_tool_names,
    )

    graph = create_deep_agent(
        model=model,
        tools=wrapped_tools,
        system_prompt=resolved_prompt,
        checkpointer=saver,
        interrupt_on=interrupt_on if interrupt_on else None,
        permissions=[],
        subagents=subagents_param or None,
        skills=main_skill_paths or None,
        backend=thread_backend_factory,
        store=skills_store,
        middleware=[sandbox_middleware, file_text_middleware],
    )

    run_config: dict[str, Any] = {
        "configurable": {"thread_id": thread_id},
        "recursion_limit": step_limit,
    }

    step_started_at: dict[str, float] = {}
    emitted_ids: set[str] = set()
    usage_acc: dict[str, int] = {"input_tokens": 0, "output_tokens": 0}
    streamed_content_len: int = 0
    defer_token_filter = bool(
        guardrails_cfg.output_filters
        or guardrails_cfg.pii_detection
        or (guardrails_cfg.json_schema_validation and guardrails_cfg.output_schema)
    )

    try:
        async for event in _pump_astream_events(
            graph,
            input_payload={"messages": [HumanMessage(content=message)]},
            run_config=run_config,
            output_guard=output_guard,
            step_started_at=step_started_at,
            emitted_ids=emitted_ids,
            logger=logger,
            defer_token_filter=defer_token_filter,
            usage_acc=usage_acc,
        ):
            if event["event"] == "token":
                streamed_content_len += len(event["data"].get("token", ""))
            yield event

        # 2.3b Interrupt 감지 — astream_events 는 interrupt 시 예외 없이 종료됨
        interrupt_info = await _extract_interrupt(graph, run_config)
        if interrupt_info is not None:
            now_mono = _time.monotonic()
            for open_step_id, started_at in list(step_started_at.items()):
                latency_ms = int((now_mono - started_at) * 1000)
                yield {"event": "step.completed", "data": {
                    "stepId": open_step_id,
                    "stepType": "middleware",
                    "name": "paused",
                    "nodeId": "paused",
                    "output": None,
                    "latencyMs": latency_ms,
                    "parentStepId": None,
                    "depth": 0,
                }}
                step_started_at.pop(open_step_id, None)
            yield {"event": "hitl.interrupt", "data": interrupt_info}
            return

        final_state = await graph.aget_state(run_config)
        final_messages_raw: list[BaseMessage] = list(final_state.values.get("messages", []))
        final_messages = _serialize_messages(final_messages_raw)
        if defer_token_filter:
            final_messages = _filter_last_assistant_message(final_messages, output_guard)

        # quick action(`다음 TODO 항목을 이어서 진행해줘 — XXX`) 패턴으로 들어온 turn 의 매칭 보정:
        # 모델이 write_todos 마킹을 누락하더라도 매칭되는 pending todo 를 in_progress 로 set 해
        # 직후 _sweep_final_todos 가 completed 로 변환되도록 한다.
        await _auto_mark_quick_action_target(graph, run_config, final_messages_raw, logger)

        # 최종 todos 상태 재발행 — graph state 에 있는 실제 상태를 한 번 더 emit해 마지막 update 누락을 보완.
        # turn 정상 완료 시점에 남은 'in_progress' 항목은 모델이 답변 직전 마킹을 누락한 것으로 간주하고
        # 자동 'completed' 로 sweep 한다. HITL interrupt 케이스는 이 블록 이전에 return 되므로 영향 없음.
        # pending 은 건드리지 않는다 (모델이 의도적으로 다음 turn 에 미룬 항목일 수 있음).
        # auto-mark 가 graph state 를 patch 한 경우 다시 aget_state 로 최신 todos 를 확보.
        final_state_refreshed = await graph.aget_state(run_config)
        final_todos = (
            final_state_refreshed.values.get("todos")
            if isinstance(final_state_refreshed.values, dict)
            else None
        )
        # sweep 정확도를 위해 답변 본문을 먼저 추출 — 모델이 in_progress 로 마킹했지만
        # 답변에 실제로 다루지 못한 항목까지 자동 completed 처리되는 것을 방지한다.
        last_answer_text = _last_assistant_content(final_messages) or ""
        if isinstance(final_todos, list) and final_todos:
            normalized = _sweep_final_todos(final_todos, last_answer_text)
            if normalized:
                yield {"event": "plan.created", "data": {"steps": normalized}}

        if guardrails_cfg.json_schema_validation and guardrails_cfg.output_schema:
            if last_answer_text:
                ok, reason = output_guard.validate_schema(last_answer_text)
                if not ok:
                    yield {"event": "error", "data": {"message": reason, "type": "guardrail_blocked"}}
                    return

        # 스트리밍이 동작하지 않은 경우(non-streaming 모델 또는 defer_token_filter 모드), aget_state에서 최종 AI 답변을 방출
        if streamed_content_len == 0:
            if not defer_token_filter:
                logger.warning("no streaming tokens, falling back to aget_state final message", agent_id=loaded["id"])
            for msg in reversed(final_messages_raw):
                if getattr(msg, "type", None) != "ai":
                    continue
                if getattr(msg, "tool_calls", None):
                    continue
                fallback_content = ""
                if isinstance(msg.content, str):
                    fallback_content = msg.content
                elif isinstance(msg.content, list):
                    for block in msg.content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            fallback_content += block.get("text", "")
                if fallback_content:
                    filtered = output_guard.filter(fallback_content)
                    yield {"event": "token", "data": {"token": filtered, "runStepId": "final-answer", "done": True}}
                    break

    except asyncio.CancelledError:
        # 사용자가 stop 을 눌러 task.cancel() 이 호출된 경로. graph state.todos 에서
        # 진행 중(in_progress) 이었던 항목을 pending 으로 되돌려, 다시 들어왔을 때
        # "끝나지 않은 작업이 완료처럼 보이는" 문제를 방지한다.
        try:
            await _revert_in_progress_todos_on_cancel(graph, run_config, logger)
        except Exception:  # noqa: BLE001
            logger.exception("cancel cleanup: revert todos failed")
        raise
    except GraphRecursionError:
        # recursion limit 도달 → 에러로 처리하지 않고 HITL "더 진행할까요?" 카드로 변환.
        # 다음 turn 사용자가 approve 하면 더 큰 limit 으로 graph 를 continue 한다.
        logger.info("recursion_limit_reached", agent_id=loaded["id"],
                    thread_id=thread_id, current_limit=step_limit)
        yield {"event": "recursion.limit_reached", "data": {
            "currentStepLimit": step_limit,
            "nextStepLimit": step_limit + 40,
        }}
        return
    except Exception as exc:
        logger.error("stream_with_deepagent error", agent_id=loaded["id"], error=str(exc))
        yield {"event": "error", "data": {"message": str(exc)}}
        return
    finally:
        await memory_mgr.close()

    from src.modules.runs.pricing import estimate_cost_db as _estimate_cost_init

    in_tok_init = int(usage_acc.get("input_tokens", 0))
    out_tok_init = int(usage_acc.get("output_tokens", 0))
    cost_init = await _estimate_cost_init(loaded.get("modelId") or "", in_tok_init, out_tok_init)

    yield {
        "event": "run.completed",
        "data": {
            "messages": final_messages,
            "state": {},
            "usage": {
                "inputTokens": in_tok_init,
                "outputTokens": out_tok_init,
                "totalTokens": in_tok_init + out_tok_init,
                "totalCost": cost_init,
                "modelId": loaded.get("modelId"),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    }


async def resume_stream_with_deepagent(
    loaded: dict[str, Any],
    thread_id: str,
    decisions: list[dict[str, Any]],
    tools: list[BaseTool],
    edit_context: str | None = None,
    task_description_update: str | None = None,
    continue_after_recursion: bool = False,
    requested_step_limit: int | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """HITL interrupt 재개 — 초기 실행과 동일한 이벤트 스트림을 yield한다.

    decisions 는 deepagents 포맷:
        [{"type": "approve"} | {"type": "reject"} | {"type": "edit", "edited_action": {...}}]

    continue_after_recursion=True 면 decisions 무시하고 input=None 으로 graph 를 checkpoint 에서
    이어 실행. recursion_limit 은 max(기본, requested_step_limit) 로 확장.
    """
    import structlog
    logger = structlog.get_logger(__name__)

    guardrails_raw = dict(loaded.get("guardrailsConfig") or {})
    # outputSchema 는 Agent.outputSchema 컬럼이 표준 위치 — guardrailsConfig 와 통합.
    if not guardrails_raw.get("outputSchema") and loaded.get("outputSchema"):
        guardrails_raw["outputSchema"] = loaded.get("outputSchema")
    reasoning_raw = loaded.get("reasoningConfig") or {}
    tool_permissions = loaded.get("toolPermissions") or {}

    guardrails_cfg = _build_guardrails_cfg(guardrails_raw)
    output_guard = OutputGuardrail(guardrails_cfg)

    resolved_prompt = resolve_system_prompt(
        loaded["systemPrompt"],
        agent_id=loaded["id"],
        agent_name=loaded["name"],
        agent_slug=loaded.get("slug", ""),
        agent_type=loaded.get("type", "single"),
        agent_description=loaded.get("description", ""),
        architecture=loaded["architecture"],
        model_id=loaded["modelId"],
        user_message="",
        tools=tools,
        planning_config=loaded.get("planningConfig"),
        reasoning_config=reasoning_raw,
        guardrails_config=guardrails_raw,
    )
    resolved_prompt = _today_header() + resolved_prompt

    resolved_prompt += _todo_operating_rules_prompt(loaded.get("architecture"))

    resolved_prompt = await _inject_main_skill_contents(
        resolved_prompt,
        skill_ids=loaded.get("skillIds") or [],
    )

    filtered_tools = filter_vfs_tools(tools)
    wrapped_tools, interrupt_on = _apply_tool_policies(filtered_tools, tool_permissions)
    builtin_tool_ids: list[str] = loaded.get("builtinToolIds") or []
    execute_enabled = "execute" in builtin_tool_ids
    if execute_enabled:
        interrupt_on.pop("execute", None)

    model = _create_model(
        provider_slug=loaded["providerSlug"],
        provider_api_key=loaded.get("providerApiKey"),
        model_id=loaded["modelId"],
        config=loaded.get("config") or {},
    )
    # resume 경우에도 동일하게 패치 적용
    model = _patch_anthropic_no_parallel(model)
    model = _patch_openai_no_parallel(model)

    saver = await get_saver()

    enriched_sub_specs_resume = await _inject_skill_contents_to_specs(loaded.get("subAgentSpecs"))
    subagents_param = build_subagents(enriched_sub_specs_resume)

    # Skills: resume 시에도 동일 backend/skills 인자 적용 (init 시 동기화된 store 재사용)
    main_skill_paths, skills_in_use = await _sync_skills_for_run(
        main_agent_id=loaded["id"],
        main_skill_ids=loaded.get("skillIds") or [],
        sub_agent_specs=loaded.get("subAgentSpecs"),
    )
    skills_store = await get_store() if skills_in_use else None

    # Resume 경로도 동일한 thread sandbox 재사용 (SandboxManager 가 idempotent).
    sandbox = await get_sandbox_manager().get_or_create(thread_id)
    thread_attachments = await attachments_service.list_for_thread(thread_id)
    thread_backend_factory = _make_thread_sandbox_backend(
        sandbox, skills_store, execute_enabled=execute_enabled
    )
    sandbox_middleware = AttachmentSyncMiddleware(thread_id, sandbox)
    file_text_middleware = FileBlockToTextMiddleware(loaded["providerSlug"])
    if thread_attachments:
        resolved_prompt = resolved_prompt + build_attachment_hint(thread_attachments)

    graph = create_deep_agent(
        model=model,
        tools=wrapped_tools,
        system_prompt=resolved_prompt,
        checkpointer=saver,
        interrupt_on=interrupt_on if interrupt_on else None,
        permissions=[],
        subagents=subagents_param or None,
        skills=main_skill_paths or None,
        backend=thread_backend_factory,
        store=skills_store,
        middleware=[sandbox_middleware, file_text_middleware],
    )

    resume_step_limit = reasoning_raw.get("stepLimit", 40)
    if subagents_param:
        resume_step_limit = max(resume_step_limit, 50)
    if thread_attachments:
        resume_step_limit = max(resume_step_limit, 60)
    run_config: dict[str, Any] = {
        "configurable": {"thread_id": thread_id},
        "recursion_limit": resume_step_limit,
    }

    step_started_at: dict[str, float] = {}
    emitted_ids: set[str] = set()
    usage_acc: dict[str, int] = {"input_tokens": 0, "output_tokens": 0}
    streamed_content_len: int = 0
    defer_token_filter = bool(
        guardrails_cfg.output_filters
        or guardrails_cfg.pii_detection
        or (guardrails_cfg.json_schema_validation and guardrails_cfg.output_schema)
    )

    # SubAgent (`task`) 내부 도구가 편집된 경우 부모 task.description 도 LLM 이 자연어로 재작성한
    # 버전으로 교체한다. 이전 마커 방식([사용자 수정 사항] X)은 LLM 패턴 복제·중복 누적 부작용이
    # 있어 폐기. 변경은 resume 종료 후 finally 에서 원본으로 되돌려 다음 턴 컨텍스트 오염도 방지.
    edit_revert_msg: Any = None
    # parent 의 마지막 HumanMessage 도 임시 보정(content 에 직접 수정 의도 안내 append) —
    # parent LLM 이 최종 답변할 때 원본 user 의도("하나")가 아닌 사용자가 직접 수정한 의도를
    # 따르도록 한다. finally 에서 원본으로 revert (다음 턴 오염 방지).
    edit_revert_user_msg: Any = None
    if task_description_update:
        try:
            from langchain_core.messages import AIMessage, HumanMessage
            current_state = await graph.aget_state(run_config)
            messages = (current_state.values or {}).get("messages", []) or []
            modified = False
            for i in range(len(messages) - 1, -1, -1):
                msg = messages[i]
                tool_calls = getattr(msg, "tool_calls", None)
                if not tool_calls:
                    continue
                new_tool_calls: list[dict[str, Any]] = []
                for tc in tool_calls:
                    tc_name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
                    tc_args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", {})
                    tc_id = tc.get("id") if isinstance(tc, dict) else getattr(tc, "id", None)
                    if tc_name == "task" and isinstance(tc_args, dict):
                        new_args = dict(tc_args)
                        new_args["description"] = task_description_update
                        new_tool_calls.append({"name": tc_name, "args": new_args, "id": tc_id})
                        modified = True
                    else:
                        new_tool_calls.append(
                            {"name": tc_name, "args": tc_args, "id": tc_id}
                            if isinstance(tc, dict)
                            else tc
                        )
                if modified:
                    edit_revert_msg = msg  # finally 복원용 원본 보존
                    new_msg = AIMessage(
                        id=getattr(msg, "id", None),
                        content=getattr(msg, "content", "") or "",
                        tool_calls=new_tool_calls,
                    )
                    await graph.aupdate_state(run_config, {"messages": [new_msg]})
                    logger.info(
                        "resume: task description 자연어 재작성 적용",
                        edit_prompt=edit_context,
                    )
                break

            # 부모 task tool_call 만 갱신하면 이미 invoke 된 SubAgent 의 초기 HumanMessage
            # (deepagents/middleware/subagents.py::_validate_and_prepare_state 가 생성) 는
            # 그대로라, ValidationError 등으로 SubAgent LLM 이 retry 할 때 원래 설명
            # ("최근 메일 하나" 등) 을 보고 max_results 같은 인자를 회귀시켜버린다.
            # → SubAgent state 의 첫 HumanMessage 를 같은 id 로 교체해 LLM 이 retry 시점에
            #   업데이트된 요청을 보도록 보강.
            if modified:
                try:
                    full_state = await graph.aget_state(run_config, subgraphs=True)
                    for task in (getattr(full_state, "tasks", None) or []):
                        sub_snapshot = getattr(task, "state", None)
                        if sub_snapshot is None:
                            continue
                        sub_values = getattr(sub_snapshot, "values", None) or {}
                        sub_messages = sub_values.get("messages") or []
                        if not sub_messages:
                            continue
                        first_msg = sub_messages[0]
                        if not isinstance(first_msg, HumanMessage):
                            continue
                        sub_config = getattr(sub_snapshot, "config", None)
                        if not sub_config:
                            continue
                        replacement = HumanMessage(
                            id=getattr(first_msg, "id", None),
                            content=task_description_update,
                        )
                        await graph.aupdate_state(sub_config, {"messages": [replacement]})
                        logger.info(
                            "resume: SubAgent initial HumanMessage 갱신",
                            old_preview=(getattr(first_msg, "content", "") or "")[:80],
                            new_preview=task_description_update[:80],
                        )
                        break
                except Exception as _sub_err:
                    logger.warning(
                        "resume: SubAgent state 갱신 실패 (무시)", error=str(_sub_err)
                    )

            # parent state 의 마지막 HumanMessage 에 직접 수정 의도 안내 append.
            # 이로써 parent LLM 이 SubAgent 결과를 받고 최종 답변할 때 원본 user 메시지의
            # 의도("하나")가 아닌 사용자가 직접 수정한 새 의도(예: "5개")를 따르도록 유도.
            # 별도 follow-up user 메시지를 visible 하게 보낼 필요 없음.
            if modified:
                try:
                    ref_state = await graph.aget_state(run_config)
                    ref_messages = (ref_state.values or {}).get("messages", []) or []
                    for i in range(len(ref_messages) - 1, -1, -1):
                        m = ref_messages[i]
                        if not isinstance(m, HumanMessage):
                            continue
                        edit_revert_user_msg = m
                        original_content = (
                            m.content if isinstance(m.content, str) else str(m.content)
                        )
                        new_content = (
                            original_content.rstrip()
                            + "\n\n[직접 수정된 새 의도 — 도구 인자가 사용자가 의도한 방향으로 갱신됨: "
                            + task_description_update
                            + "]"
                        )
                        new_human = HumanMessage(
                            id=getattr(m, "id", None),
                            content=new_content,
                        )
                        await graph.aupdate_state(run_config, {"messages": [new_human]})
                        logger.info(
                            "resume: parent user message 의도 보정 적용",
                            preview=task_description_update[:80],
                        )
                        break
                except Exception as _user_inject_err:
                    logger.warning(
                        "resume: parent user message 보정 실패 (무시)",
                        error=str(_user_inject_err),
                    )
        except Exception as _inject_err:
            logger.warning(
                "resume: task_description_update 적용 실패 (무시)", error=str(_inject_err)
            )

    if continue_after_recursion:
        # checkpoint 에서 이어 실행. input=None 이면 langgraph 가 마지막 상태부터 그래프 진행.
        input_payload: Any = None
        # 요청된 추가 step 한도 적용 (기존 한도와 max).
        if requested_step_limit is not None and requested_step_limit > resume_step_limit:
            resume_step_limit = requested_step_limit
            run_config["recursion_limit"] = resume_step_limit
            logger.info(
                "continue_after_recursion",
                agent_id=loaded["id"],
                thread_id=thread_id,
                new_recursion_limit=resume_step_limit,
            )
    else:
        input_payload = Command(resume={"decisions": decisions})

    try:
        async for event in _pump_astream_events(
            graph,
            input_payload=input_payload,
            run_config=run_config,
            output_guard=output_guard,
            step_started_at=step_started_at,
            emitted_ids=emitted_ids,
            logger=logger,
            defer_token_filter=defer_token_filter,
            usage_acc=usage_acc,
        ):
            if event["event"] == "token":
                streamed_content_len += len(event["data"].get("token", ""))
            yield event

        interrupt_info = await _extract_interrupt(graph, run_config)
        if interrupt_info is not None:
            now_mono = _time.monotonic()
            for open_step_id, started_at in list(step_started_at.items()):
                latency_ms = int((now_mono - started_at) * 1000)
                yield {"event": "step.completed", "data": {
                    "stepId": open_step_id,
                    "stepType": "middleware",
                    "name": "paused",
                    "nodeId": "paused",
                    "output": None,
                    "latencyMs": latency_ms,
                    "parentStepId": None,
                    "depth": 0,
                }}
                step_started_at.pop(open_step_id, None)
            yield {"event": "hitl.interrupt", "data": interrupt_info}
            return

        final_state = await graph.aget_state(run_config)
        final_messages_raw: list[BaseMessage] = list(final_state.values.get("messages", []))
        final_messages = _serialize_messages(final_messages_raw)
        if defer_token_filter:
            final_messages = _filter_last_assistant_message(final_messages, output_guard)

        # 최종 todos 상태 재발행 (resume 경로) — send 경로와 동일하게 답변 본문 기반 sweep 적용.
        final_todos = final_state.values.get("todos") if isinstance(final_state.values, dict) else None
        last_answer_text = _last_assistant_content(final_messages) or ""
        if isinstance(final_todos, list) and final_todos:
            normalized = _sweep_final_todos(final_todos, last_answer_text)
            if normalized:
                yield {"event": "plan.created", "data": {"steps": normalized}}

        if guardrails_cfg.json_schema_validation and guardrails_cfg.output_schema:
            if last_answer_text:
                ok, reason = output_guard.validate_schema(last_answer_text)
                if not ok:
                    yield {"event": "error", "data": {"message": reason, "type": "guardrail_blocked"}}
                    return

        if streamed_content_len == 0:
            for msg in reversed(final_messages_raw):
                if getattr(msg, "type", None) != "ai":
                    continue
                if getattr(msg, "tool_calls", None):
                    continue
                fallback_content = ""
                if isinstance(msg.content, str):
                    fallback_content = msg.content
                elif isinstance(msg.content, list):
                    for block in msg.content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            fallback_content += block.get("text", "")
                if fallback_content:
                    filtered = output_guard.filter(fallback_content)
                    yield {"event": "token", "data": {"token": filtered, "runStepId": "final-answer", "done": True}}
                    break
    except asyncio.CancelledError:
        try:
            await _revert_in_progress_todos_on_cancel(graph, run_config, logger)
        except Exception:  # noqa: BLE001
            logger.exception("cancel cleanup (resume): revert todos failed")
        raise
    except GraphRecursionError:
        logger.info("recursion_limit_reached (resume)", agent_id=loaded["id"],
                    thread_id=thread_id, current_limit=resume_step_limit)
        yield {"event": "recursion.limit_reached", "data": {
            "currentStepLimit": resume_step_limit,
            "nextStepLimit": resume_step_limit + 40,
        }}
        return
    except Exception as exc:
        logger.error("resume_stream_with_deepagent error", agent_id=loaded["id"], error=str(exc))
        yield {"event": "error", "data": {"message": str(exc)}}
        return
    finally:
        # 일시 주입한 edit_context 를 원본 AIMessage 로 복원
        # (영구 저장 시 다음 턴 LLM 이 [사용자 수정 사항] 패턴을 복제·재생산하는 문제 방지)
        if edit_revert_msg is not None:
            try:
                await graph.aupdate_state(run_config, {"messages": [edit_revert_msg]})
                logger.info("resume: edit_context 주입 원복 완료")
            except Exception as _revert_err:
                logger.warning("resume: edit_context 원복 실패 (무시)", error=str(_revert_err))
        # parent user message 임시 보정도 원본으로 복원 (다음 턴 컨텍스트 오염 방지)
        if edit_revert_user_msg is not None:
            try:
                await graph.aupdate_state(run_config, {"messages": [edit_revert_user_msg]})
                logger.info("resume: parent user message 의도 보정 원복 완료")
            except Exception as _r:
                logger.warning(
                    "resume: parent user message 원복 실패 (무시)", error=str(_r)
                )

    from src.modules.runs.pricing import estimate_cost_db as _estimate_cost_resume

    in_tok_r = int(usage_acc.get("input_tokens", 0))
    out_tok_r = int(usage_acc.get("output_tokens", 0))
    cost_r = await _estimate_cost_resume(loaded.get("modelId") or "", in_tok_r, out_tok_r)

    yield {
        "event": "run.completed",
        "data": {
            "messages": final_messages,
            "state": {},
            "usage": {
                "inputTokens": in_tok_r,
                "outputTokens": out_tok_r,
                "totalTokens": in_tok_r + out_tok_r,
                "totalCost": cost_r,
                "modelId": loaded.get("modelId"),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    }
