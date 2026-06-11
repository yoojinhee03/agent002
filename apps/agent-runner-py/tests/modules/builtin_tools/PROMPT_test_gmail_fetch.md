# Gmail_Fetch_Tool 테스트 코드 구현 프롬프트

## 목표
`gmail_fetch.py`의 단위 테스트 파일을 아래 경로에 작성한다.

```
apps/agent-runner-py/tests/modules/builtin_tools/test_gmail_fetch.py
```

---

## 반드시 따라야 할 패턴

### 기존 테스트 스타일 규칙 (test_tool_wrapping.py, test_agents_service.py 기준)
- `pytest` + `pytest-asyncio` 사용
- 외부 HTTP 호출은 **모두 `unittest.mock.AsyncMock` / `MagicMock`으로 Mock** 처리
- 실제 Gmail API, 실제 access_token 절대 사용 금지
- 클래스 단위로 테스트 그룹화: `class TestXxx:`
- 각 테스트 함수는 `async def test_xxx(self):` + `@pytest.mark.asyncio`

### import 구조
```python
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.modules.builtin_tools.custom_tools.gmail_fetch import (
    _base64url_decode,
    _to_std_base64,
    _find_header,
    _gmail_fetch,
    build_gmail_fetch_tool,
)
```

---

## 테스트 대상 함수 및 케이스 목록

### 1. `class TestBase64Helpers` — 순수 함수 테스트 (Mock 불필요)

| 테스트명 | 검증 내용 |
|---|---|
| `test_base64url_decode_normal` | 정상 base64url 문자열을 디코딩하면 원본 bytes 반환 |
| `test_base64url_decode_empty` | 빈 문자열 입력 시 `b""` 반환 (에러 없음) |
| `test_base64url_decode_padding_required` | 패딩 없는 base64url 문자열도 정상 처리 |
| `test_to_std_base64_roundtrip` | `_to_std_base64(_base64url_decode(x))` 후 디코딩하면 원본 복원 |

---

### 2. `class TestFindHeader`

| 테스트명 | 검증 내용 |
|---|---|
| `test_finds_subject` | headers 리스트에서 "Subject" 대소문자 무관 찾기 |
| `test_returns_empty_if_not_found` | 존재하지 않는 헤더명은 `""` 반환 |
| `test_handles_invalid_input` | `None` 또는 빈 리스트 입력 시 `""` 반환 |

---

### 3. `class TestGmailFetch` — 핵심 로직 테스트

Mock 설정 방법:
```python
# httpx.AsyncClient.get 을 패치하는 방식
mock_response = MagicMock()
mock_response.raise_for_status = MagicMock()
mock_response.json.return_value = { ... }  # 각 케이스별 API 응답 정의

with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_response):
    result_str = await _gmail_fetch(token="fake_token", message_id="msg_001")
    result = json.loads(result_str)
```

#### Gmail API 응답 픽스처 (테스트 내 공통 활용)

**messages.get 응답 (format=full) 픽스처:**
```python
FAKE_MESSAGE = {
    "id": "msg_001",
    "threadId": "thread_001",
    "labelIds": ["INBOX"],
    "snippet": "테스트 메일 본문 미리보기",
    "internalDate": "1700000000000",
    "payload": {
        "headers": [
            {"name": "Subject", "value": "입사 서류 제출"},
            {"name": "From",    "value": "applicant@example.com"},
            {"name": "To",      "value": "hr@company.com"},
            {"name": "Date",    "value": "Mon, 20 Apr 2026 09:00:00 +0900"},
        ],
        "mimeType": "multipart/mixed",
        "parts": [
            {
                "mimeType": "text/plain",
                "body": {
                    # base64url("안녕하세요. 입사 지원 서류를 제출합니다.")
                    "data": "7JWI64WV7ZWY7IS47JqULiDsnoXsnbQg7lCB7JiB7IiY7Iqk66eM7J20IOyViCDsoJzsnZgg7ZWc7KCc7ZWcLg=="
                }
            },
            {
                "mimeType": "application/pdf",
                "filename": "resume.pdf",
                "body": {
                    "attachmentId": "attach_001",
                    "size": 1024
                }
            }
        ]
    }
}

# attachments.get 응답 픽스처
FAKE_ATTACHMENT = {
    # base64url("%PDF-1.4 fake pdf content")
    "data": "JVBERI0xLjQgZmFrZSBwZGYgY29udGVudA=="
}
```

#### 테스트 케이스 목록

| 테스트명 | Mock 설정 | 검증 내용 |
|---|---|---|
| `test_fetch_success_with_attachment` | messages.get → FAKE_MESSAGE, attachments.get → FAKE_ATTACHMENT | `ok=True`, `headers.subject=="입사 서류 제출"`, `attachments[0].filename=="resume.pdf"`, `skipped==False` |
| `test_fetch_success_without_attachment` | messages.get → FAKE_MESSAGE, `include_attachments=False` | `ok=True`, `attachments` 리스트가 비어있음 |
| `test_fetch_body_text_decoded` | messages.get → FAKE_MESSAGE | `body.textPlain`이 비어있지 않음 확인 |
| `test_fetch_missing_token` | Mock 불필요 | `token=""` 전달 시 `ok=False`, `error.message`에 "Missing" 포함 |
| `test_fetch_http_401_error` | messages.get raise `httpx.HTTPStatusError(status=401)` | `ok=False`, `error.status_code==401` |
| `test_fetch_attachment_too_large` | FAKE_MESSAGE에서 `size`를 `11 * 1024 * 1024`로 변경 | `attachments[0].skipped==True`, `reason=="too_large"` |
| `test_fetch_attachment_download_failure` | messages.get 성공, attachments.get에서 `HTTPStatusError(status=403)` 발생 | `attachments[0].skipped==True`, `reason=="download_failed"` |
| `test_fetch_network_exception` | messages.get에서 일반 `Exception("network error")` raise | `ok=False`, `error.message`에 "network error" 포함 |

---

### 4. `class TestBuildGmailFetchTool` — 토큰 주입 래퍼 테스트

```python
# build_gmail_fetch_tool이 내부적으로 management API를 호출하는 부분을 패치
with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
    # 첫 번째 호출 = 토큰 조회 API
    # 두 번째 호출 = Gmail messages.get API
    mock_get.side_effect = [token_response, gmail_response]
    tool = build_gmail_fetch_tool("agent_123")
    result_str = await tool.arun({"message_id": "msg_001"})
    result = json.loads(result_str)
```

| 테스트명 | Mock 설정 | 검증 내용 |
|---|---|---|
| `test_tool_injects_token_and_calls_gmail` | 토큰 API → `{"accessToken": "valid_token"}`, Gmail API → FAKE_MESSAGE | `ok=True`, 도구 이름이 `"gmail_fetch"` |
| `test_tool_returns_error_when_token_missing` | 토큰 API → `{"accessToken": None}` | `ok=False`, `error.message`에 "not connected" 포함 |
| `test_tool_returns_error_when_token_api_fails` | 토큰 API에서 `HTTPStatusError(status=500)` | `ok=False`, `error.status_code==500` |

---

## 실행 방법 (테스트 파일 생성 후 안내)

```bash
cd apps/agent-runner-py
uv run pytest tests/modules/builtin_tools/test_gmail_fetch.py -v
```

특정 클래스만 실행:
```bash
uv run pytest tests/modules/builtin_tools/test_gmail_fetch.py::TestGmailFetch -v
```

---

## 주의사항
- `httpx.HTTPStatusError` Mock 생성 방법:
  ```python
  mock_resp = MagicMock()
  mock_resp.status_code = 401
  mock_resp.text = "Unauthorized"
  raise httpx.HTTPStatusError("401", request=MagicMock(), response=mock_resp)
  ```
- `patch` 경로는 반드시 `gmail_fetch.py`가 import하는 경로 기준:
  `"src.modules.builtin_tools.custom_tools.gmail_fetch.httpx.AsyncClient"` 또는 `"httpx.AsyncClient.get"`
- `__init__.py`가 없으면 `tests/modules/builtin_tools/__init__.py` 파일도 함께 생성
