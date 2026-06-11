"""File content 미들웨어 — OpenAI 경로에서 `type:'file'` content 블록을 텍스트로 치환.

deepagents 의 `read_file` 은 PDF·바이너리를 멀티모달 `file` content 블록(base64)으로
반환한다(공식: backends 문서 — 이미지·파일을 multimodal content block 으로 노출).
그러나 OpenAI Chat Completions 엔드포인트의 content part 는 text/refusal/image_url/
input_audio 만 지원하므로 `file` 블록이 들어가면 400 invalid_value 로 실패한다.

이 미들웨어는 공식 `wrap_model_call`(여기서는 async `awrap_model_call`) 훅으로 모델 호출
직전 메시지를 가로채, PDF `file` 블록을 추출 텍스트로 치환한다. Anthropic/Gemini 는 PDF
document 블록을 네이티브로 지원하므로 provider 가 openai 일 때만 동작시켜 회귀를 막는다.
"""

from __future__ import annotations

import base64
from typing import Any, Callable

import structlog
from langchain.agents.middleware import (
    AgentMiddleware,
    AgentState,
    ModelRequest,
    ModelResponse,
)

logger = structlog.get_logger(__name__)

# 추출 텍스트가 과도하게 커지면 컨텍스트를 잠식하므로 메시지당 상한을 둔다.
_MAX_TEXT_CHARS = 50_000


def extract_pdf_text(data: bytes) -> str:
    """PDF bytes → 평문. pymupdf(fitz) 우선, 실패 시 pypdf 폴백."""
    try:
        import fitz  # pymupdf

        with fitz.open(stream=data, filetype="pdf") as doc:
            return "\n".join(page.get_text() for page in doc).strip()
    except Exception as e:  # noqa: BLE001
        logger.warning("file-mw pymupdf extract failed, fallback to pypdf", error=str(e))

    from io import BytesIO

    from pypdf import PdfReader

    reader = PdfReader(BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages).strip()


def _file_block_payload(block: dict[str, Any]) -> tuple[str | None, str, str]:
    """file 블록에서 (base64, mime, filename) 추출. 키 변형을 방어적으로 처리."""
    b64 = block.get("base64") or block.get("data")
    if not b64:
        nested = block.get("file")
        if isinstance(nested, dict):
            b64 = nested.get("file_data") or nested.get("data")
    mime = str(block.get("mime_type") or block.get("mimetype") or "")
    filename = str(block.get("filename") or block.get("title") or "attachment")
    return b64, mime, filename


def _is_pdf(mime: str, filename: str) -> bool:
    return "pdf" in mime.lower() or filename.lower().endswith(".pdf")


def _convert_block(block: dict[str, Any]) -> dict[str, Any] | None:
    """file 블록을 text 블록으로 변환. 변환 불필요/불가 시 None 반환."""
    b64, mime, filename = _file_block_payload(block)
    if not b64:
        return None
    if not _is_pdf(mime, filename):
        # 비PDF 바이너리는 LLM 이 직접 못 읽으므로, execute 로 파싱하도록 유도.
        return {
            "type": "text",
            "text": f"[첨부 파일 `{filename}` ({mime or 'binary'})는 직접 첨부로 읽을 수 없습니다. "
            f"`/workspace/{filename}` 를 `read_file`/`execute` 도구로 파싱하세요.]",
        }
    try:
        raw = base64.b64decode(b64)
        text = extract_pdf_text(raw)
    except Exception as e:  # noqa: BLE001
        logger.warning("file-mw pdf extract failed", filename=filename, error=str(e))
        return {
            "type": "text",
            "text": f"[첨부 PDF `{filename}` 텍스트 추출 실패. `/workspace/{filename}` 를 `execute` 로 파싱하세요.]",
        }
    if len(text) > _MAX_TEXT_CHARS:
        text = text[:_MAX_TEXT_CHARS] + "\n…(이하 생략 — 전체가 필요하면 execute 로 분할 처리)"
    return {"type": "text", "text": f"[첨부 PDF `{filename}` 추출 텍스트]\n{text}"}


def _rewrite_message(msg: Any) -> Any | None:
    """메시지 content 의 file 블록을 text 로 치환. 변경 없으면 None."""
    content = getattr(msg, "content", None)
    if not isinstance(content, list):
        return None
    changed = False
    new_content: list[Any] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "file":
            converted = _convert_block(block)
            if converted is not None:
                logger.info("file-mw file block converted to text", block_keys=sorted(block.keys()))
                new_content.append(converted)
                changed = True
                continue
        new_content.append(block)
    if not changed:
        return None
    return msg.model_copy(update={"content": new_content})


class FileBlockToTextMiddleware(AgentMiddleware[AgentState, Any, Any]):
    """OpenAI 경로에서 `file` content 블록을 추출 텍스트로 치환하는 미들웨어."""

    def __init__(self, provider_slug: str) -> None:
        super().__init__()
        self._provider_slug = (provider_slug or "").lower()

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Any],
    ) -> ModelResponse:
        if self._provider_slug != "openai":
            return await handler(request)

        rewritten = False
        new_messages: list[Any] = []
        for msg in request.messages:
            replacement = _rewrite_message(msg)
            if replacement is not None:
                new_messages.append(replacement)
                rewritten = True
            else:
                new_messages.append(msg)

        if rewritten:
            return await handler(request.override(messages=new_messages))
        return await handler(request)
