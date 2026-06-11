---
name: naver-works
description: NAVER WORKS Bot API 사용 가이드 — Service Account JWT 인증, 액세스 토큰 발급, 봇 채널/사용자 메시지 전송, callback(webhook) 서명 검증·이벤트 처리, 메시지 콘텐츠 스키마 스니펫을 제공한다. 사용자가 "네이버 웍스", "naver works", "worksapis", "봇 메시지", "웍스 callback" 등을 언급하거나 NAVER WORKS API 연동 코드를 작성·수정할 때 사용한다.
when_to_use: NAVER WORKS Bot 메시지 전송, callback 수신, JWT 인증 코드 작성/디버깅 시. `/naver-works` 직접 호출도 지원.
allowed-tools: Read, Write, Edit, Bash, WebFetch
---

# NAVER WORKS Bot API 사용 가이드

> **공식 문서**: https://developers.worksmobile.com/kr/docs/api
> 본 스킬은 인증/전송/콜백 핵심 흐름과 검증된 스니펫을 제공한다. 문서에 없는 파라미터는 절대 사용하지 말 것.

---

## 0. 환경변수 (필수)

```
NAVER_WORKS_CLIENT_ID=...           # Developer Console
NAVER_WORKS_CLIENT_SECRET=...
NAVER_WORKS_SERVICE_ACCOUNT=xxx@example.serviceaccount  # 서비스 계정 ID(JWT sub)
NAVER_WORKS_PRIVATE_KEY_PATH=/abs/path/private.pem      # 또는 PEM 본문 환경변수
NAVER_WORKS_BOT_ID=...
NAVER_WORKS_BOT_SECRET=...          # callback 서명 검증용
NAVER_WORKS_SCOPE="bot bot.message"  # 필요한 scope 만
```

시크릿은 **절대 코드/로그/커밋에 노출 금지**. `apps/agent-runner-py/src/config.py` `Settings` 또는 NestJS `ConfigService`로만 읽는다.

---

## 1. Service Account JWT 인증 (Python)

**엔드포인트**: `POST https://auth.worksmobile.com/oauth2/v2.0/token`

**JWT Claims**
| claim | 설명 |
|-------|------|
| `iss` | Client ID |
| `sub` | Service Account |
| `iat` | 발급 시각 (Unix sec, 10자리) |
| `exp` | 만료 시각 (`exp - iat ≤ 3600`) |
| `delegated_user` | (선택) 위임 사용자 이메일 |

**서명**: RS256, private key는 Developer Console에서 발급한 PEM.

```python
import time, httpx, jwt  # PyJWT
from pathlib import Path

TOKEN_URL = "https://auth.worksmobile.com/oauth2/v2.0/token"
GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer"

class NaverWorksAuth:
    def __init__(self, client_id, client_secret, service_account, private_key_pem, scope):
        self.client_id = client_id
        self.client_secret = client_secret
        self.service_account = service_account
        self.private_key = private_key_pem
        self.scope = scope
        self._token = None
        self._exp = 0

    def _build_jwt(self) -> str:
        now = int(time.time())  # 매 요청 재계산
        claims = {
            "iss": self.client_id,
            "sub": self.service_account,
            "iat": now,
            "exp": now + 3600,
        }
        return jwt.encode(claims, self.private_key, algorithm="RS256")

    async def access_token(self) -> str:
        if self._token and time.time() < self._exp - 60:
            return self._token
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(TOKEN_URL, data={
                "grant_type": GRANT,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "assertion": self._build_jwt(),
                "scope": self.scope,
            })
            r.raise_for_status()
            data = r.json()
        self._token = data["access_token"]
        self._exp = time.time() + int(data["expires_in"])
        return self._token
```

**응답**
```json
{ "access_token": "...", "refresh_token": "...", "token_type": "Bearer", "expires_in": "86400", "scope": "bot bot.message" }
```

---

## 2. 봇 메시지 전송

### 채널 대상
`POST https://www.worksapis.com/v1.0/bots/{botId}/channels/{channelId}/messages`

### 사용자 대상
`POST https://www.worksapis.com/v1.0/bots/{botId}/users/{userId}/messages`

**공통 헤더**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**성공**: HTTP 201

```python
BASE = "https://www.worksapis.com/v1.0"

async def send_to_channel(auth, bot_id, channel_id, content):
    token = await auth.access_token()
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            f"{BASE}/bots/{bot_id}/channels/{channel_id}/messages",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"content": content},
        )
        r.raise_for_status()
        return r.status_code  # 201

async def send_to_user(auth, bot_id, user_id, content):
    token = await auth.access_token()
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            f"{BASE}/bots/{bot_id}/users/{user_id}/messages",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"content": content},
        )
        r.raise_for_status()
        return r.status_code
```

---

## 3. 메시지 콘텐츠 스키마 (요약)

| type | 핵심 필드 | 비고 |
|------|----------|------|
| `text` | `text` | `postback`(선택) |
| `sticker` | `packageId`, `stickerId` | |
| `image` | `fileId` 또는 `previewImageUrl`+`originalContentUrl` | |
| `file` | `fileId` 또는 `fileUrl` | |
| `link` | `contentText`, `linkText`, `link` | |
| `button_template` | `contentText`, `actions[]` | |
| `list_template` | `cover`, `elements[]`, `actions[]` | |
| `carousel` | `columns[]` (각 column = button_template) | |
| `image_carousel` | `columns[]` (`originalContentUrl`,`action`) | |
| `flex` | `altText`, `contents`(LINE Flex 호환) | |

```python
text_content = {"type": "text", "text": "안녕하세요"}

button_content = {
    "type": "button_template",
    "contentText": "어떤 작업을 진행할까요?",
    "actions": [
        {"type": "message", "label": "승인", "postback": "approve"},
        {"type": "message", "label": "거절", "postback": "reject"},
    ],
}
```

> **주의**: 문서에 정의되지 않은 파라미터를 추가하면 오류 또는 의도하지 않은 동작이 발생한다.

---

## 4. Callback (Webhook) 수신

NAVER WORKS → 우리 서버로 들어오는 이벤트.

### 4-1. 서명 검증 (필수)

요청 헤더 `X-WORKS-Signature` = `BASE64(HMAC-SHA256(bot_secret, raw_request_body))`.

```python
import hmac, hashlib, base64

def verify_signature(bot_secret: str, raw_body: bytes, header_sig: str) -> bool:
    digest = hmac.new(bot_secret.encode(), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, header_sig)
```

### 4-2. FastAPI 라우터 예시

```python
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks

router = APIRouter()

@router.post("/webhooks/naver-works")
async def naver_works_callback(request: Request, bg: BackgroundTasks):
    raw = await request.body()
    sig = request.headers.get("X-WORKS-Signature", "")
    if not verify_signature(settings.NAVER_WORKS_BOT_SECRET, raw, sig):
        raise HTTPException(status_code=401, detail="invalid signature")

    payload = await request.json()
    bg.add_task(handle_event, payload)  # 비동기 처리 (재시도 없음)
    return {"ok": True}  # 반드시 200 먼저
```

### 4-3. 이벤트 종류 / payload

```jsonc
{
  "type": "message",
  "source": { "userId": "...", "channelId": "...", "domainId": 123 },
  "issuedTime": "2026-05-25T10:00:00.000Z",
  "content": { "type": "text", "text": "hello" }
}
```

| 이벤트 | 1:1 | 1:N |
|--------|-----|-----|
| Message | ✓ | ✓ |
| Postback | ✓ | ✓ |
| Begin / End | ✓ | – |
| Join / Leave / Joined / Left | – | ✓ |

Message `content.type`: `text` / `location` / `sticker`(v2.3+) / `image`(v2.3+) / `file`(v2.9+) / `audio`,`video`(v4.1+).
파일/이미지/오디오/비디오는 `fileId`만 들어오므로 별도 다운로드 API 호출 필요.

---

## 5. NestJS (apps/api) 사용 시 패턴

- `NaverWorksAuthService` (싱글턴) — 토큰 캐시
- `NaverWorksClient` — `sendToChannel`, `sendToUser`
- `NaverWorksWebhookController` — `@Post('webhooks/naver-works')`, raw body 사용을 위해 `bodyParser.raw({ type: 'application/json' })` 미들웨어 등록
- 시크릿은 `ConfigService.get('NAVER_WORKS_...')` 로만 접근

---

## 6. 자주 틀리는 포인트

- ❌ `iat`/`exp` 고정값 → 토큰 발급 실패
- ❌ Unix **밀리초** 사용 → 토큰 발급 실패 (반드시 초)
- ❌ `exp - iat > 3600` → 거부
- ❌ 서명 검증 전 비즈니스 로직 실행 → 보안 사고
- ❌ callback 처리 중 200 응답 지연 → NAVER WORKS는 재시도 없음, 누락 발생
- ❌ 문서 외 파라미터 추가 → 응답 오류 또는 미정의 동작
- ❌ scope 과다 요청 → 권한 검수 실패. 필요한 것만.

---

## 7. 공식 문서 빠른 링크

- API 인덱스: https://developers.worksmobile.com/kr/docs/api
- 인증 개요: https://developers.worksmobile.com/kr/docs/auth
- Service Account JWT: https://developers.worksmobile.com/kr/docs/auth-jwt
- 채널 메시지: https://developers.worksmobile.com/kr/docs/bot-channel-message-send
- 사용자 메시지: https://developers.worksmobile.com/kr/docs/bot-user-message-send
- Callback 개요: https://developers.worksmobile.com/kr/docs/bot-callback
- Message Event: https://developers.worksmobile.com/kr/docs/bot-callback-message
- 메시지 콘텐츠: https://developers.worksmobile.com/kr/docs/bot-send-content
- Business Support API: https://developers.worksmobile.com/kr/docs/business-support-api

> 불명확한 필드/응답은 `WebFetch`로 위 URL을 직접 조회해 검증한다. 추측 금지.
