"""ThreadAttachment 영속화 서비스.

- 업로드: 디스크에 저장 + DB row 생성.
- 조회/삭제: thread 권한 검증 + 디스크 + DB 동기.
"""

from __future__ import annotations

import os
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from src.config import settings
from src.database.client import execute, execute_returning, fetch_all, fetch_one


@dataclass(frozen=True)
class StoredAttachment:
    id: str
    thread_id: str
    original_name: str
    mime_type: str
    size: int
    storage_path: str
    uploader_id: str | None
    created_at: datetime


def _safe_name(name: str) -> str:
    """디렉토리 분리자 및 path traversal 차단."""
    base = os.path.basename(name)
    base = base.replace("\x00", "")
    if not base or base in (".", ".."):
        return "file"
    return base[:200]


def _row_to_attachment(row: dict[str, Any]) -> StoredAttachment:
    return StoredAttachment(
        id=row["id"],
        thread_id=row["thread_id"],
        original_name=row["original_name"],
        mime_type=row["mime_type"],
        size=row["size"],
        storage_path=row["storage_path"],
        uploader_id=row.get("uploader_id"),
        created_at=row["created_at"],
    )


async def ensure_thread_exists(thread_id: str) -> None:
    row = await fetch_one("SELECT id FROM threads WHERE id = $1", (thread_id,))
    if not row:
        raise ValueError(f"Thread not found: {thread_id}")


async def save(
    thread_id: str,
    *,
    original_name: str,
    mime_type: str,
    content: bytes,
    uploader_id: str | None = None,
) -> StoredAttachment:
    if len(content) > settings.ATTACHMENT_MAX_BYTES:
        raise ValueError(
            f"Attachment too large ({len(content)} bytes, max {settings.ATTACHMENT_MAX_BYTES})"
        )
    await ensure_thread_exists(thread_id)

    attachment_id = uuid.uuid4().hex
    safe = _safe_name(original_name)
    rel_dir = os.path.join(settings.ATTACHMENT_STORAGE_DIR, thread_id)
    os.makedirs(rel_dir, exist_ok=True)
    storage_path = os.path.abspath(os.path.join(rel_dir, f"{attachment_id}-{safe}"))

    with open(storage_path, "wb") as f:
        f.write(content)

    row = await execute_returning(
        """
        INSERT INTO thread_attachments
            (id, thread_id, uploader_id, original_name, mime_type, size, storage_path)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, thread_id, uploader_id, original_name, mime_type, size, storage_path, created_at
        """,
        (
            attachment_id,
            thread_id,
            uploader_id,
            original_name,
            mime_type or "application/octet-stream",
            len(content),
            storage_path,
        ),
    )
    if not row:
        # DB 실패 시 디스크 파일도 정리
        try:
            os.remove(storage_path)
        except OSError:
            pass
        raise RuntimeError("Failed to insert thread_attachment row")
    return _row_to_attachment(row)


async def save_dedup(
    thread_id: str,
    *,
    original_name: str,
    mime_type: str,
    content: bytes,
    uploader_id: str | None = None,
) -> StoredAttachment:
    """동일 thread 에 (original_name, size) 가 같은 파일이 있으면 그것을 반환하고,
    없으면 새로 저장한다. 이메일 첨부 자동 저장의 반복 호출로 인한 중복을 방지."""
    target_size = len(content)
    for existing in await list_for_thread(thread_id):
        if existing.original_name == original_name and existing.size == target_size:
            return existing
    return await save(
        thread_id,
        original_name=original_name,
        mime_type=mime_type,
        content=content,
        uploader_id=uploader_id,
    )


async def list_for_thread(thread_id: str) -> list[StoredAttachment]:
    rows = await fetch_all(
        """
        SELECT id, thread_id, uploader_id, original_name, mime_type, size, storage_path, created_at
        FROM thread_attachments
        WHERE thread_id = $1
        ORDER BY created_at ASC
        """,
        (thread_id,),
    )
    return [_row_to_attachment(r) for r in rows]


async def get(attachment_id: str) -> StoredAttachment | None:
    row = await fetch_one(
        """
        SELECT id, thread_id, uploader_id, original_name, mime_type, size, storage_path, created_at
        FROM thread_attachments
        WHERE id = $1
        """,
        (attachment_id,),
    )
    return _row_to_attachment(row) if row else None


async def delete(attachment_id: str) -> bool:
    row = await fetch_one(
        "SELECT storage_path FROM thread_attachments WHERE id = $1",
        (attachment_id,),
    )
    if not row:
        return False
    try:
        os.remove(row["storage_path"])
    except FileNotFoundError:
        pass
    except OSError:
        pass
    await execute("DELETE FROM thread_attachments WHERE id = $1", (attachment_id,))
    return True


async def delete_all_for_thread(thread_id: str) -> int:
    items = await list_for_thread(thread_id)
    if not items:
        return 0
    storage_root = os.path.join(settings.ATTACHMENT_STORAGE_DIR, thread_id)
    if os.path.isdir(storage_root):
        shutil.rmtree(storage_root, ignore_errors=True)
    await execute("DELETE FROM thread_attachments WHERE thread_id = $1", (thread_id,))
    return len(items)


def read_bytes(attachment: StoredAttachment) -> bytes:
    with open(attachment.storage_path, "rb") as f:
        return f.read()
