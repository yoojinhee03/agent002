"""Skills CRUD 도구 8종 — Agent 가 LLM 도구 호출로 사용자 Skill 을 CRUD.

설계:
- user_id 컨텍스트로 권한 격리. user_id 없으면 모든 도구가 에러 반환.
- DB 직접 접근(`fetch_one`/`fetch_all`/`execute_returning`) — skill_assistant 와 동일 패턴.
- 카탈로그 도구(`skill.catalog`)는 LLM 이 도구 선택 시 참고용.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from src.database.client import execute, execute_returning, fetch_all, fetch_one
from src.modules.builtin_tools.custom_tools.base import (
    CustomToolProperties,
    build_custom_tool,
)


def _no_user_error(tool_name: str) -> str:
    return (
        f"[{tool_name}] user_id 컨텍스트가 없어 이 도구를 실행할 수 없습니다. "
        "agent 실행 컨텍스트에 user_id 가 전달되어야 합니다."
    )


# ─── Pydantic 인자 스키마 ──────────────────────────────────────────────


class _ListArgs(BaseModel):
    limit: int = Field(default=50, ge=1, le=200, description="반환할 최대 개수")


class _GetArgs(BaseModel):
    skill_id: str = Field(..., description="조회할 스킬의 UUID")


class _FileArg(BaseModel):
    path: str
    content: str


class _CreateArgs(BaseModel):
    name: str = Field(..., description="스킬 이름 (사용자별 고유)")
    description: str = Field(default="")
    instructions: str = Field(default="", description="실행 단계 markdown")
    allowed_tools: list[str] = Field(default_factory=list)
    files: list[_FileArg] = Field(default_factory=list)


class _UpdateArgs(BaseModel):
    skill_id: str
    name: str | None = None
    description: str | None = None
    instructions: str | None = None
    allowed_tools: list[str] | None = None


class _DeleteArgs(BaseModel):
    skill_id: str


class _AddFileArgs(BaseModel):
    skill_id: str
    path: str
    content: str


class _DeleteFileArgs(BaseModel):
    skill_id: str
    path: str


# ─── 도구 빌더들 ──────────────────────────────────────────────


def build_skill_list_tool(user_id: str | None) -> BaseTool:
    async def _run(limit: int = 50) -> str:
        if not user_id:
            return _no_user_error("skill.list")
        rows = await fetch_all(
            "SELECT id, name, description, enabled, updated_at FROM skills "
            "WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2",
            (user_id, limit),
        )
        return json.dumps(
            [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "description": r.get("description") or "",
                    "enabled": r.get("enabled", True),
                }
                for r in rows
            ],
            ensure_ascii=False,
        )

    return build_custom_tool(
        CustomToolProperties(
            name="skill.list",
            description="현재 사용자의 스킬 목록을 반환한다. 신규 스킬 생성 전 이름 중복 확인 등에 사용.",
            args_schema=_ListArgs,
        ),
        coroutine=_run,
    )


def build_skill_get_tool(user_id: str | None) -> BaseTool:
    async def _run(skill_id: str) -> str:
        if not user_id:
            return _no_user_error("skill.get")
        row = await fetch_one(
            "SELECT id, user_id, name, description, instructions, allowed_tools, enabled "
            "FROM skills WHERE id = $1 LIMIT 1",
            (skill_id,),
        )
        if not row:
            return json.dumps({"error": "not_found", "skill_id": skill_id})
        if row["user_id"] != user_id:
            return json.dumps({"error": "forbidden", "skill_id": skill_id})
        files = await fetch_all(
            "SELECT path, content FROM skill_files WHERE skill_id = $1 ORDER BY path",
            (skill_id,),
        )
        allowed_tools = row.get("allowed_tools") or []
        if isinstance(allowed_tools, str):
            try:
                allowed_tools = json.loads(allowed_tools)
            except Exception:  # noqa: BLE001
                allowed_tools = []
        return json.dumps(
            {
                "id": row["id"],
                "name": row["name"],
                "description": row.get("description") or "",
                "instructions": row.get("instructions") or "",
                "allowedTools": list(allowed_tools),
                "enabled": row.get("enabled", True),
                "files": [{"path": f["path"], "content": f["content"]} for f in files],
            },
            ensure_ascii=False,
        )

    return build_custom_tool(
        CustomToolProperties(
            name="skill.get",
            description="스킬 ID 로 단일 스킬의 상세 정보(instructions/도구/파일 포함)를 조회한다.",
            args_schema=_GetArgs,
        ),
        coroutine=_run,
    )


def build_skill_create_tool(user_id: str | None) -> BaseTool:
    async def _run(
        name: str,
        description: str = "",
        instructions: str = "",
        allowed_tools: list[str] | None = None,
        files: list[dict[str, str]] | None = None,
    ) -> str:
        if not user_id:
            return _no_user_error("skill.create")
        dup = await fetch_one(
            "SELECT id FROM skills WHERE user_id = $1 AND name = $2 LIMIT 1",
            (user_id, name),
        )
        if dup:
            return json.dumps(
                {"error": "duplicate_name", "name": name, "existing_id": dup["id"]}
            )
        skill_id = str(uuid.uuid4())
        await execute_returning(
            "INSERT INTO skills (id, user_id, name, description, instructions, allowed_tools, enabled, created_at, updated_at) "
            "VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW()) RETURNING id",
            (skill_id, user_id, name, description, instructions, list(allowed_tools or [])),
        )
        for f in files or []:
            path = f.get("path") if isinstance(f, dict) else getattr(f, "path", None)
            content = (
                f.get("content") if isinstance(f, dict) else getattr(f, "content", "")
            )
            if not path:
                continue
            await execute(
                "INSERT INTO skill_files (id, skill_id, path, content, created_at, updated_at) "
                "VALUES ($1, $2, $3, $4, NOW(), NOW()) "
                "ON CONFLICT (skill_id, path) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()",
                (str(uuid.uuid4()), skill_id, path, content or ""),
            )
        return json.dumps({"ok": True, "id": skill_id, "name": name}, ensure_ascii=False)

    return build_custom_tool(
        CustomToolProperties(
            name="skill.create",
            description=(
                "새 스킬을 생성한다. allowed_tools 는 카탈로그(skill.catalog)에 존재하는 "
                "이름만 사용. files 는 [{path, content}] 형식."
            ),
            args_schema=_CreateArgs,
        ),
        coroutine=_run,
    )


def build_skill_update_tool(user_id: str | None) -> BaseTool:
    async def _run(
        skill_id: str,
        name: str | None = None,
        description: str | None = None,
        instructions: str | None = None,
        allowed_tools: list[str] | None = None,
    ) -> str:
        if not user_id:
            return _no_user_error("skill.update")
        row = await fetch_one(
            "SELECT user_id FROM skills WHERE id = $1 LIMIT 1", (skill_id,)
        )
        if not row:
            return json.dumps({"error": "not_found", "skill_id": skill_id})
        if row["user_id"] != user_id:
            return json.dumps({"error": "forbidden", "skill_id": skill_id})
        # 동적 SET 절 빌드
        sets: list[str] = []
        vals: list[Any] = []
        idx = 1
        for col, val in (
            ("name", name),
            ("description", description),
            ("instructions", instructions),
        ):
            if val is not None:
                sets.append(f"{col} = ${idx}")
                vals.append(val)
                idx += 1
        if allowed_tools is not None:
            sets.append(f"allowed_tools = ${idx}")
            vals.append(list(allowed_tools))
            idx += 1
        if not sets:
            return json.dumps({"ok": True, "id": skill_id, "noop": True})
        sets.append("updated_at = NOW()")
        vals.append(skill_id)
        await execute(
            f"UPDATE skills SET {', '.join(sets)} WHERE id = ${idx}",
            tuple(vals),
        )
        return json.dumps({"ok": True, "id": skill_id}, ensure_ascii=False)

    return build_custom_tool(
        CustomToolProperties(
            name="skill.update",
            description="기존 스킬의 필드를 부분 업데이트한다. 변경할 필드만 인자로 전달.",
            args_schema=_UpdateArgs,
        ),
        coroutine=_run,
    )


def build_skill_delete_tool(user_id: str | None) -> BaseTool:
    async def _run(skill_id: str) -> str:
        if not user_id:
            return _no_user_error("skill.delete")
        row = await fetch_one(
            "SELECT user_id FROM skills WHERE id = $1 LIMIT 1", (skill_id,)
        )
        if not row:
            return json.dumps({"error": "not_found", "skill_id": skill_id})
        if row["user_id"] != user_id:
            return json.dumps({"error": "forbidden", "skill_id": skill_id})
        await execute("DELETE FROM skills WHERE id = $1", (skill_id,))
        return json.dumps({"ok": True, "id": skill_id})

    return build_custom_tool(
        CustomToolProperties(
            name="skill.delete",
            description="스킬을 영구 삭제한다. 첨부 파일도 cascade 로 함께 삭제.",
            args_schema=_DeleteArgs,
        ),
        coroutine=_run,
    )


def build_skill_add_file_tool(user_id: str | None) -> BaseTool:
    async def _run(skill_id: str, path: str, content: str) -> str:
        if not user_id:
            return _no_user_error("skill.add_file")
        row = await fetch_one(
            "SELECT user_id FROM skills WHERE id = $1 LIMIT 1", (skill_id,)
        )
        if not row:
            return json.dumps({"error": "not_found", "skill_id": skill_id})
        if row["user_id"] != user_id:
            return json.dumps({"error": "forbidden", "skill_id": skill_id})
        await execute(
            "INSERT INTO skill_files (id, skill_id, path, content, created_at, updated_at) "
            "VALUES ($1, $2, $3, $4, NOW(), NOW()) "
            "ON CONFLICT (skill_id, path) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()",
            (str(uuid.uuid4()), skill_id, path, content),
        )
        return json.dumps({"ok": True, "skill_id": skill_id, "path": path})

    return build_custom_tool(
        CustomToolProperties(
            name="skill.add_file",
            description="스킬에 파일을 추가하거나 같은 경로의 기존 파일 내용을 덮어쓴다.",
            args_schema=_AddFileArgs,
        ),
        coroutine=_run,
    )


def build_skill_delete_file_tool(user_id: str | None) -> BaseTool:
    async def _run(skill_id: str, path: str) -> str:
        if not user_id:
            return _no_user_error("skill.delete_file")
        row = await fetch_one(
            "SELECT user_id FROM skills WHERE id = $1 LIMIT 1", (skill_id,)
        )
        if not row:
            return json.dumps({"error": "not_found", "skill_id": skill_id})
        if row["user_id"] != user_id:
            return json.dumps({"error": "forbidden", "skill_id": skill_id})
        await execute(
            "DELETE FROM skill_files WHERE skill_id = $1 AND path = $2",
            (skill_id, path),
        )
        return json.dumps({"ok": True, "skill_id": skill_id, "path": path})

    return build_custom_tool(
        CustomToolProperties(
            name="skill.delete_file",
            description="스킬의 특정 파일을 삭제한다.",
            args_schema=_DeleteFileArgs,
        ),
        coroutine=_run,
    )


def build_skill_catalog_tool(user_id: str | None) -> BaseTool:
    """builtin/MCP/skills/models 카탈로그 조회 — LLM 이 도구 선택 시 참고."""

    async def _run() -> str:
        # builtin tools — 자기 자신 카탈로그를 안전하게 빌드하기 위해 임시 컨텍스트 사용
        try:
            from src.modules.builtin_tools.builtin_tools_service import _build_all

            builtin_tools_dict = _build_all(
                agent_id="skill-catalog-stub",
                thread_id="skill-catalog-stub",
                user_id=user_id,
            )
            builtin = [
                {"name": name, "description": (tool.description or "")[:160]}
                for name, tool in sorted(builtin_tools_dict.items())
            ]
        except Exception as e:  # noqa: BLE001
            builtin = [{"error": f"builtin load failed: {e}"}]

        # MCP 서버 (connected)
        try:
            rows = await fetch_all(
                "SELECT id, name, description FROM mcp_servers WHERE status = 'connected' ORDER BY name ASC",
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
            mcp = []

        # 기존 스킬 (이름 중복 회피용)
        skills: list[dict[str, Any]] = []
        if user_id:
            try:
                rows = await fetch_all(
                    "SELECT id, name, description FROM skills WHERE user_id = $1 ORDER BY name ASC",
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
                pass

        return json.dumps(
            {"builtin": builtin, "mcp": mcp, "skills": skills},
            ensure_ascii=False,
        )

    return build_custom_tool(
        CustomToolProperties(
            name="skill.catalog",
            description=(
                "사용 가능한 builtin 도구·MCP 서버·기존 스킬 카탈로그를 조회한다. "
                "skill.create 호출 전 allowed_tools 후보 선정에 사용."
            ),
        ),
        coroutine=_run,
    )


def build_skill_ops_tools(user_id: str | None) -> list[BaseTool]:
    """Skills CRUD 도구 8종을 한 번에 반환."""
    return [
        build_skill_list_tool(user_id),
        build_skill_get_tool(user_id),
        build_skill_create_tool(user_id),
        build_skill_update_tool(user_id),
        build_skill_delete_tool(user_id),
        build_skill_add_file_tool(user_id),
        build_skill_delete_file_tool(user_id),
        build_skill_catalog_tool(user_id),
    ]
