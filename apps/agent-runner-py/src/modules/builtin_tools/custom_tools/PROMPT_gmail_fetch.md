# Gmail_Fetch_Tool 구현 프롬프트

## 목표
`gmail_search.py`와 동일한 패턴으로 `gmail_fetch.py`를 구현한다.
선택된 메일 ID의 본문(plain/html)과 첨부파일 목록을 반환하는 도구다.

---

## 파일 위치
```
apps/agent-runner-py/src/modules/builtin_tools/custom_tools/gmail_fetch.py
```

---

## 반드시 따라야 할 패턴 (gmail_search.py 기준)

### 1. import 구조
```python
from __future__ import annotations
import base64
import json
from typing import Any
import httpx
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool
```

### 2. Args 스키마 (Pydantic BaseModel)
- `access_token` 필드 없이 정의한다 (토큰은 내부에서 주입)
- 필드:
  - `message_id: str` — 필수, 가져올 메일의 Gmail message ID
  - `user_id: str` — 기본값 "me"
  - `include_attachments: bool` — 기본값 True, False면 첨부파일 바이너리 스킵

### 3. 핵심 로직 함수 `_gmail_fetch(token, message_id, user_id, include_attachments)`
아래 3단계를 순서대로 수행한다.

#### Step 1 — 메일 전문 조회
```
GET https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages/{message_id}
params: format=full
```
- `payload.headers`에서 Subject / From / To / Date 추출

#### Step 2 — MIME 파싱 (재귀 파트 탐색)
`payload.parts`를 재귀 탐색하는 내부 함수 `_extract_parts(parts)`를 정의한다.
- `mimeType == "text/plain"` → body.data를 base64url 디코딩 → `body_text`에 저장
- `mimeType == "text/html"` → base64url 디코딩 → `body_html`에 저장
- `filename`이 존재하고 비어있지 않으면 → 첨부파일로 분류
  - `body.attachmentId`가 있으면 Step 3에서 별도 다운로드
  - `body.data`가 있으면 인라인 데이터로 즉시 디코딩
- `parts`가 없으면 최상위 `payload.body.data`를 `body_text`로 fallback 처리

#### Step 3 — 첨부파일 다운로드 (`include_attachments=True`일 때만)
```
GET https://gmail.googleapis.com/gmail/v1/users/{user_id}/messages/{message_id}/attachments/{attachment_id}
```
- 응답의 `data` 필드를 base64url 디코딩
- 파일 크기가 10MB 초과하면 스킵하고 `skipped: true` 표시

### 4. 반환 JSON 구조
```json
{
  "ok": true,
  "message_id": "...",
  "subject": "...",
  "from": "...",
  "to": "...",
  "date": "...",
  "body_text": "...",
  "body_html": "...",
  "attachments": [
    {
      "filename": "이력서.pdf",
      "mimeType": "application/pdf",
      "size": 204800,
      "data": "<base64 encoded string>",
      "skipped": false
    }
  ]
}
```
- `ok: false`일 때는 `{"ok": false, "error": {"status_code": ..., "message": "..."}}`

### 5. 토큰 주입 패턴 (gmail_search.py와 동일하게 구현)
```python
def build_gmail_fetch_tool(agent_id: str) -> BaseTool:
    async def _gmail_fetch_with_internal_token(**kwargs: Any) -> str:
        from src.config import settings
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"{settings.MANAGEMENT_API_URL}/api/internal/agents/{agent_id}/gmail/access-token",
                    headers={"X-API-Key": settings.INTERNAL_SERVICE_KEY},
                )
                res.raise_for_status()
                token = res.json().get("accessToken")
        except httpx.HTTPStatusError as e:
            return json.dumps({"ok": False, "error": {"status_code": e.response.status_code, "message": e.response.text}}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"ok": False, "error": {"message": str(e)}}, ensure_ascii=False)

        if not token:
            return json.dumps({"ok": False, "error": {"message": "Gmail is not connected or token issuance failed"}}, ensure_ascii=False)

        return await _gmail_fetch(token=token, **kwargs)

    return build_custom_tool(
        CustomToolProperties(
            name="gmail_fetch",
            description="Fetch a Gmail message body (plain text and HTML) and download all attachments by message ID.",
            args_schema=GmailFetchArgs,
            tags=["gmail"],
        ),
        coroutine=_gmail_fetch_with_internal_token,
    )
```

---

## registry.py 수정 지시

파일: `apps/agent-runner-py/src/modules/builtin_tools/custom_tools/registry.py`

```python
from __future__ import annotations
from langchain_core.tools import BaseTool
from src.modules.builtin_tools.custom_tools.gmail_search import build_gmail_search_tool
from src.modules.builtin_tools.custom_tools.gmail_fetch import build_gmail_fetch_tool

def get_custom_tools(thread_id: str) -> list[BaseTool]:
    agent_id = thread_id
    return [
        build_gmail_search_tool(agent_id),
        build_gmail_fetch_tool(agent_id),
    ]
```

---

## 주의사항
- `base64url` 디코딩은 반드시 `base64.urlsafe_b64decode(data + "==")` 방식 사용 (패딩 보정 필수)
- httpx 클라이언트는 Step 1~3을 하나의 `async with httpx.AsyncClient()` 블록 안에서 처리
- 첨부파일 `data` 필드는 표준 base64로 재인코딩(`base64.b64encode(...).decode()`)해서 반환
- 에러 처리는 `httpx.HTTPStatusError`와 일반 `Exception` 두 가지로 분기
