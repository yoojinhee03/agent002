"""Skill Assistant 서비스 — thread 세션 생성 + structured output 단일 호출.

설계: LangChain 의 `with_structured_output(AssistantResponse)` 단일 호출로
사용자의 자연어 요청 → 스킬 제안/수정을 한 번에 받는다.
카탈로그는 백엔드가 prefetch 해서 system prompt 에 직접 주입.
LLM 이 직접 DB 를 변경하지 않고, 제안 페이로드를 WS 이벤트로 emit.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
from typing import Any

import structlog
from langchain_core.messages import HumanMessage, SystemMessage

from src.database.client import fetch_all, fetch_one
from src.modules.skill_assistant import assistant_gateway
from src.modules.skill_assistant.assistant_prompt import build_system_prompt
from src.modules.skill_assistant.models import (
    AssistantResponse,
    CreateSessionResponse,
)
from src.modules.hitl.hitl_gateway import (
    emit_agent_token,
    emit_error,
    emit_turn_completed,
    emit_turn_started,
)
from src.modules.langgraph.graph_builder import _create_model
from src.modules.threads import threads_service

logger = structlog.get_logger(__name__)

_DEFAULT_MODEL_ID = os.getenv("ASSISTANT_DEFAULT_MODEL", "gpt-5.4")
_DEFAULT_PROVIDER_SLUG = "openai"
_ASSISTANT_LLM_TIMEOUT_S = float(os.getenv("ASSISTANT_LLM_TIMEOUT_S", "90"))

# 세션별 chat_history 저장
_chat_history_by_thread: dict[str, list[dict[str, str]]] = {}


def _split_model(model: str | None) -> tuple[str, str]:
    """`provider:modelId` 형식 또는 단순 modelId 형식을 (slug, model_id) 로 분해."""
    if not model:
        return _DEFAULT_PROVIDER_SLUG, _DEFAULT_MODEL_ID
    if ":" in model:
        slug, mid = model.split(":", 1)
        slug = slug.strip().lower() or _DEFAULT_PROVIDER_SLUG
        mid = mid.strip() or _DEFAULT_MODEL_ID
        return slug, mid
    mid = model.strip()
    if mid.startswith("claude"):
        return "anthropic", mid
    if mid.startswith("gemini"):
        return "google", mid
    return "openai", mid


async def _resolve_provider_api_key(slug: str, user_credentials: dict[str, str] | None) -> str | None:
    """user_credentials > providers 테이블 fallback."""
    if user_credentials:
        key = user_credentials.get(f"provider:{slug}")
        if key:
            return key
    row = await fetch_one(
        "SELECT api_key_encrypted FROM providers WHERE slug = $1 LIMIT 1",
        (slug,),
    )
    if row and row.get("api_key_encrypted"):
        return row["api_key_encrypted"]
    env_key = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "google": "GOOGLE_API_KEY",
    }.get(slug)
    if env_key:
        return os.getenv(env_key) or None
    return None


async def _prefetch_catalog(
    user_id: str, project_id: str | None = None
) -> dict[str, list[dict[str, str]]]:
    """builtin/mcp/skills/models 카탈로그를 한 번에 조회해 system_prompt 에 주입.

    builtin 은 프로젝트의 enabled_builtins (skill 편집 UI 와 동일 소스) 로 필터해,
    "편집에선 못 고르는데 어시스턴트로는 들어가는" 불일치를 차단한다.
    """
    enabled_builtin_set: set[str] | None = None
    if project_id:
        try:
            row = await fetch_one(
                "SELECT enabled_builtins FROM projects WHERE id = $1 LIMIT 1",
                (project_id,),
            )
            if row:
                raw = row.get("enabled_builtins") or []
                if isinstance(raw, list):
                    enabled_builtin_set = {str(x) for x in raw}
        except Exception:  # noqa: BLE001
            logger.exception(
                "skill_assistant.catalog enabled_builtins fetch failed",
                project_id=project_id,
            )

    try:
        from src.modules.builtin_tools.builtin_tools_service import _build_all

        builtin_tools_dict = _build_all(
            agent_id="skill-assistant-catalog", thread_id="skill-assistant-catalog"
        )
        builtin = [
            {
                "id": name,
                "name": name,
                "description": (tool.description or "")[:160],
            }
            for name, tool in sorted(builtin_tools_dict.items())
            if enabled_builtin_set is None or name in enabled_builtin_set
        ]
    except Exception:  # noqa: BLE001
        logger.exception("skill_assistant.catalog builtin build failed")
        builtin = []

    # MCP servers (connected only, project filter 없이)
    try:
        rows = await fetch_all(
            """
            SELECT id, name, description
            FROM mcp_servers
            WHERE status = 'connected'
            ORDER BY name ASC
            """,
            (),
        )
        mcp = [
            {
                "id": r["id"],
                "name": r["name"],
                "description": (r.get("description") or "")[:160],
            }
            for r in rows
        ]
    except Exception:  # noqa: BLE001
        logger.exception("skill_assistant.catalog mcp failed")
        mcp = []

    # Skills (user scope — 이름 중복 회피)
    try:
        rows = await fetch_all(
            """
            SELECT id, name, description
            FROM skills
            WHERE user_id = $1
            ORDER BY name ASC
            """,
            (user_id,),
        )
        skills = [
            {
                "id": r["id"],
                "name": r["name"],
                "description": (r.get("description") or "")[:160],
            }
            for r in rows
        ]
    except Exception:  # noqa: BLE001
        logger.exception("skill_assistant.catalog skills failed")
        skills = []

    # Models (enabled)
    try:
        rows = await fetch_all(
            """
            SELECT m.model_id AS id, m.name, p.slug AS provider_slug
            FROM models m JOIN providers p ON p.id = m.provider_id
            WHERE m.enabled = true
            ORDER BY p.slug, m.model_id
            """,
            (),
        )
        models = [
            {
                "id": r["id"],
                "name": r["name"],
                "description": f"provider={r.get('provider_slug')}",
            }
            for r in rows
        ]
    except Exception:  # noqa: BLE001
        logger.exception("skill_assistant.catalog models failed")
        models = []

    logger.info(
        "skill_assistant.catalog prefetched",
        builtin=len(builtin),
        mcp=len(mcp),
        skills=len(skills),
        models=len(models),
    )
    return {
        "builtin": builtin,
        "mcp": mcp,
        "skills": skills,
        "models": models,
    }


async def _load_target_skill(skill_id: str, user_id: str) -> dict[str, Any] | None:
    """skills 테이블에서 스킬 조회 + user_id 검증."""
    row = await fetch_one(
        """
        SELECT id, name, description, instructions, allowed_tools, enabled
        FROM skills
        WHERE id = $1
        LIMIT 1
        """,
        (skill_id,),
    )
    if not row:
        return None
    # user_id 검증 — 다른 사용자의 스킬이면 None 반환
    owner_row = await fetch_one(
        "SELECT user_id FROM skills WHERE id = $1 LIMIT 1",
        (skill_id,),
    )
    if not owner_row or owner_row.get("user_id") != user_id:
        logger.warning(
            "skill_assistant.load_target_skill user mismatch",
            skill_id=skill_id,
            user_id=user_id,
        )
        return None

    # skill_files JOIN
    file_rows = await fetch_all(
        "SELECT path, content FROM skill_files WHERE skill_id = $1",
        (skill_id,),
    )
    files = [{"path": r["path"], "content": r.get("content") or ""} for r in file_rows]

    allowed_tools = row.get("allowed_tools")
    if isinstance(allowed_tools, str):
        try:
            allowed_tools = json.loads(allowed_tools)
        except Exception:  # noqa: BLE001
            allowed_tools = []

    return {
        "id": row["id"],
        "name": row.get("name"),
        "description": row.get("description"),
        "instructions": row.get("instructions"),
        "allowed_tools": list(allowed_tools or []),
        "enabled": row.get("enabled"),
        "files": files,
    }


def _format_tools_brief(catalog: dict[str, Any]) -> str:
    builtin = catalog.get("builtin") or []
    mcp = catalog.get("mcp") or []
    lines: list[str] = []
    for tool in builtin[:20]:
        name = tool.get("name") or tool.get("id") or ""
        desc = (tool.get("description") or "")[:80].replace("\n", " ")
        if name:
            lines.append(f"- {name}: {desc}")
    for server in mcp[:10]:
        name = server.get("name") or ""
        if name:
            lines.append(f"- {name} (MCP)")
    return "\n".join(lines) if lines else "(없음)"


def _format_skills_brief(catalog: dict[str, Any]) -> str:
    skills = catalog.get("skills") or []
    names = [s.get("name") for s in skills if s.get("name")]
    if not names:
        return "(없음)"
    return ", ".join(names[:30])


def _format_current_brief(current_skill: dict[str, Any] | None) -> str:
    if not current_skill:
        return "(없음 — 새 스킬 생성 모드)"
    name = current_skill.get("name") or "(이름 없음)"
    allowed = current_skill.get("allowed_tools") or []
    files = current_skill.get("files") or []
    return f"{name} (도구 {len(allowed)}개 / 파일 {len(files)}개)"


async def _resolve_user_project(user_id: str) -> str | None:
    """사용자가 멤버로 속한 첫 번째 project_id 조회.

    projects 테이블은 user_id 컬럼이 없고, project_members 테이블이 email 로 사용자와 연결된다.
    skill_assistant 의 thread.project_id NOT NULL 제약을 만족하기 위해 사용자가 접근 가능한
    임의의 project 한 개를 선택한다. skill 자체는 user-scoped 이므로 project 선택은 thread
    저장 용도일 뿐.
    """
    row = await fetch_one(
        """
        SELECT pm.project_id AS id
        FROM project_members pm
        JOIN users u ON u.email = pm.email
        WHERE u.id = $1
        ORDER BY pm.joined_at ASC NULLS LAST, pm.invited_at ASC NULLS LAST
        LIMIT 1
        """,
        (user_id,),
    )
    if row and row.get("id"):
        return row["id"]
    # fallback: 어떤 project 든 한 개 (시드 데이터 / 단일 사용자 환경 대비)
    row = await fetch_one(
        "SELECT id FROM projects ORDER BY created_at ASC LIMIT 1",
        (),
    )
    return row["id"] if row else None


async def create_session(
    user_id: str | None,
    model: str | None,
    skill_id: str | None,
    mode: str = "auto",
) -> CreateSessionResponse:
    slug, model_id = _split_model(model)

    if not user_id:
        raise ValueError("user_id 가 필요합니다. 로그인 후 다시 시도해 주세요.")

    project_id = await _resolve_user_project(user_id)
    if not project_id:
        raise ValueError("user 의 project 가 없습니다 — 먼저 project 를 생성하세요.")

    effective_mode = mode if mode in ("auto", "builder", "analyze") else "auto"
    metadata: dict[str, Any] = {
        "kind": "skill_assistant",
        "targetSkillId": skill_id,
        "model": f"{slug}:{model_id}",
        "mode": effective_mode,
    }
    thread = await threads_service.create(
        project_id=project_id,
        agent_id=None,
        title="Skill Assistant Session",
        user_id=user_id,
        metadata=metadata,
    )
    _chat_history_by_thread[thread["id"]] = []
    return CreateSessionResponse(
        threadId=thread["id"],
        targetSkillId=skill_id,
        model=f"{slug}:{model_id}",
        mode=effective_mode,
    )


async def _get_session_context(thread_id: str) -> dict[str, Any]:
    thread = await threads_service.get(thread_id)
    metadata = thread.get("metadata") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:  # noqa: BLE001
            metadata = {}
    if metadata.get("kind") != "skill_assistant":
        raise ValueError(f"Thread {thread_id} 는 skill_assistant 세션이 아닙니다.")
    return {
        "projectId": thread.get("projectId"),
        "targetSkillId": metadata.get("targetSkillId"),
        "model": metadata.get("model"),
        "mode": metadata.get("mode", "auto"),
    }


async def stream(
    thread_id: str,
    user_message: str,
    user_credentials: dict[str, str] | None = None,
    user_id: str | None = None,
    mode_override: str | None = None,
) -> None:
    """Skill Assistant 1턴 실행. 토큰/이벤트 emit 은 모두 WS 룸으로 발행."""
    turn_id = f"skill-assistant-{uuid.uuid4().hex[:10]}"
    logger.info("skill_assistant.stream begin", thread_id=thread_id, turn_id=turn_id)

    try:
        ctx = await _get_session_context(thread_id)
    except Exception as e:  # noqa: BLE001
        logger.exception("skill_assistant.session lookup failed", thread_id=thread_id)
        await emit_error(thread_id, f"skill_assistant 세션 조회 실패: {e}", "skill_assistant_session_missing")
        return

    target_skill_id = ctx.get("targetSkillId")
    model = ctx.get("model")
    # 턴별 override 가 있으면 그것을 사용, 없으면 세션 metadata 의 mode 사용
    session_mode = ctx.get("mode", "auto")
    effective_mode = mode_override if mode_override in ("auto", "builder", "analyze") else session_mode

    if not user_id:
        await emit_error(thread_id, "로그인 사용자 정보가 필요합니다.", "skill_assistant_user_missing")
        return

    slug, model_id = _split_model(model)
    api_key = await _resolve_provider_api_key(slug, user_credentials)
    if not api_key:
        await emit_error(
            thread_id,
            f"{slug} provider 자격증명이 등록되어 있지 않습니다. 도구 관리에서 등록해 주세요.",
            "credential_missing",
        )
        return

    chat_history = _chat_history_by_thread.setdefault(thread_id, [])

    # 1) 카탈로그 prefetch
    await assistant_gateway.emit_step(
        thread_id, phase="thinking", label="사용 가능한 도구 카탈로그 조회 중…"
    )
    catalog = await _prefetch_catalog(user_id, ctx.get("projectId"))
    await assistant_gateway.emit_step(
        thread_id,
        phase="thinking",
        label=(
            f"도구 {len(catalog.get('builtin') or [])}개 / MCP {len(catalog.get('mcp') or [])}개 / "
            f"기존 스킬 {len(catalog.get('skills') or [])}개 확인 완료"
        ),
    )

    # 2) 대상 스킬 로드 (편집 모드일 때만)
    current_skill: dict[str, Any] | None = None
    if target_skill_id:
        await assistant_gateway.emit_step(
            thread_id, phase="thinking", label="현재 스킬 정보 불러오는 중…"
        )
        current_skill = await _load_target_skill(target_skill_id, user_id)
        if not current_skill:
            logger.warning(
                "skill_assistant.stream target_skill not found or forbidden",
                thread_id=thread_id,
                target_skill_id=target_skill_id,
            )

    # 3) 사용자 메시지 chat_history 누적
    chat_history.append({"role": "user", "content": user_message})

    # 4) 시스템 프롬프트 생성
    await assistant_gateway.emit_step(
        thread_id, phase="thinking", label="요청 분석 및 프롬프트 구성 중…"
    )
    system_prompt = build_system_prompt(
        catalog=catalog,
        session_model_id=model_id,
        current_skill=current_skill,
        chat_history=chat_history,
        mode=effective_mode,
    )

    # OpenAI reasoning 모델(o1/o3/o4/o5) 분기 — temperature 미지원
    mid_lower = (model_id or "").lower()
    is_openai_reasoning = slug == "openai" and (
        mid_lower.startswith("o1")
        or mid_lower.startswith("o3")
        or mid_lower.startswith("o4")
        or mid_lower.startswith("o5")
    )
    model_config: dict[str, Any] = {"maxTokens": 4096}
    if not is_openai_reasoning:
        model_config["temperature"] = 0.2

    try:
        model_obj = _create_model(
            provider_slug=slug,
            provider_api_key=api_key,
            model_id=model_id,
            config=model_config,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("skill_assistant.model_init failed", model=model)
        await emit_error(thread_id, f"모델 초기화 실패: {e}", "skill_assistant_model_init_failed")
        return

    await emit_turn_started(thread_id, turn_id)
    step_id = f"skill-assistant-step-{uuid.uuid4().hex[:8]}"

    # 5a) 분석/추론 단계 — LLM 이 사용자 요청을 어떻게 이해했는지 평문으로 스트리밍.
    # 추가: 마지막 줄에 [INTENT: chat|structured] 태그를 출력하게 해서 의도를 분류한다.
    #  - chat   → 자유 텍스트 답변 필요 → 5c 에서 plain astream 으로 실시간 스트리밍
    #  - structured → 카드 페이로드 필요 → 5b 에서 with_structured_output 호출
    reasoning_text = ""
    detected_intent: str = "structured"  # 기본값. reasoning 비활성/실패 시 structured 로 흐름.
    if os.getenv("SKILL_ASSISTANT_REASONING", "1") != "0":
        await assistant_gateway.emit_step(
            thread_id, phase="thinking", label="1/4 · 요청 의도 분석 중…"
        )
        reasoning_prompt = (
            "사용자 요청을 짧게 분석하고 답하라.\n"
            "- 어떤 종류의 스킬을 만들/수정할지 1~2문장으로 정리.\n"
            "- 어떤 도구(allowed_tools 후보)가 적절한지 카탈로그에서 골라 이유와 함께.\n"
            "- 어떤 파일(scripts/docs/templates)을 추가하면 좋을지 후보 제안.\n"
            "총 3~6문장 한국어 평문. 마크다운 헤더는 쓰지 마라.\n\n"
            "**마지막에 반드시 다음 HTML 주석 중 하나를 정확히 출력하라 (시스템 파싱용, 화면에 표시 안 됨):**\n"
            "- `<!--INTENT:chat-->` — 사용자가 질문·설명·평가·비교·잡담을 요청해 자유 텍스트 답변이 필요한 경우\n"
            "- `<!--INTENT:structured-->` — 사용자가 새 스킬 생성/편집/분석 카드를 원하는 경우\n\n"
            f"[참고 — 도구 카탈로그]\n{_format_tools_brief(catalog)}\n"
            f"[참고 — 기존 스킬]\n{_format_skills_brief(catalog)}\n"
            f"[참고 — 현재 스킬]\n{_format_current_brief(current_skill)}\n"
        )
        chunk_count = 0
        emitted_chars = 0
        try:
            async for chunk in model_obj.astream(
                [
                    SystemMessage(content=reasoning_prompt),
                    HumanMessage(content=user_message),
                ]
            ):
                chunk_count += 1
                raw = getattr(chunk, "content", "")
                if isinstance(raw, list):
                    # Anthropic / 일부 모델은 content 가 [{"type":"text","text":"..."}] 형식.
                    text = "".join(
                        (c.get("text", "") if isinstance(c, dict) else str(c)) for c in raw
                    )
                elif isinstance(raw, str):
                    text = raw
                else:
                    text = str(raw or "")
                if text:
                    emitted_chars += len(text)
                    reasoning_text += text
                    if emitted_chars - len(text) == 0:
                        # 첫 토큰 도착 — 단계 라벨을 진행 중으로 갱신.
                        await assistant_gateway.emit_step(
                            thread_id, phase="thinking", label="2/4 · 분석 결과 스트리밍 중…"
                        )
                    await emit_agent_token(
                        thread_id=thread_id, turn_id=turn_id, step_id=step_id,
                        content=text, delta=True, done=False,
                    )
            logger.info(
                "skill_assistant reasoning stream done",
                thread_id=thread_id,
                chunks=chunk_count,
                chars=emitted_chars,
            )
            if emitted_chars == 0:
                # astream 이 빈 응답을 반환한 경우 — ainvoke 로 폴백해 분석 결과를 한 번에 emit.
                logger.warning(
                    "skill_assistant reasoning astream yielded no chars — fallback to ainvoke",
                    thread_id=thread_id, chunks=chunk_count,
                )
                await assistant_gateway.emit_step(
                    thread_id, phase="thinking",
                    label="2/4 · 분석 결과 일괄 생성 중…",
                )
                try:
                    full = await asyncio.wait_for(
                        model_obj.ainvoke(
                            [
                                SystemMessage(content=reasoning_prompt),
                                HumanMessage(content=user_message),
                            ]
                        ),
                        timeout=30,
                    )
                    raw = getattr(full, "content", "") or ""
                    if isinstance(raw, list):
                        raw = "".join(
                            (c.get("text", "") if isinstance(c, dict) else str(c)) for c in raw
                        )
                    if raw:
                        reasoning_text += raw
                        # 가독성을 위해 50자 정도 단위로 쪼개 발행 — 일괄이라도 점진 표시 효과.
                        i = 0
                        chunk_size = 60
                        while i < len(raw):
                            await emit_agent_token(
                                thread_id=thread_id, turn_id=turn_id, step_id=step_id,
                                content=raw[i : i + chunk_size], delta=True, done=False,
                            )
                            i += chunk_size
                            await asyncio.sleep(0.02)
                    else:
                        await emit_agent_token(
                            thread_id=thread_id, turn_id=turn_id, step_id=step_id,
                            content="(분석 결과가 비어 있어 결과 생성만 진행합니다.)\n",
                            delta=True, done=False,
                        )
                except Exception as e:  # noqa: BLE001
                    logger.exception(
                        "skill_assistant reasoning ainvoke fallback failed", thread_id=thread_id
                    )
                    await emit_agent_token(
                        thread_id=thread_id, turn_id=turn_id, step_id=step_id,
                        content=f"(분석 단계 폴백 실패: {e}. 결과 생성만 진행합니다.)\n",
                        delta=True, done=False,
                    )
            # 분석 ↔ 결과 시각 구분 — 한 줄 띄움 + 구분선
            await emit_agent_token(
                thread_id=thread_id, turn_id=turn_id, step_id=step_id,
                content="\n\n---\n\n", delta=True, done=False,
            )
        except Exception as e:  # noqa: BLE001
            logger.exception("skill_assistant reasoning stream failed", thread_id=thread_id)
            await emit_agent_token(
                thread_id=thread_id, turn_id=turn_id, step_id=step_id,
                content=f"(분석 단계 실패: {e}. 결과 생성만 진행합니다.)\n\n",
                delta=True, done=False,
            )
            # 실패해도 본 구조화 호출은 계속 진행

        # reasoning 텍스트에서 intent 태그 파싱 — 화면에는 안 보이는 HTML 주석 형태.
        intent_match = re.search(
            r"<!--\s*INTENT\s*:\s*(chat|structured)\s*-->",
            reasoning_text,
            re.IGNORECASE,
        )
        if intent_match:
            detected_intent = intent_match.group(1).lower()
        # 모드 강제: analyze 모드의 answer_directly 도 chat 으로 처리 가능. builder 모드도 동일.
        # 단, mode override 가 명시되어 있으면 그 의도를 우선:
        # - builder/analyze 명시 시에도 chat 응답(clarify/answer_directly)은 plain astream 으로 흘림.
        logger.info(
            "skill_assistant intent detected",
            thread_id=thread_id,
            intent=detected_intent,
            effective_mode=effective_mode,
        )

    # 5b) chat intent 일 때 → plain astream 으로 직접 텍스트 응답을 실시간 스트리밍.
    if detected_intent == "chat":
        await assistant_gateway.emit_step(
            thread_id,
            phase="generating",
            label=f"3/4 · {slug.upper()} {model_id} 로 답변 작성 중…",
        )
        chat_system = (
            "당신은 AgentStudio 의 Skill Assistant 입니다. 사용자에게 친절하고 명확한 한국어로 답하세요.\n"
            "이미 의도가 'chat' 으로 분류됐으므로 자유 텍스트 답변만 출력합니다. JSON 이나 카드 페이로드는 만들지 마세요.\n"
            "필요하면 마크다운(목록·강조)을 사용해도 됩니다. 짧고 명확하게.\n\n"
            f"[참고 — 도구 카탈로그]\n{_format_tools_brief(catalog)}\n"
            f"[참고 — 기존 스킬]\n{_format_skills_brief(catalog)}\n"
            f"[참고 — 현재 스킬]\n{_format_current_brief(current_skill)}\n"
        )
        # chat history 누적 (이전 대화 컨텍스트 보존)
        history_msgs: list[Any] = [SystemMessage(content=chat_system)]
        for h in chat_history[-10:]:
            role = h.get("role")
            content = h.get("content") or ""
            if role == "user":
                history_msgs.append(HumanMessage(content=content))
            else:
                history_msgs.append(SystemMessage(content=f"[이전 답변]\n{content}"))
        history_msgs.append(HumanMessage(content=user_message))

        answer_chunks: list[str] = []
        try:
            async for chunk in model_obj.astream(history_msgs):
                raw = getattr(chunk, "content", "")
                if isinstance(raw, list):
                    text = "".join(
                        (c.get("text", "") if isinstance(c, dict) else str(c)) for c in raw
                    )
                elif isinstance(raw, str):
                    text = raw
                else:
                    text = str(raw or "")
                if text:
                    answer_chunks.append(text)
                    await emit_agent_token(
                        thread_id=thread_id, turn_id=turn_id, step_id=step_id,
                        content=text, delta=True, done=False,
                    )
        except Exception as e:  # noqa: BLE001
            logger.exception("skill_assistant chat astream failed", thread_id=thread_id)
            msg = f"답변 생성 실패: {e}"
            await emit_error(thread_id, msg, "skill_assistant_chat_runtime_error")
            await emit_agent_token(
                thread_id=thread_id, turn_id=turn_id, step_id=step_id,
                content=msg, delta=True, done=False,
            )
            await emit_agent_token(
                thread_id=thread_id, turn_id=turn_id, step_id=step_id,
                content="", delta=True, done=True,
            )
            await emit_turn_completed(thread_id, turn_id, msg)
            return

        full_answer = "".join(answer_chunks).strip()
        if not full_answer:
            full_answer = "(빈 답변)"
        chat_history.append({"role": "user", "content": user_message})
        chat_history.append({"role": "assistant", "content": full_answer})
        await emit_agent_token(
            thread_id=thread_id, turn_id=turn_id, step_id=step_id,
            content="", delta=True, done=True,
        )
        await emit_turn_completed(thread_id, turn_id, full_answer)
        await assistant_gateway.emit_session_complete(
            thread_id=thread_id, summary=full_answer[:160],
        )
        return

    # 5c) structured output 단일 호출 (card 가 필요한 경우)
    # 이 시점엔 아직 action(create/edit/clarify/answer_directly/analyze) 을 모르지만
    # mode 와 target_skill_id 로 가장 가능성 높은 의도를 추정한다.
    #  - mode=analyze     → 분석 카드 생성 의도
    #  - mode=builder     → 스킬 초안/수정안 생성 의도 (LLM 이 clarify 로 빠질 수도
    #                       있으나 빈도 낮음)
    #  - mode=auto        → 단정적 라벨 대신 중립 "응답 생성 중" — auto 는 의도가
    #                       사용자 메시지에 따라 갈리므로 4/4 라벨에서 확정.
    if effective_mode == "analyze":
        _intent_label = "스킬 분석 결과 작성 중…"
    elif effective_mode == "builder":
        _intent_label = (
            "스킬 수정안 작성 중…" if target_skill_id else "스킬 초안 작성 중…"
        )
    else:
        _intent_label = "응답 생성 중…"
    await assistant_gateway.emit_step(
        thread_id,
        phase="generating",
        label=f"3/4 · {slug.upper()} {model_id} 로 {_intent_label}",
    )
    designer = model_obj.with_structured_output(AssistantResponse)

    async def _emit_error_and_close(message: str, error_type: str) -> None:
        await emit_error(thread_id, message, error_type)
        await emit_agent_token(
            thread_id=thread_id, turn_id=turn_id, step_id=step_id,
            content=message, delta=False, done=False,
        )
        await emit_agent_token(
            thread_id=thread_id, turn_id=turn_id, step_id=step_id,
            content="", delta=True, done=True,
        )
        await emit_turn_completed(thread_id, turn_id, message)

    try:
        resp: AssistantResponse = await asyncio.wait_for(
            designer.ainvoke(
                [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_message),
                ]
            ),
            timeout=_ASSISTANT_LLM_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "skill_assistant.designer invoke timeout",
            thread_id=thread_id,
            timeout_s=_ASSISTANT_LLM_TIMEOUT_S,
        )
        await _emit_error_and_close(
            f"Skill Assistant 응답이 {int(_ASSISTANT_LLM_TIMEOUT_S)}초 안에 도착하지 않아 중단했어요. 모델/네트워크 상태를 확인하고 다시 시도해주세요.",
            "skill_assistant_llm_timeout",
        )
        return
    except Exception as e:  # noqa: BLE001
        logger.exception("skill_assistant.designer invoke failed", thread_id=thread_id)
        await _emit_error_and_close(
            f"Skill Assistant 호출 실패: {e}",
            "skill_assistant_runtime_error",
        )
        return

    logger.info(
        "skill_assistant.stream response received",
        thread_id=thread_id,
        action=resp.action,
    )

    # mode 강제 fallback — 모드 제약 위반 action 을 answer_directly 로 변환
    effective_action = resp.action
    if effective_mode == "analyze" and resp.action in ("create_skill", "edit_skill"):
        logger.warning(
            "skill_assistant.mode_fallback analyze→answer_directly",
            thread_id=thread_id,
            original_action=resp.action,
        )
        effective_action = "answer_directly"
        resp = resp.model_copy(update={
            "action": "answer_directly",
            "direct_answer": "분석 모드에서는 수정 제안을 보내지 않습니다. 빌더 모드로 전환 후 다시 시도해주세요.",
        })
    elif effective_mode == "builder" and resp.action == "analyze_skill":
        logger.warning(
            "skill_assistant.mode_fallback builder→answer_directly",
            thread_id=thread_id,
            original_action=resp.action,
        )
        effective_action = "answer_directly"
        resp = resp.model_copy(update={
            "action": "answer_directly",
            "direct_answer": "빌더 모드에서는 분석 카드를 보내지 않습니다. 분석 모드로 전환 후 다시 시도해주세요.",
        })

    # action 별 진행 라벨
    _action_label = {
        "create_skill": "4/4 · 새 스킬 초안 정리 중…",
        "edit_skill": "4/4 · 수정 사항 정리 중…",
        "clarify": "4/4 · 추가 질문 작성 중…",
        "answer_directly": "4/4 · 답변 작성 중…",
        "analyze_skill": "4/4 · 스킬 분석 결과 정리 중…",
    }.get(resp.action, "4/4 · 응답 정리 중…")
    await assistant_gateway.emit_step(thread_id, phase="finalizing", label=_action_label)

    async def _maybe_emit_choices() -> None:
        """resp.choices 가 있으면 인라인 빠른 선택 버튼을 발행."""
        if resp.choices:
            await assistant_gateway.emit_choices_offered(
                thread_id,
                [c.model_dump(by_alias=False) for c in resp.choices],
            )

    async def _emit_text_only(text: str) -> None:
        """평문만 emit 하고 turn 종료 (clarify / answer_directly 공통)."""
        chat_history.append({"role": "assistant", "content": text})
        await emit_agent_token(
            thread_id=thread_id, turn_id=turn_id, step_id=step_id,
            content=text, delta=False, done=False,
        )
        await emit_agent_token(
            thread_id=thread_id, turn_id=turn_id, step_id=step_id,
            content="", delta=True, done=True,
        )
        await emit_turn_completed(thread_id, turn_id, text)

    # ─── action 분기 ────────────────────────────────────────────────────────
    if resp.action == "clarify":
        q = resp.clarification_question or "스킬 내용을 조금 더 구체적으로 알려주세요."
        await _emit_text_only(q)
        await _maybe_emit_choices()
        return

    if resp.action == "answer_directly":
        ans = resp.direct_answer or "도움이 필요하시면 만들고 싶은 스킬을 알려주세요."
        await _emit_text_only(ans)
        await _maybe_emit_choices()
        return

    if resp.action == "create_skill":
        nsd = resp.new_skill
        if not nsd:
            await _emit_text_only(
                "만들 스킬의 이름·설명·instructions 를 더 구체적으로 알려주세요."
            )
            return
        # snake_case → camelCase 변환
        skill_payload: dict[str, Any] = {
            "name": nsd.name,
            "description": nsd.description,
            "instructions": nsd.instructions,
            "allowedTools": nsd.allowed_tools,
            "files": [{"path": f.path, "content": f.content} for f in nsd.files],
        }
        summary = (
            resp.summary
            or f"'{nsd.name}' 스킬을 제안했습니다. 아래 카드에서 [적용]을 눌러 저장하세요."
        )
        logger.info(
            "skill_assistant.stream create_skill proposed",
            thread_id=thread_id,
            skill_name=nsd.name,
        )
        await assistant_gateway.emit_skill_proposed(thread_id, skill_payload)
        await _emit_text_only(summary)
        await _maybe_emit_choices()
        # 다음 턴(개선 요청 등)에서 이전 제안을 참조할 수 있도록 스냅샷을 chat_history 에 보존.
        chat_history.append(
            {
                "role": "assistant",
                "content": (
                    "[이전에 제안한 스킬 초안 — 사용자가 개선 요청 시 이를 base 로 다시 다듬어라.]\n"
                    + json.dumps(skill_payload, ensure_ascii=False, indent=2)
                ),
            }
        )
        await assistant_gateway.emit_session_complete(thread_id=thread_id, summary=summary)
        return

    if resp.action == "edit_skill":
        if not target_skill_id:
            fallback = "편집 모드에서만 스킬을 수정할 수 있습니다. 새 스킬을 만들고 싶으시면 알려주세요."
            await _emit_text_only(fallback)
            return
        edit = resp.edit_changes
        if not edit:
            await _emit_text_only("수정할 내용을 더 구체적으로 알려주세요.")
            return
        # 변경된 필드만 camelCase dict 로 변환
        edit_payload: dict[str, Any] = {}
        if edit.name is not None:
            edit_payload["name"] = edit.name
        if edit.description is not None:
            edit_payload["description"] = edit.description
        if edit.instructions is not None:
            edit_payload["instructions"] = edit.instructions
        if edit.allowed_tools is not None:
            edit_payload["allowedTools"] = edit.allowed_tools
        if edit.add_files:
            edit_payload["addFiles"] = [{"path": f.path, "content": f.content} for f in edit.add_files]
        if edit.remove_file_paths:
            edit_payload["removeFilePaths"] = edit.remove_file_paths
        if edit.change_summary is not None:
            edit_payload["changeSummary"] = edit.change_summary

        summary = (
            resp.summary
            or edit.change_summary
            or "수정 사항을 제안했습니다. 아래 카드에서 [적용]을 눌러 주세요."
        )
        logger.info(
            "skill_assistant.stream edit_skill proposed",
            thread_id=thread_id,
            target_skill_id=target_skill_id,
            changed_fields=list(edit_payload.keys()),
        )
        await assistant_gateway.emit_skill_edit_proposed(thread_id, edit_payload, target_skill_id)
        await _emit_text_only(summary)
        await _maybe_emit_choices()
        # 개선 요청 대비 chat_history 에 스냅샷 보존.
        chat_history.append(
            {
                "role": "assistant",
                "content": (
                    "[이전에 제안한 스킬 수정 패치 — 사용자가 개선 요청 시 이를 base 로 다시 다듬어라.]\n"
                    + json.dumps(edit_payload, ensure_ascii=False, indent=2)
                ),
            }
        )
        await assistant_gateway.emit_session_complete(thread_id=thread_id, summary=summary)
        return

    if resp.action == "analyze_skill":
        if not resp.analysis:
            await _emit_text_only("분석할 내용을 더 구체적으로 알려주세요.")
            return
        analysis = resp.analysis
        # target_skill_id 가 비어 있으면 현재 컨텍스트로 fallback
        if not analysis.target_skill_id and target_skill_id:
            analysis = analysis.model_copy(update={"target_skill_id": target_skill_id})
        payload = analysis.model_dump(by_alias=False)
        logger.info(
            "skill_assistant.analyze_skill emitted",
            thread_id=thread_id,
            target_skill_id=analysis.target_skill_id,
            score=analysis.overall_score,
        )
        await assistant_gateway.emit_skill_analyzed(thread_id, payload)
        summary = resp.summary or "스킬 분석 결과를 제공했어요. 카드에서 확인하세요."
        await _emit_text_only(summary)
        await _maybe_emit_choices()
        chat_history.append(
            {
                "role": "assistant",
                "content": (
                    "[이전 분석 결과 스냅샷 — 다음 턴 참고용]\n"
                    + json.dumps(payload, ensure_ascii=False)
                ),
            }
        )
        await assistant_gateway.emit_session_complete(thread_id=thread_id, summary=summary)
        return
