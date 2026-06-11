"""Per-thread Docker sandbox backend for deepagents.

deepagents `SandboxBackendProtocol` 을 docker SDK 로 구현한다.
스레드 단위로 컨테이너 1개를 띄워 첨부 파일 보관 + 코드 실행 공간으로 사용.

흐름:
    - `SandboxManager.get_or_create(thread_id)` → 컨테이너 lazy 생성 후 `DockerSandbox` 반환.
    - deepagents 가 `execute`/`upload_files`/`download_files` 호출 → `docker exec` / `put_archive` / `get_archive`.
    - 일정 시간 idle 시 백그라운드 작업이 stop+remove.

참조: https://docs.langchain.com/oss/python/deepagents/backends
      https://docs.langchain.com/oss/python/deepagents/sandboxes
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import tarfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from deepagents.backends.protocol import (
    ExecuteResponse,
    FileDownloadResponse,
    FileUploadResponse,
)
from deepagents.backends.sandbox import BaseSandbox
from docker.errors import APIError, ImageNotFound, NotFound

import docker

logger = logging.getLogger(__name__)


# prebuilt 이미지: pypdf/pymupdf/python-docx/openpyxl/pandas/matplotlib/pillow 등 사전 설치.
# Dockerfile: apps/agent-runner-py/docker/sandbox/Dockerfile
# 빌드: `pnpm sandbox:build` 또는 SandboxManager 가 missing 시 자동 빌드.
SANDBOX_IMAGE = "agentstudio-sandbox:0.1"
SANDBOX_DOCKERFILE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "docker",
    "sandbox",
)
SANDBOX_WORKDIR = "/workspace"
SANDBOX_LABEL_KEY = "agentstudio.sandbox.thread_id"
DEFAULT_EXEC_TIMEOUT_S = 120
DEFAULT_MEMORY_MB = 512
DEFAULT_CPU_QUOTA = 100_000  # 1 CPU (us per 100ms period)
DEFAULT_IDLE_TTL_S = 30 * 60  # 30 min
SWEEP_INTERVAL_S = 60

# 컨테이너 안의 npm/uv 캐시 경로를 host 의 named volume 으로 마운트하여
# thread 간 패키지 다운로드를 공유한다 (HOME=/root 기준).
NPM_CACHE_VOLUME = "agentstudio-npm-cache"
UV_CACHE_VOLUME = "agentstudio-uv-cache"
# OAuth 흐름이 있는 MCP 서버가 컨테이너 안에서 띄우는 콜백 포트.
# bridge 네트워크 모드에서 host 의 임의 포트로 동적 매핑된다.
SANDBOX_OAUTH_CALLBACK_PORT = 9876


def _get_extra_mounts_spec() -> str:
    """``SANDBOX_EXTRA_MOUNTS`` settings 값을 lazy 로드 — 순환 import 회피."""
    try:
        from src.config import settings

        return settings.SANDBOX_EXTRA_MOUNTS or ""
    except Exception:  # noqa: BLE001
        return os.environ.get("SANDBOX_EXTRA_MOUNTS", "")


def _parse_extra_mounts(spec: str) -> dict[str, dict[str, str]]:
    """``SANDBOX_EXTRA_MOUNTS`` env 문자열을 docker volumes dict 로 파싱.

    형식: ``<src>:<dst>[:<mode>],<src>:<dst>[:<mode>],...``
    - mode 기본 ``ro``
    - 절대경로가 아니거나 형식 불일치 항목은 경고 후 무시
    - dst 중복 시 뒤 항목이 앞을 덮어쓰며 경고
    """
    import os as _os

    out: dict[str, dict[str, str]] = {}
    if not spec:
        return out
    dst_seen: dict[str, str] = {}
    for raw in spec.split(","):
        item = raw.strip()
        if not item:
            continue
        parts = item.split(":")
        if len(parts) < 2:
            logger.warning("[sandbox] extra mount 형식 오류 (무시): %s", item)
            continue
        src, dst = parts[0], parts[1]
        mode = parts[2] if len(parts) >= 3 else "ro"
        if not (_os.path.isabs(src) and _os.path.isabs(dst)):
            logger.warning(
                "[sandbox] extra mount 절대경로 아님 (무시): %s", item
            )
            continue
        if mode not in ("ro", "rw"):
            logger.warning(
                "[sandbox] extra mount mode 비정상 → ro 로 대체: %s", item
            )
            mode = "ro"
        if dst in dst_seen:
            logger.warning(
                "[sandbox] extra mount dst 중복 (덮어씀): %s ← %s",
                dst, src,
            )
        dst_seen[dst] = src
        out[src] = {"bind": dst, "mode": mode}
    return out


class DockerSandbox(BaseSandbox):
    """단일 docker 컨테이너 위의 deepagents 백엔드.

    이 클래스 자체는 컨테이너 생명주기를 관리하지 않는다 — `SandboxManager` 가 책임.
    """

    def __init__(
        self,
        container: Any,
        *,
        sandbox_id: str,
        workdir: str = SANDBOX_WORKDIR,
        default_timeout: int = DEFAULT_EXEC_TIMEOUT_S,
    ) -> None:
        self._container = container
        self._sandbox_id = sandbox_id
        self._workdir = workdir
        self._default_timeout = default_timeout

    @property
    def id(self) -> str:
        return self._sandbox_id

    def execute(
        self,
        command: str,
        *,
        timeout: int | None = None,
    ) -> ExecuteResponse:
        """`sh -c <command>` 형태로 컨테이너 안에서 실행.

        docker SDK 의 `exec_run` 은 native timeout 옵션이 없어 별도 스레드에서 동기 실행 후
        `timeout` 으로 wait 한다. 시간 초과 시 exec instance 는 그대로 계속 돌지만 우리는
        ExecuteResponse 에 timeout 정보를 담아 반환한다 (컨테이너 자체는 살아 있고 다음 실행 가능).
        """
        effective_timeout = timeout if timeout is not None else self._default_timeout
        if effective_timeout == 0:
            effective_timeout = None  # type: ignore[assignment]

        result_holder: dict[str, Any] = {}

        def _runner() -> None:
            try:
                result = self._container.exec_run(
                    cmd=["sh", "-c", command],
                    workdir=self._workdir,
                    demux=False,
                    stdin=False,
                    tty=False,
                )
                output_bytes = result.output if result.output else b""
                result_holder["output"] = output_bytes.decode("utf-8", errors="replace")
                result_holder["exit_code"] = result.exit_code
            except Exception as e:  # noqa: BLE001
                result_holder["error"] = str(e)

        thread = threading.Thread(target=_runner, daemon=True)
        thread.start()
        thread.join(timeout=effective_timeout)

        if thread.is_alive():
            return ExecuteResponse(
                output=f"(execution timed out after {effective_timeout}s)",
                exit_code=124,
                truncated=True,
            )

        if "error" in result_holder:
            return ExecuteResponse(
                output=f"(docker exec error: {result_holder['error']})",
                exit_code=-1,
                truncated=False,
            )

        return ExecuteResponse(
            output=result_holder.get("output", ""),
            exit_code=result_holder.get("exit_code", 0),
            truncated=False,
        )

    def upload_files(
        self, files: list[tuple[str, bytes]]
    ) -> list[FileUploadResponse]:
        """docker put_archive 로 컨테이너에 파일 적재.

        디렉토리별로 묶어 tar 1개씩 만들어 효율적으로 전송. 부분 실패 시 파일 단위로
        FileUploadResponse(error=...) 에 표기.
        """
        responses: list[FileUploadResponse] = []
        if not files:
            return responses

        # 디렉토리별 그룹화
        grouped: dict[str, list[tuple[str, bytes]]] = {}
        for path, content in files:
            parent = path.rsplit("/", 1)[0] or "/"
            grouped.setdefault(parent, []).append((path, content))

        for parent_dir, entries in grouped.items():
            # 부모 디렉토리 보장
            mkdir_cmd = f"mkdir -p {parent_dir}"
            mkdir_result = self.execute(mkdir_cmd, timeout=10)
            if mkdir_result.exit_code not in (0, None):
                for path, _ in entries:
                    responses.append(
                        FileUploadResponse(
                            path=path,
                            error=f"mkdir failed: {mkdir_result.output.strip()}",
                        )
                    )
                continue

            buf = io.BytesIO()
            try:
                with tarfile.open(fileobj=buf, mode="w") as tar:
                    for path, content in entries:
                        name = path.rsplit("/", 1)[-1]
                        info = tarfile.TarInfo(name=name)
                        info.size = len(content)
                        info.mode = 0o644
                        info.mtime = int(time.time())
                        tar.addfile(info, io.BytesIO(content))
                buf.seek(0)
                ok = self._container.put_archive(parent_dir, buf.read())
                if not ok:
                    for path, _ in entries:
                        responses.append(
                            FileUploadResponse(path=path, error="put_archive returned false")
                        )
                else:
                    for path, _ in entries:
                        responses.append(FileUploadResponse(path=path, error=None))
            except (APIError, NotFound) as e:
                for path, _ in entries:
                    responses.append(FileUploadResponse(path=path, error=str(e)))
            except Exception as e:  # noqa: BLE001
                for path, _ in entries:
                    responses.append(FileUploadResponse(path=path, error=str(e)))

        return responses

    def download_files(self, paths: list[str]) -> list[FileDownloadResponse]:
        """docker get_archive 로 컨테이너 파일 추출.

        디렉토리는 거부(`is_directory`). 단일 파일만 지원.
        """
        responses: list[FileDownloadResponse] = []
        for path in paths:
            try:
                stream, stat = self._container.get_archive(path)
            except NotFound:
                responses.append(
                    FileDownloadResponse(path=path, content=None, error="file_not_found")
                )
                continue
            except APIError as e:
                responses.append(
                    FileDownloadResponse(path=path, content=None, error=str(e))
                )
                continue
            except Exception as e:  # noqa: BLE001
                responses.append(
                    FileDownloadResponse(path=path, content=None, error=str(e))
                )
                continue

            try:
                buf = io.BytesIO()
                for chunk in stream:
                    buf.write(chunk)
                buf.seek(0)
                with tarfile.open(fileobj=buf, mode="r") as tar:
                    members = tar.getmembers()
                    # path 의 마지막 segment 와 일치하는 파일을 찾음
                    target_name = path.rsplit("/", 1)[-1]
                    target_member = next(
                        (m for m in members if m.name == target_name and m.isfile()), None
                    )
                    if target_member is None:
                        # 디렉토리인 경우
                        if any(m.isdir() for m in members):
                            responses.append(
                                FileDownloadResponse(
                                    path=path, content=None, error="is_directory"
                                )
                            )
                        else:
                            responses.append(
                                FileDownloadResponse(
                                    path=path, content=None, error="file_not_found"
                                )
                            )
                        continue
                    extracted = tar.extractfile(target_member)
                    if extracted is None:
                        responses.append(
                            FileDownloadResponse(
                                path=path, content=None, error="extract_failed"
                            )
                        )
                        continue
                    responses.append(
                        FileDownloadResponse(
                            path=path, content=extracted.read(), error=None
                        )
                    )
            except Exception as e:  # noqa: BLE001
                responses.append(
                    FileDownloadResponse(path=path, content=None, error=str(e))
                )

        return responses


@dataclass
class _SandboxEntry:
    sandbox: DockerSandbox
    container: Any
    last_used_at: float = field(default_factory=time.time)
    host_oauth_port: int | None = None


class SandboxManager:
    """thread_id → DockerSandbox 매핑 + idle 정리.

    동기 docker SDK 호출은 asyncio.to_thread 로 감싸 이벤트 루프 차단을 피한다.
    """

    def __init__(
        self,
        *,
        image: str = SANDBOX_IMAGE,
        workdir: str = SANDBOX_WORKDIR,
        memory_mb: int = DEFAULT_MEMORY_MB,
        cpu_quota: int = DEFAULT_CPU_QUOTA,
        idle_ttl_s: int = DEFAULT_IDLE_TTL_S,
        sweep_interval_s: int = SWEEP_INTERVAL_S,
    ) -> None:
        self._image = image
        self._workdir = workdir
        self._memory_mb = memory_mb
        self._cpu_quota = cpu_quota
        self._idle_ttl_s = idle_ttl_s
        self._sweep_interval_s = sweep_interval_s

        self._entries: dict[str, _SandboxEntry] = {}
        self._lock = asyncio.Lock()
        self._sweep_task: asyncio.Task[None] | None = None
        self._client: Any | None = None

    def _ensure_client(self) -> Any:
        if self._client is None:
            self._client = docker.from_env()
        return self._client

    async def start(self) -> None:
        """앱 시작 시 한 번 호출. idle sweep 태스크 가동."""
        if self._sweep_task is None or self._sweep_task.done():
            self._sweep_task = asyncio.create_task(self._sweep_loop())

    async def shutdown(self) -> None:
        """앱 종료 시 호출. 모든 컨테이너 정리."""
        if self._sweep_task is not None:
            self._sweep_task.cancel()
            try:
                await self._sweep_task
            except asyncio.CancelledError:
                pass

        async with self._lock:
            entries = list(self._entries.items())
            self._entries.clear()

        for thread_id, entry in entries:
            try:
                await asyncio.to_thread(entry.container.stop, timeout=5)
                await asyncio.to_thread(entry.container.remove, force=True)
            except Exception as e:  # noqa: BLE001
                logger.warning("[sandbox] failed to clean up %s: %s", thread_id, e)

    async def get_or_create(self, thread_id: str) -> DockerSandbox:
        """thread 의 sandbox 를 반환. 없으면 새 컨테이너 생성.

        만든 컨테이너는 detach=True, tty=True, command='sleep infinity' 로 유지.
        """
        async with self._lock:
            entry = self._entries.get(thread_id)
            if entry is not None:
                entry.last_used_at = time.time()
                return entry.sandbox

        # 새 생성 — lock 밖에서 (네트워크/시간 소요)
        sandbox, host_oauth_port = await asyncio.to_thread(
            self._create_container, thread_id
        )

        async with self._lock:
            # 이중 생성 방지
            existing = self._entries.get(thread_id)
            if existing is not None:
                # 다른 코루틴이 먼저 만들었음 → 내가 만든 건 폐기
                try:
                    await asyncio.to_thread(sandbox._container.stop, timeout=5)
                    await asyncio.to_thread(sandbox._container.remove, force=True)
                except Exception as e:  # noqa: BLE001
                    logger.warning("[sandbox] failed to discard duplicate: %s", e)
                existing.last_used_at = time.time()
                return existing.sandbox
            self._entries[thread_id] = _SandboxEntry(
                sandbox=sandbox,
                container=sandbox._container,
                host_oauth_port=host_oauth_port,
            )
            return sandbox

    def _ensure_image(self, client: Any) -> None:
        """이미지 존재 확인 → 없으면 (1) 로컬 Dockerfile 빌드, 실패 시 (2) registry pull."""
        try:
            client.images.get(self._image)
            return
        except ImageNotFound:
            pass

        if os.path.isfile(os.path.join(SANDBOX_DOCKERFILE_DIR, "Dockerfile")):
            logger.info(
                "[sandbox] building image %s from %s (최초 1회, 수분 소요)",
                self._image,
                SANDBOX_DOCKERFILE_DIR,
            )
            try:
                client.images.build(
                    path=SANDBOX_DOCKERFILE_DIR,
                    tag=self._image,
                    rm=True,
                    forcerm=True,
                )
                return
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "[sandbox] build failed for %s: %s — fallback to pull", self._image, e
                )

        # Fallback — registry pull (커스텀 태그면 실패할 가능성 큼).
        logger.info("[sandbox] pulling image %s", self._image)
        client.images.pull(self._image)

    def _create_container(
        self, thread_id: str
    ) -> tuple[DockerSandbox, int | None]:
        """동기 — to_thread 안에서만 호출. (sandbox, host_oauth_port) 반환."""
        client = self._ensure_client()
        self._ensure_image(client)

        sandbox_id = f"sandbox-{thread_id[:8]}-{uuid.uuid4().hex[:8]}"
        container = client.containers.run(
            image=self._image,
            command=["sleep", "infinity"],
            detach=True,
            tty=True,
            working_dir=self._workdir,
            labels={SANDBOX_LABEL_KEY: thread_id},
            name=sandbox_id,
            mem_limit=f"{self._memory_mb}m",
            cpu_period=100_000,
            cpu_quota=self._cpu_quota,
            # 네트워크 open (MVP) — 운영에선 모니터링 필요
            network_mode="bridge",
            # OAuth 콜백 포트(컨테이너 9876) → host 임의 포트 동적 매핑.
            # MCP 서버가 redirect_uri 에 사용할 host 포트는 컨테이너 inspect 로 조회 가능.
            ports={f"{SANDBOX_OAUTH_CALLBACK_PORT}/tcp": None},
            # npm/uv 캐시 named volume — thread 간 패키지 재다운로드 방지.
            # SANDBOX_EXTRA_MOUNTS env 로 사용자가 지정한 호스트 경로도 함께 머지.
            volumes={
                NPM_CACHE_VOLUME: {"bind": "/root/.npm", "mode": "rw"},
                UV_CACHE_VOLUME: {"bind": "/root/.cache/uv", "mode": "rw"},
                **_parse_extra_mounts(_get_extra_mounts_spec()),
            },
            # 보안 최소치
            cap_drop=["ALL"],
            security_opt=["no-new-privileges"],
            auto_remove=False,
        )
        # 워크디렉토리 보장
        container.exec_run(cmd=["mkdir", "-p", self._workdir])

        # 호스트 매핑 포트 조회 (OAuth 콜백 프록시용).
        host_oauth_port: int | None = None
        try:
            container.reload()
            port_key = f"{SANDBOX_OAUTH_CALLBACK_PORT}/tcp"
            mapped = (container.attrs.get("NetworkSettings", {}).get("Ports") or {}).get(port_key)
            if mapped:
                host_oauth_port = int(mapped[0]["HostPort"])
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "[sandbox] failed to resolve host oauth port for %s: %s", sandbox_id, e
            )

        logger.info(
            "[sandbox] created container %s for thread %s (oauth host port=%s)",
            sandbox_id,
            thread_id,
            host_oauth_port,
        )
        return (
            DockerSandbox(container, sandbox_id=sandbox_id, workdir=self._workdir),
            host_oauth_port,
        )

    async def touch(self, thread_id: str) -> None:
        async with self._lock:
            entry = self._entries.get(thread_id)
            if entry is not None:
                entry.last_used_at = time.time()

    async def get_container_name(self, thread_id: str) -> str | None:
        """thread 에 매핑된 sandbox 컨테이너 이름을 반환. 없으면 None.

        MCP stdio 서버를 `docker exec` 로 sandbox 안에서 spawn 할 때 사용.
        """
        async with self._lock:
            entry = self._entries.get(thread_id)
            if entry is None:
                return None
            return getattr(entry.container, "name", None)

    async def get_oauth_host_port(self, thread_id: str) -> int | None:
        """thread 의 sandbox 컨테이너 9876/tcp 가 매핑된 host 포트.

        OAuth 콜백 프록시(`/oauth/callback`)가 state 의 thread_id 로 이 값을 조회해
        `http://127.0.0.1:<port>/callback` 으로 프록시한다.
        """
        async with self._lock:
            entry = self._entries.get(thread_id)
            if entry is None:
                return None
            return entry.host_oauth_port

    async def release(self, thread_id: str) -> None:
        """명시적 종료(예: thread archive)."""
        async with self._lock:
            entry = self._entries.pop(thread_id, None)
        if entry is None:
            return
        try:
            await asyncio.to_thread(entry.container.stop, timeout=5)
            await asyncio.to_thread(entry.container.remove, force=True)
        except Exception as e:  # noqa: BLE001
            logger.warning("[sandbox] release failed for %s: %s", thread_id, e)

    async def _sweep_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._sweep_interval_s)
                cutoff = time.time() - self._idle_ttl_s
                async with self._lock:
                    expired_pairs = [
                        (tid, e) for tid, e in self._entries.items() if e.last_used_at < cutoff
                    ]
                    for tid, _ in expired_pairs:
                        self._entries.pop(tid, None)
                for tid, entry in expired_pairs:
                    try:
                        await asyncio.to_thread(entry.container.stop, timeout=5)
                        await asyncio.to_thread(entry.container.remove, force=True)
                        logger.info("[sandbox] swept idle container for thread %s", tid)
                    except Exception as e:  # noqa: BLE001
                        logger.warning("[sandbox] sweep failed for %s: %s", tid, e)
        except asyncio.CancelledError:
            raise


_manager: SandboxManager | None = None


def get_sandbox_manager() -> SandboxManager:
    """프로세스 전역 SandboxManager 싱글톤."""
    global _manager
    if _manager is None:
        _manager = SandboxManager()
    return _manager
