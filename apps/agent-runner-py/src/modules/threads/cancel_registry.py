"""thread_id ↔ 진행 중 asyncio.Task 매핑을 보관해 응답 중지(stop)를 지원한다.

단일 프로세스 환경에서 in-memory dict 로 동작한다. 다중 worker 환경에서는
Redis pub/sub 등 외부 채널이 필요하다 — 현재 dev/single-instance 한정.
"""
from __future__ import annotations

import asyncio

import structlog

_registry: dict[str, asyncio.Task] = {}
_log = structlog.get_logger(__name__)


def register(thread_id: str, task: asyncio.Task) -> None:
    """현재 task 를 thread_id 키로 등록. 이전 등록은 덮어쓴다."""
    _registry[thread_id] = task


def unregister(thread_id: str) -> None:
    _registry.pop(thread_id, None)


def cancel(thread_id: str) -> bool:
    """등록된 task 를 cancel 한다. 등록이 없거나 이미 완료된 경우 False."""
    task = _registry.get(thread_id)
    if task is None or task.done():
        return False
    task.cancel()
    _log.info("cancel_registry: task cancel requested", thread_id=thread_id)
    return True


def is_running(thread_id: str) -> bool:
    """thread 의 task 가 등록되어 있고 아직 완료되지 않은 상태인지."""
    task = _registry.get(thread_id)
    return task is not None and not task.done()
