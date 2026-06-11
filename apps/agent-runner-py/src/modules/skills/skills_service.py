"""deepagents 공식 PostgresStore 기반 Skills sync 서비스 (향후 create_deep_agent 연동용)"""
from datetime import datetime, timezone

import yaml

from src.database.client import execute, fetch_all
from src.modules.langgraph.store_service import get_store


class SkillsService:
    async def sync_agent_skills(self, agent_id: str, skill_ids: list[str]) -> None:
        """에이전트에 할당된 skills → PostgresStore 동기화.

        store 키는 `/<agent_id>/<skill>/SKILL.md` 형식으로 저장한다.
        deepagent_bridge 의 CompositeBackend 가 `/skills/` 라우트로 prefix 를
        strip 하여 StoreBackend 로 위임하므로, store 내부 키에는 `/skills/`
        prefix 를 포함하면 안 된다 (포함 시 ls 결과에 prefix 가 중복 부착됨).
        """
        if not skill_ids:
            return

        placeholders = ", ".join(f"${i + 1}" for i in range(len(skill_ids)))
        skills = await fetch_all(
            f"""
            SELECT s.id, s.name, s.description, s.instructions, s.allowed_tools,
                   sf.path AS file_path, sf.content AS file_content
            FROM skills s
            LEFT JOIN skill_files sf ON sf.skill_id = s.id
            WHERE s.id IN ({placeholders}) AND s.enabled = true
            """,
            tuple(skill_ids),
        )

        # skill_id별로 행 묶기
        skill_map: dict[str, dict[str, object]] = {}
        for row in skills:
            sid: str = row["id"]
            if sid not in skill_map:
                skill_map[sid] = {
                    "id": sid,
                    "name": row["name"],
                    "description": row["description"],
                    "instructions": row["instructions"],
                    "allowed_tools": row["allowed_tools"] or [],
                    "files": [],
                }
            if row["file_path"] is not None:
                files: list[dict[str, str]] = skill_map[sid]["files"]  # type: ignore[assignment]
                files.append({"path": row["file_path"], "content": row["file_content"] or ""})

        # setup()으로 store 테이블 생성 보장 후 기존 키 정리
        store = await get_store()
        await execute(
            "DELETE FROM store WHERE prefix = $1 AND (key LIKE $2 OR key LIKE $3)",
            ("filesystem", f"/{agent_id}/%", f"/skills/{agent_id}/%"),
        )
        now_iso = datetime.now(timezone.utc).isoformat()
        for skill in skill_map.values():
            base = f"/{agent_id}/{skill['name']}"
            await store.aput(
                namespace=("filesystem",),
                key=f"{base}/SKILL.md",
                value={"content": _build_skill_md(skill), "modified_at": now_iso},
            )
            for f in skill["files"]:  # type: ignore[union-attr]
                await store.aput(
                    namespace=("filesystem",),
                    key=f"{base}/{f['path']}",
                    value={"content": f["content"], "modified_at": now_iso},
                )


def _build_skill_md(skill: dict[str, object]) -> str:
    """Skill 행 데이터 → SKILL.md 문자열 변환.

    description 본문에 콜론 등 YAML 메타문자가 포함될 수 있으므로 yaml.safe_dump 로
    frontmatter 를 안전하게 직렬화한다 (수동 문자열 조립 시 파싱 실패하여 deepagents
    의 skill 인덱싱이 동작하지 않는 문제 회피).
    """
    allowed: list[str] = skill.get("allowed_tools") or []  # type: ignore[assignment]
    frontmatter: dict[str, object] = {
        "name": skill["name"],
        "description": skill["description"],
    }
    if allowed:
        frontmatter["allowed-tools"] = ", ".join(allowed)
    yaml_block = yaml.safe_dump(
        frontmatter,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
    return f"---\n{yaml_block}---\n\n{skill.get('instructions') or ''}"


skills_service = SkillsService()
