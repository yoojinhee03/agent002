"""Sandbox sync middleware — invoke 직전 thread 첨부를 sandbox `/workspace/` 로 업로드.

deepagents `going-to-production` 의 SandboxSyncMiddleware 패턴을 따른다.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain.agents.middleware import AgentMiddleware, AgentState
from langgraph.runtime import Runtime

from src.modules.attachments import attachments_service

logger = logging.getLogger(__name__)

SANDBOX_WORKSPACE = "/workspace"


class AttachmentSyncMiddleware(AgentMiddleware[AgentState, Any, Any]):
    """thread 첨부 파일을 sandbox 의 `/workspace/` 디렉토리에 매 turn 직전 동기화.

    - 매 turn 마다 항상 업로드(idempotent overwrite). 첨부 수정/추가가 같은 thread 내에서
      바로 반영되게 한다.
    - sandbox backend 가 `aupload_files` 를 노출하므로 그것을 사용한다.
    - 업로드 실패 시 경고 로그만 남기고 진행(에이전트는 첨부 없이 동작 가능).
    """

    def __init__(self, thread_id: str, backend: Any) -> None:
        super().__init__()
        self._thread_id = thread_id
        self._backend = backend

    async def abefore_agent(
        self, state: AgentState, runtime: Runtime[Any]
    ) -> dict[str, Any] | None:
        try:
            atts = await attachments_service.list_for_thread(self._thread_id)
        except Exception as e:  # noqa: BLE001
            logger.warning("[sandbox-sync] list attachments failed: %s", e)
            return None
        if not atts:
            return None

        files: list[tuple[str, bytes]] = []
        for att in atts:
            try:
                content = attachments_service.read_bytes(att)
            except FileNotFoundError:
                logger.warning(
                    "[sandbox-sync] attachment file missing on disk: %s", att.storage_path
                )
                continue
            # 안전한 파일명만 (서비스에서 이미 san. 처리됨)
            files.append((f"{SANDBOX_WORKSPACE}/{att.original_name}", content))

        if not files:
            return None

        try:
            results = await self._backend.aupload_files(files)
            failed = [r for r in results if r.error]
            if failed:
                logger.warning(
                    "[sandbox-sync] %d/%d uploads failed for thread %s",
                    len(failed),
                    len(results),
                    self._thread_id,
                )
            else:
                logger.info(
                    "[sandbox-sync] synced %d attachments for thread %s",
                    len(results),
                    self._thread_id,
                )
        except Exception as e:  # noqa: BLE001
            logger.warning("[sandbox-sync] upload error: %s", e)
        return None


SANDBOX_PRELOADED_LIBS_HINT = """
샌드박스에는 다음 파이썬 라이브러리가 사전 설치되어 있어 `pip install` 없이 바로 import 가능합니다:
- PDF: `pypdf`, `pymupdf` (fitz)
- DOCX: `python-docx`
- XLSX/XLS: `openpyxl`, `xlrd`, `pandas`
- HWP(구한글, `.hwp`): `hwp5` (pyhwp 모듈명) — 바이너리 OLE 포맷
- 데이터/차트: `pandas`, `numpy`, `matplotlib`
- 이미지: `pillow` (이미지는 `read_file` 만으로도 LLM 이 직접 볼 수 있음)
- HTML/웹: `requests`, `beautifulsoup4`, `lxml`
- 인코딩: `chardet`, `python-magic`

## 파일 포맷별 처리 권장 패턴
- `.pdf` → `pypdf.PdfReader(path).pages[i].extract_text()` 또는 `fitz.open(path)` 후 `page.get_text()`
- `.docx` → `docx.Document(path).paragraphs[i].text`
- `.xlsx` → `pandas.read_excel(path, sheet_name=None)` (전 sheet dict)
- `.csv` → `pandas.read_csv(path)`
- `.hwp` (구한글, 바이너리) → `hwp5proc text path.hwp` 쉘 또는 `hwp5.dataio` 사용
- `.hwpx` (신한글, **ZIP+XML**) → `unzip -p file.hwpx 'Contents/section*.xml'` 또는 파이썬으로:
  ```python
  import zipfile, xml.etree.ElementTree as ET
  with zipfile.ZipFile(path) as z:
      for name in z.namelist():
          if name.startswith('Contents/section') and name.endswith('.xml'):
              tree = ET.fromstring(z.read(name))
              # ns = {'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph'}
              text = ''.join(t.text or '' for t in tree.iter() if t.text)
              print(text)
  ```
  (`hwpx` 는 별도 라이브러리 없이 표준 라이브러리만으로 충분합니다.)

## 효율적인 호출 원칙
- 같은 파일을 두 번 읽지 말 것. 첫 추출 결과를 변수로 저장해 재사용.
- 코드 실패 시 한 번에 더 큰 변경으로 재시도(작은 수정 반복은 step 낭비).
- 첨부 분석은 보통 3~5 step 안에 결과 도출이 목표.
"""


def build_attachment_hint(attachments: list[attachments_service.StoredAttachment]) -> str:
    """system_prompt 끝에 붙일 첨부 안내 + 사전 설치 라이브러리 안내."""
    if not attachments:
        return ""
    lines = ["", "## 사용자 첨부 파일", "", "다음 파일이 작업 디렉토리에 있습니다:"]
    for a in attachments:
        lines.append(f"- `{SANDBOX_WORKSPACE}/{a.original_name}` ({a.mime_type}, {a.size} bytes)")
    lines.append("")
    lines.append("필요 시 `read_file`, `execute` 도구로 분석하세요.")
    lines.append(SANDBOX_PRELOADED_LIBS_HINT)
    return "\n".join(lines)
