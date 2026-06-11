# AgentStudio Public Chat API (v1)

> 외부 client(웹 위젯·모바일·서드파티 백엔드)가 배포된 agent 와 멀티턴 대화하기 위한 공개 API 명세서.
>
> 본 명세는 **Phase 9 — Agent 배포 + 외부 채팅 API** (`refactoring-deep-agent-plan.md` 참조) 의 산출물이며, 프론트엔드 개발자가 본 문서만 보고 client 를 구현할 수 있도록 작성되었다.

---

## 1. Overview

| 항목 | 값 |
|------|-----|
| Base URL | `https://<your-host>/api/v1` |
| Content-Type | `application/json; charset=utf-8` |
| 인증 | `X-API-Key: <raw-key>` (모든 요청 헤더) |
| 실시간 채널 | socket.io namespace `/v1/chat` |
| 타임존 | 모든 timestamp 는 ISO-8601 UTC (`2026-05-08T09:30:00.000Z`) |
| API 버전 | v1 |

### 응답 포맷

> **현 단계 운영 응답은 raw JSON 객체** 입니다. 향후 envelope(`{data, error}`) 인터셉터 도입 예정.
> 외부 client 는 아래 라우트별 응답 본문을 그대로 받게 됩니다.

오류 응답은 NestJS `HttpException` 표준 모양:

```json
{
  "statusCode": 401,
  "message": "API key revoked or disabled",
  "error": "Unauthorized"
}
```

`statusCode` 와 HTTP status 가 일치하며, 사용자 표시용 메시지는 `message` 필드를 사용합니다.

### 표준 HTTP 상태 코드

| 코드 | 의미 |
|------|------|
| 200 | 정상 |
| 201 | 생성됨 (thread 등) |
| 400 | 요청 형식/검증 오류 |
| 401 | API Key 누락/무효/만료/revoke |
| 403 | 키는 유효하지만 해당 리소스 권한 없음 (다른 deployment 의 thread 등) |
| 404 | 리소스 없음 |
| 409 | 상태 충돌 (예: 이미 종료된 turn 에 resume) |
| 422 | 검증 실패 (DTO 위반) |
| 429 | rate limit |
| 500 | 서버 내부 오류 |

---

## 2. Authentication

### API Key 발급

1. AgentStudio 관리 콘솔에서 agent 를 특정 환경(예: `production`)에 배포 → `AgentDeployment` 생성.
2. 같은 화면에서 "Create API Key" 클릭 → **raw key 가 1회만** 응답으로 표시됨. 즉시 안전한 곳에 보관.
3. 이후 조회 화면에는 마스킹된 형태(`sk_live_****abcd`)만 표시.

### Key 사용

모든 요청에 `X-API-Key` 헤더 포함:

```
X-API-Key: 
```

### Key 속성

| 속성 | 설명 |
|------|------|
| 스코프 | **Deployment 단위** — 1 key = 1 agent + 1 environment |
| scopes | `chat:invoke` / `chat:resume` / `chat:read` (현재 v1 은 `chat:*` 통합) |
| validFrom / expiresAt | 선택적 유효 기간 |
| status | `active` / `revoked` / `expired` |
| 회수 | revoke 즉시 모든 후속 요청 401 |

키가 유출되면 즉시 revoke 후 새 키 발급. 라이브 키는 client 코드에 직접 박지 말 것 (자체 백엔드 프록시 권장).

---

## 3. REST API

### 3.1. POST `/api/v1/chat/threads`

새 대화 thread 생성. `agentDeploymentId` 는 API Key 로부터 결정되므로 body 에 명시 불필요.

**Request**

```json
{
  "title": "고객 문의 #1024",          // optional
  "metadata": { "userRef": "u_42" }    // optional, 자유로운 JSON
}
```

**Response 201**

```json
{
  "threadId": "<uuid>",
  "agentDeploymentId": "<uuid>",
  "agent": {
    "id": "<uuid>",
    "slug": "support-bot",
    "name": "고객 지원 봇"
  },
  "title": "고객 문의 #1024",
  "status": "active",
  "createdAt": "2026-05-08T09:30:00.000Z"
}
```

### 3.2. POST `/api/v1/chat/threads/{threadId}/messages`

사용자 메시지 전송. 현 구현은 **runner 동기 응답 프록시** 입니다 — 실 진행상태는 socket.io 로 수신.

**Request**

```json
{ "message": "지난 주문 환불 가능해?" }
```

**Response 200** — runner 응답 본문이 그대로 전달됩니다.

```json
{
  "threadId": "<uuid>",
  "messages": [
    { "role": "user", "content": "지난 주문 환불 가능해?" },
    { "role": "assistant", "content": "네, ..." }
  ]
}
```

> 진행 중 HITL interrupt 가 발생하면 `status: "paused"` + `interaction` 객체가 응답에 포함됩니다.

> 비동기 `{ runId }` envelope 은 향후 작업으로 분리.

### 3.3. POST `/api/v1/chat/threads/{threadId}/resume`

agent 가 사용자 승인을 요청한 상태(`chat.approval_required`)에서 결정 회신.

**Request**

```json
{
  "decisions": [
    { "type": "approve" }
  ]
}
```

> deepagents 포맷: `{type:"approve"}` / `{type:"reject"}` / `{type:"edit", "edited_action":{...}}`.

**Response 200** — runner 응답이 그대로 전달됩니다(완료 시 messages, paused 시 interaction).

### 3.4. GET `/api/v1/chat/threads/{threadId}/messages`

메시지 이력 조회. 현재 페이지네이션은 미지원(전체 이력 반환). cursor 기반 페이지네이션은 후속 작업.

**Response 200**

```json
{
  "messages": [
    {
      "role": "user" | "assistant" | "system" | "tool",
      "content": "환불 가능해?",
      "timestamp": "2026-05-08T09:30:01.000Z"
    }
  ]
}
```

---

## 4. Realtime — socket.io `/v1/chat`

### 4.1. 연결

```js
import { io } from "socket.io-client";

const socket = io("https://<host>/v1/chat", {
  transports: ["websocket"],
  auth: { apiKey: "sk_live_xxxx" }
});

socket.on("connect", () => {
  socket.emit("subscribe", { threadId: "thr_01HX..." });
});
```

### 4.2. Client → Server 이벤트

| 이벤트 | payload | 설명 |
|--------|---------|------|
| `subscribe` | `{ threadId }` | 해당 thread 의 진행상태 수신 시작 |
| `unsubscribe` | `{ threadId }` | 수신 중지 |

연결 시 `auth.apiKey` 가 무효하면 서버는 `connect_error` 를 emit 하고 disconnect.

### 4.3. Server → Client 이벤트 (외부 스키마)

모든 외부 이벤트의 payload 는 다음 공통 필드를 포함:

```
{
  threadId: string,
  runId: string,
  ts: string (ISO-8601)
}
```

각 이벤트별 추가 필드:

#### `chat.turn_started`
```
{ ...common, turnId }
```

#### `chat.message_delta` — 어시스턴트 응답 토큰 스트림
```
{ ...common, content: string, delta: boolean, done: boolean }
```
- `delta=true` 인 chunk 들을 누적해 화면에 추가.
- `done=true` 가 마지막 chunk.

#### `chat.activity_started` — 도구/sub-agent/skill 실행 시작
```
{
  ...common,
  activityId: string,
  kind: "tool" | "agent" | "skill" | "thinking",
  name: string,                  // 원본 식별자 (예: "web_search")
  label: string,                 // 한국어 표시명 (예: "웹 검색")
  icon: string,                  // 이모지 (예: "🔍")
  summary: string,               // 입력 한 줄 요약 (예: "검색어: AI 트렌드")
  parentActivityId: string|null, // 계층 구조용
  depth: number,                 // 0=top
  status: "running"
}
```

#### `chat.activity_completed`
```
{
  ...common,
  activityId, kind, name, label, icon, parentActivityId, depth,
  status: "done",
  summary: string,               // 출력 한 줄 요약
  latencyMs: number
}
```

#### `chat.activity_failed`
```
{
  ...common,
  activityId, kind, name, label, icon, parentActivityId, depth,
  status: "failed",
  error: { message: string }
}
```

#### `chat.plan` — agent 가 todo 리스트를 만든 경우
```
{ ...common, steps: [{ content, status: "pending"|"in_progress"|"done" }] }
```

#### `chat.approval_required` — HITL 승인 필요
```
{
  ...common,
  actionRequests: [
    {
      actionRequestId: string,
      tool: string,
      args: object,
      summary: string
    }
  ],
  allowedDecisions: ["approve" | "reject" | "edit"]
}
```

#### `chat.turn_completed`
```
{
  ...common,
  finalMessage: string,
  usage: { tokens: number, latencyMs: number }
}
```

#### `chat.error`
```
{ ...common, type: "guardrail_blocked"|"runtime_error"|"timeout", message: string }
```

### 4.4. 노출하지 않는 내부 이벤트

다음 내부 이벤트는 외부 client 로 전달되지 않는다 (혼선/민감정보 방지):
- `agent.reasoning` — 내부 chain-of-thought
- `run.completed` 의 cost/모델/토큰 분해
- step trace 의 raw input/output 전체

---

## 5. Activity 표시 가이드 (Frontend)

### 5.1. 권장 UI 컴포넌트

`activityId` 단위로 row 를 만들어 다음과 같이 표시:

```
🔍 웹 검색 — 검색어: AI 트렌드 2026          ⏳ running
✅ 웹 검색 — 12건 결과                       1.2s
🤖 Researcher                              ⏳ running
   📄 파일 읽기 — /docs/spec.md              0.4s
   ✍️ 파일 쓰기 — /tmp/summary.md            0.6s
🛠 스킬: pirate-tone — 적용됨                ✓
```

- 들여쓰기는 `depth` 또는 `parentActivityId` 트리 기반.
- `kind="thinking"` 은 점 3개 애니메이션 등으로만 표시 (label/summary 생략 가능).

### 5.2. 기본 매핑 사전

| name | kind | icon | label |
|------|------|------|-------|
| `web_search` | tool | 🔍 | 웹 검색 |
| `read_file` | tool | 📄 | 파일 읽기 |
| `write` | tool | ✍️ | 파일 쓰기 |
| `ls` | tool | 📁 | 디렉토리 조회 |
| `python` | tool | 🐍 | 코드 실행 |
| `<sub-agent>` | agent | 🤖 | {name} |
| `<skill>` | skill | 🛠 | 스킬: {name} |
| (기타) | tool | 🔧 | {name} |

서버가 매핑 사전을 통해 이미 `label`/`icon` 필드를 채워 보내므로 client 는 그대로 사용해도 되고, 자체 매핑으로 덮어써도 된다.

### 5.3. 깊이 처리

- 모바일/간단 모드: `depth ≤ 1` 만 표시.
- 데스크톱/상세 모드: 전체 표시 + 접기/펼치기.
- `parentActivityId === null` 이면 top-level.

### 5.4. 토큰 스트림과 activity 동시 표시

- `chat.message_delta` 는 채팅 풍선에 실시간 누적.
- `chat.activity_*` 는 풍선 옆/아래에 별도 패널로 표시.
- `chat.turn_completed` 수신 시 activity 패널은 접거나 fade-out 권장.

---

## 6. 에러 처리

### 6.1. HTTP 에러 매핑

| code | HTTP | 의미 |
|------|------|------|
| `invalid_api_key` | 401 | 키 누락/형식 오류/해시 불일치 |
| `api_key_expired` | 401 | expiresAt 경과 |
| `api_key_revoked` | 401 | status=revoked |
| `agent_deployment_inactive` | 403 | deployment.status != active |
| `forbidden_thread` | 403 | 다른 deployment 의 thread 접근 |
| `thread_not_found` | 404 | 존재하지 않거나 삭제됨 |
| `run_already_finished` | 409 | 종료된 turn 에 resume |
| `validation_error` | 422 | DTO 검증 실패 (details.fields 참조) |
| `rate_limited` | 429 | retry-after 헤더 참조 |
| `internal_error` | 500 | 서버 측 예외 |

### 6.2. socket.io 에러

- `connect_error` — auth 실패 시 즉시 disconnect.
- `chat.error` 이벤트 — turn 진행 중 가드레일/런타임 오류. turn 은 종료되지 않을 수 있으므로 client 는 turn_completed 또는 chat.error 둘 중 하나가 올 때까지 대기.

### 6.3. 재연결 전략

- socket.io 의 기본 reconnection 활성화.
- 재연결 후 `subscribe` 를 다시 emit 해야 함.
- 재연결 직전에 진행 중이던 runId 가 있다면, REST `GET /threads/{id}/messages` 로 마지막 상태를 polling 해서 sync.

---

## 7. 통합 예시

### 7.1. curl 시퀀스

```bash
# 1. thread 생성
curl -X POST https://<host>/api/v1/chat/threads \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"title":"테스트"}'
# → { data: { threadId: "thr_..." }, ... }

# 2. 메시지 전송
curl -X POST https://<host>/api/v1/chat/threads/$THREAD/messages \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"message":"안녕!"}'
# → { data: { runId: "run_..." }, ... }
```

### 7.2. JS (socket.io-client)

```js
import { io } from "socket.io-client";

const socket = io(`${BASE}/v1/chat`, {
  transports: ["websocket"],
  auth: { apiKey: API_KEY }
});

socket.on("connect", () => {
  socket.emit("subscribe", { threadId });
});

socket.on("chat.message_delta", ({ content, done }) => {
  appendToBubble(content);
  if (done) finalizeBubble();
});

socket.on("chat.activity_started", (act) => {
  upsertActivity({ ...act });          // status=running
});

socket.on("chat.activity_completed", (act) => {
  upsertActivity({ ...act });          // status=done, latencyMs
});

socket.on("chat.approval_required", (req) => {
  showApprovalDialog(req).then((decisions) => {
    fetch(`${BASE}/api/v1/chat/threads/${threadId}/resume`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ runId: req.runId, decisions })
    });
  });
});

socket.on("chat.turn_completed", () => {
  collapseActivities();
});

socket.on("chat.error", ({ message }) => showToast(message));
```

---

## 8. 보안 권장 사항

- 라이브 API Key 는 **client 코드/모바일 번들에 직접 노출하지 말 것**. 본인 서비스 백엔드를 거쳐 프록시하는 형태 권장.
- 별도의 사용자 식별이 필요하면 `metadata.userRef` 에 자체 user id 를 넣어 thread 와 매핑.
- HTTPS / WSS 만 사용. 평문 연결 시 401.
- `chat.activity_*` 의 `summary` 는 입력값을 요약하지만 민감정보가 포함될 수 있으므로 client 측에서 마스킹/감추기 처리 검토.

---

## 9. Changelog

| 버전 | 날짜 | 변경 |
|------|------|------|
| v1 (draft) | 2026-05-08 | 최초 명세 — 인증, REST(threads/messages/resume), socket.io `/v1/chat`, 외부 이벤트 11종, Activity 매핑 사전 |
| v1.1 (draft) | 2026-05-08 | §10 Client UI API 추가 (배포 agent 디스커버리 / 사용자 자격증명·Provider 등록) — Phase 10 |

---

## 10. Client UI API (내부 — JWT)

> 본 섹션은 **AgentStudio Client 앱** (`apps/agent-web` 의 `(client)` 라우트 그룹) 이 호출하는 내부 NestJS API 의 페이지별 명세다. 모든 endpoint 는 사용자 로그인 JWT 인증을 요구하며, 응답은 NestJS 가 raw JSON 으로 반환한다 (`{ data, error }` envelope 없음 — §1~§9 의 외부 API 와 다름).
>
> Frontend dev 가 새 화면을 만들 때는 본 섹션의 페이지별 매핑 → endpoint 명세 → 타입 정의 순으로 참조한다.

### 10.0. 공통 규칙

#### 인증
- 모든 요청에 `Authorization: Bearer <accessToken>` 필수.
- 401 응답 시 `apiClient` 가 자동으로 `POST /api/auth/refresh` 시도 후 재시도. 실패 시 `/login` 으로 리다이렉트.

#### Base URL
- 기본: `http://localhost:4200` (env: `NEXT_PUBLIC_API_URL`).
- 채팅 WebSocket: `http://localhost:4300` (runner, env: `NEXT_PUBLIC_RUNNER_URL`).

#### 응답 형식
- 성공: 200 OK / 201 Created — 핸들러가 반환한 객체 그대로.
- 실패: 4xx/5xx — `{ "statusCode": number, "message": string, "error": string }` (NestJS `HttpException` 기본 포맷).

#### 페이지 ↔ API 매핑 한눈에

| 페이지 | 사용 API |
|--------|----------|
| 모든 client 페이지 (사이드바) | `GET /api/projects/:projectId/threads?status=active`, `DELETE /api/threads/:threadId`, `PATCH /api/threads/:threadId` |
| `/login` | `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/users/me`, `GET /api/projects`, `POST /api/projects` |
| `/client/agents` | `GET /api/client/agents` |
| `/client/agents/[slug]` | `GET /api/client/agents/:slug` |
| `/client/agents/[slug]/chat`, `/client/history?threadId=...` | `GET /api/client/agents/:slug`, `POST /api/projects/:projectId/threads`, `GET /api/threads/:threadId/messages`, `POST /api/threads/:threadId/invoke`, `PATCH /api/threads/:threadId`, `POST /api/threads/:threadId/resume`, socket.io (`/`) |
| `/client/tools` | `GET /api/me/tools`, `GET /api/me/providers`, `POST /api/me/providers`, `POST /api/me/credentials`, `PATCH /api/me/credentials/:id`, `DELETE /api/me/credentials/:id`, `POST /api/me/credentials/:id/test`, `GET/PUT/DELETE /api/me/credentials/gmail/oauth-app`, `GET /api/me/credentials/gmail/auth-url`, `POST /api/me/credentials/gmail/disconnect` |
| `/client/oauth/google/callback` | `POST /api/me/credentials/gmail/callback` |

---

### 10.1. 공통 — 사이드바 (`ClientSidebar`)

사이드바는 모든 `(client)` 페이지에서 항상 렌더링되며 thread 목록을 표시한다.

#### `GET /api/projects/:projectId/threads?status=active`
**기능**: 현재 프로젝트의 active 상태 thread 목록 조회. 사이드바 진입 시 1회 호출.

**Path Parameters**
| name | type | 설명 |
|------|------|------|
| `projectId` | string (UUID 또는 slug) | `useUserStore.activeProjectId` |

**Query Parameters**
| name | type | 설명 |
|------|------|------|
| `status` | `'active' \| 'paused' \| 'completed' \| 'failed' \| 'archived'` (optional) | 필터. 미지정 시 전체. 사이드바는 항상 `active`. |
| `limit` | number (optional, default 50) | 페이지 크기 |
| `offset` | number (optional, default 0) | offset |

**Response 200** — `(Thread & { agent?, team?, _count })[]`
```json
[
  {
    "id": "uuid",
    "projectId": "uuid",
    "agentId": "uuid",
    "teamId": null,
    "agentDeploymentId": null,
    "title": "최신 메일 알려줘",
    "status": "active",
    "metadata": {},
    "userId": "uuid",
    "createdAt": "2026-05-09T10:14:00.000Z",
    "updatedAt": "2026-05-09T10:16:03.392Z",
    "agent": { "id": "uuid", "name": "deep-agent", "slug": "deep-agent", "architecture": "react" },
    "team": null,
    "_count": { "interactions": 0 }
  }
]
```

#### `DELETE /api/threads/:threadId`
**기능**: thread 우클릭 → "삭제" 메뉴. soft-delete (status를 `archived` 로 변경, 이후 list 에서 제외).

**Response 200** — 업데이트된 Thread

#### `PATCH /api/threads/:threadId`
**기능**: thread 메타 업데이트. 현재는 `title` 만 사용 — `ClientChatView` 가 첫 사용자 메시지 전송 시 메시지 첫 40자로 자동 호출.

**Request Body**
```json
{ "title": "최신 메일 알려줘" }
```
- `title`: string (optional, 최대 200자, 200자 초과 시 잘림)

**Response 200** — 업데이트된 Thread

> 클라이언트는 성공 시 `window.dispatchEvent(new CustomEvent('thread-title-updated', { detail: { threadId, title } }))` 로 사이드바 in-place 갱신.

---

### 10.2. `/login` — 로그인 (공통)

| 단계 | API |
|------|-----|
| 1. 로그인 | `POST /api/auth/login` body `{ email, password }` → `{ user, accessToken, refreshToken }` |
| 2. 자동 토큰 갱신 | `POST /api/auth/refresh` body `{ refreshToken }` → `{ accessToken, refreshToken }` |
| 3. 세션 복원 | `GET /api/users/me` → `User` (401 시 null) |
| 4. activeProject 선택 | `GET /api/projects` → `Project[]` (첫 번째 사용) |
| 5. 프로젝트 자동 생성 (없을 때) | `POST /api/projects` body `{ name, slug, description }` → `Project` |

이 흐름은 `useUserStore.login` / `loadCurrentUser` / `initProject` 에 캡슐화되어 있다.

---

### 10.3. `/client/agents` — 에이전트 갤러리

#### `GET /api/client/agents`
**기능**: 현재 사용자가 접근 가능한 활성 AgentDeployment 카드 목록.

**Response 200** — `ClientAgentCard[]`
```json
[
  {
    "deploymentId": "uuid",
    "agentId": "uuid",
    "slug": "deep-agent",
    "name": "deep-agent",
    "description": "메일 요약·답장 초안 작성 및 Slack 보고를 담당하는 인박스 도우미",
    "type": "single",
    "env": { "id": "uuid", "name": "Development", "slug": "dev", "color": "#3b82f6" },
    "version": 2,
    "publicPath": "deep-agent",
    "starters": ["연차 이월 규정 알려줘", "최신 메일 알려줘"],
    "deployedAt": "2026-05-09T01:00:00.000Z"
  }
]
```

---

### 10.4. `/client/agents/[slug]` — 에이전트 상세

#### `GET /api/client/agents/:slug`
**기능**: agent 상세 + 필수 자격증명 + 누락 자격증명 도출.

**Path Parameters**
| name | 설명 |
|------|------|
| `slug` | URL-encoded agent slug |

**Response 200** — `ClientAgentDetail` (= `ClientAgentCard` + 자격증명 정보)
```json
{
  "deploymentId": "uuid",
  "agentId": "uuid",
  "slug": "deep-agent",
  "name": "deep-agent",
  "description": "...",
  "type": "single",
  "env": { ... },
  "version": 2,
  "publicPath": "deep-agent",
  "starters": [...],
  "deployedAt": "...",
  "requiredCredentials": [
    { "kind": "provider", "targetId": "openai", "label": "OpenAI", "reason": "모델 gpt-4o 호출용" },
    { "kind": "tool", "targetId": "gmail", "label": "Gmail", "reason": "메일 조회 (OAuth)" }
  ],
  "missingCredentials": [
    { "kind": "tool", "targetId": "gmail", "label": "Gmail", "reason": "메일 조회 (OAuth)" }
  ]
}
```

**Response 404** — `agent_not_deployed` (활성 배포 없음).

> `missingCredentials.length > 0` 인 경우 client 는 toast + `/client/tools` 로 redirect.

---

### 10.5. `/client/agents/[slug]/chat` & `/client/history?threadId=...` — 채팅

두 페이지 모두 `<ClientChatView slug={...} threadId={...} />` 를 사용해 동일한 흐름을 따른다.

#### 5-1. agent 정보 로드
`GET /api/client/agents/:slug` (§10.4 와 동일)

#### 5-2. thread 생성 (새 대화일 때만 — `threadId` prop 미지정 시)
##### `POST /api/projects/:projectId/threads`
**Request Body** (`CreateThreadRequest`)
```json
{
  "agentId": "uuid",
  "teamId": null,
  "title": "deep-agent 대화",
  "metadata": {}
}
```

**Response 200** — `Thread`
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "agentId": "uuid",
  "title": "deep-agent 대화",
  "status": "active",
  "metadata": {},
  "userId": "uuid",
  "createdAt": "...",
  "updatedAt": "..."
}
```

#### 5-3. 이전 메시지 복원 (기존 thread 진입 시)
##### `GET /api/threads/:threadId/messages`
**기능**: runner 의 LangGraph state 에서 메시지 배열 조회 (NestJS 가 runner 로 프록시).

**Response 200** — `ThreadMessage[]`
```json
[
  {
    "role": "user",
    "content": "최신 메일 하나 알려줘",
    "timestamp": "2026-05-09T10:16:03.392Z"
  },
  {
    "role": "assistant",
    "content": "",
    "toolCalls": [
      { "id": "call_xxx", "name": "task", "args": { "subagent_type": "Mail_Reader_Sub_Agent", "description": "..." }, "type": "tool_call" }
    ],
    "timestamp": "..."
  },
  {
    "role": "tool",
    "content": "가장 최신 메일 1개입니다 ...",
    "timestamp": "..."
  },
  {
    "role": "assistant",
    "content": "최신 메일입니다 ...",
    "timestamp": "..."
  }
]
```
- 클라이언트는 `role === 'user' | 'assistant'` 만 표시 (`tool` / `system` 무시).
- 응답이 `{ messages: [...] }` 객체일 가능성도 안전하게 처리할 것 (호환성).

#### 5-4. 메시지 전송
##### `POST /api/threads/:threadId/invoke`
**기능**: 메시지를 runner 로 위임 → agent 실행. WebSocket 으로 진행상태 stream + HTTP 응답으로 최종 messages 반환.

**Request Body**
```json
{ "content": "최신 메일 알려줘" }
```

**Response 200** — runner 의 raw 응답 (구조는 architecture 마다 다름)
```json
{
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "최종 답변", "toolCalls": null }
  ]
}
```
- 클라이언트는 마지막 `assistant` 메시지 (`toolCalls` 없고 `content` 비어있지 않음) 를 fallback 으로 사용 (WS `agent.token` 이 누락된 경우 대비).

#### 5-5. 첫 메시지 시 자동 제목
첫 사용자 메시지 전송 직후 `PATCH /api/threads/:threadId` 호출 (§10.1 참조).

#### 5-6. HITL 승인/거절 (현재 client UI 미사용, 정의만)
##### `POST /api/threads/:threadId/resume`
```json
{ "approved": true }
```

#### 5-7. WebSocket — 진행상태 스트리밍

**연결**
```js
io('http://localhost:4300', {
  transports: ['websocket', 'polling'],
  reconnection: true,
})
socket.emit('thread.subscribe', { threadId })
```

**수신 이벤트** (`wsClient.on(eventName, handler)`)

| 이벤트 | payload | 용도 |
|--------|---------|------|
| `agent.token` | `{ threadId, content, done, depth, parentStepId }` | assistant 메시지 토큰 스트림 (`depth === 0` 만 표시) |
| `step.started` | `{ stepId, name, stepType, depth, parentStepId }` | tool / sub-agent 실행 시작 → 진행 카드의 step 노드 추가 |
| `step.completed` | `{ stepId, latencyMs }` | step 종료 (성공) |
| `step.failed` | `{ stepId, latencyMs }` | step 종료 (실패) |
| `turn.completed` | `{ finalContent }` | 1회 turn 종료 → 진행 카드 done 처리, 최종 메시지 fallback |

> §4 의 외부 `/v1/chat` namespace 와 별개의 기본 namespace (`/`) 를 사용. payload 구조도 다르므로 주의.

---

### 10.6. `/client/tools` — 도구 / Provider 관리

이 페이지는 두 개의 카탈로그 (provider, tool) 와 자격증명 등록·검증·삭제 + Gmail OAuth 흐름을 담는다.

#### 6-1. Provider 카탈로그
##### `GET /api/me/providers`
**기능**: 시스템 Provider 카탈로그 + 본인 보유 자격증명 표시.

**Response 200**
```json
[
  {
    "id": "uuid",
    "slug": "openai",
    "name": "OpenAI",
    "type": "llm",
    "iconUrl": null,
    "owned": true,
    "userCredentials": [
      { "id": "uuid", "label": "Personal", "status": "active", "lastVerifiedAt": "2026-05-08T09:00:00.000Z" }
    ]
  }
]
```

##### `POST /api/me/providers`
**기능**: provider 자격증명 등록 (내부적으로 `UserCredential(kind=provider)` 생성).

**Request Body**
```json
{
  "providerId": "uuid",
  "value": "sk-...",
  "label": "Personal",
  "metadata": { "organization": "org-xxx" }
}
```
- `providerId`: catalog row 의 `id` (UUID — slug 아님 주의)
- `value`: 평문 API key (서버에서 즉시 암호화)
- `label`: 같은 provider 다중 등록 시 구분 (optional)
- `metadata`: 부가 정보 (optional)

**Response 201**
```json
{
  "id": "uuid",
  "provider": { "id": "uuid", "slug": "openai", "name": "OpenAI" },
  "kind": "provider",
  "targetId": "openai",
  "label": "Personal",
  "status": "active",
  "createdAt": "..."
}
```

**Response 409** — 동일 (provider + label) 중복.

#### 6-2. 도구 카탈로그
##### `GET /api/me/tools`
**기능**: 도구별 자격증명 카탈로그 + 본인 보유 여부.

**Response 200**
```json
[
  {
    "targetId": "gmail",
    "label": "Gmail",
    "description": "Gmail API 접근",
    "authType": "oauth",
    "triggers": ["gmail_search", "gmail_fetch", "gmail_send"],
    "owned": true,
    "userCredentials": [
      { "id": "uuid", "label": "default", "status": "active", "lastVerifiedAt": "2026-05-09T10:00:00.000Z" }
    ]
  }
]
```

#### 6-3. 일반 자격증명 CRUD (`/api/me/credentials`)
##### `GET /api/me/credentials?kind=provider|tool|mcp`
**Response 200** — `UserCredential[]`
```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "kind": "provider",
    "targetId": "openai",
    "label": "Personal",
    "metadata": null,
    "status": "active",
    "lastVerifiedAt": "2026-05-08T09:00:00.000Z",
    "createdAt": "...",
    "updatedAt": "...",
    "maskedValue": "sk-****abcd",
    "lastFour": "abcd"
  }
]
```

##### `POST /api/me/credentials`
**Request Body** (`CreateUserCredentialRequest`)
```json
{
  "kind": "tool",
  "targetId": "gmail",
  "label": "default",
  "value": "...",
  "metadata": { "scope": "gmail.readonly gmail.send" }
}
```
**Response 201** — `UserCredential` (마스킹). 평문 `value` 는 다시 노출되지 않음.

**Response 409** — `(kind + targetId + label)` 중복.

##### `PATCH /api/me/credentials/:id`
**Request Body** (모두 optional)
```json
{ "label": "...", "value": "...", "metadata": {} }
```
- `value` 교체 시 새로 암호화되어 저장.

##### `DELETE /api/me/credentials/:id`
**Response 200** — `{ "id": "uuid" }`

##### `POST /api/me/credentials/:id/test`
**기능**: 자격증명 실 검증 (provider:openai/anthropic 은 ping, 그 외는 형식 sanity check).

**Response 200** — `VerifyUserCredentialResponse`
```json
{ "ok": true, "status": "active", "message": "OK" }
```
**Response 422** — `{ ok: false, status: "invalid", message: "..." }` (`credential_invalid`).

#### 6-4. Gmail OAuth (`/api/me/credentials/gmail`)

##### `GET /api/me/credentials/gmail/oauth-app`
**기능**: 본인의 Gmail OAuth 앱 (clientId/secret/redirectUri) 설정 + 연동 상태.

**Response 200**
```json
{
  "configured": true,
  "connected": true,
  "clientId": "xxx.apps.googleusercontent.com",
  "redirectUri": "http://localhost:3001/client/oauth/google/callback",
  "scopes": ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
  "hasClientSecret": true,
  "connectedAt": "2026-05-09T10:00:00.000Z",
  "status": "active"
}
```

##### `PUT /api/me/credentials/gmail/oauth-app`
**기능**: Gmail OAuth 앱 설정 저장.

**Request Body**
```json
{
  "clientId": "xxx.apps.googleusercontent.com",
  "clientSecret": "GOCSPX-...",
  "redirectUri": "http://localhost:3001/client/oauth/google/callback",
  "scopes": ["https://www.googleapis.com/auth/gmail.readonly"]
}
```
- `clientSecret`: optional (저장된 값 유지하려면 생략).

**Response 200** — `{ "success": true }`

##### `DELETE /api/me/credentials/gmail/oauth-app`
**기능**: 앱 설정 + refresh_token 모두 삭제.

##### `GET /api/me/credentials/gmail/auth-url`
**기능**: Google OAuth 동의 URL 발급. 사용자를 이 URL 로 redirect.

**Response 200** — `{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }`

##### `POST /api/me/credentials/gmail/disconnect`
**기능**: refresh_token 만 제거 (앱 설정은 유지).

**Response 200** — `{ "success": true }`

---

### 10.7. `/client/oauth/google/callback` — OAuth 콜백 처리

Google 동의 화면이 redirect 한 URL (`?code=...&state=...`) 을 받아 토큰 교환.

#### `POST /api/me/credentials/gmail/callback`
**기능**: authorization code 를 refresh_token + access_token 으로 교환 후 DB 에 저장.

**Request Body**
```json
{
  "code": "4/0Adeu5BW...",
  "state": "<state from auth-url>"
}
```

**Response 200** — `{ "connected": true }`

성공 후 client 는 `/client/tools` 로 redirect.

---

### 10.8. 에러 코드 (10.x 전용)

| code | HTTP | 의미 |
|------|------|------|
| `agent_not_deployed` | 404 | slug 가 활성 AgentDeployment 없음 |
| `credential_missing` | 409 | 호출 시점 자격증명 누락 (chat 진행 중에는 socket.io `chat.error` 로 emit) |
| `credential_invalid` | 422 | provider key 검증 실패 (`/test` 또는 사용 시점) |
| `forbidden_credential` | 403 | 다른 user 의 credential 접근 시도 |
| `oauth_state_mismatch` | 400 | OAuth callback `state` 불일치 |

---

### 10.9. 디자인 시스템 / UI 가이드

본 client UI 의 디자인 토큰·페이지 매핑은 `refactoring-deep-agent-plan.md` Phase 10 §10-1 참조. 핵심 토큰:

| 토큰 | 값 |
|------|----|
| 배경 | `var(--client-bg)` |
| 패널 | `var(--client-panel)` / `var(--client-panel-2)` |
| 보더 | `var(--client-border)` / `var(--client-border-2)` |
| 텍스트 | `var(--client-text)` (메인) / `var(--client-muted)` / `var(--client-muted-2)` |
| Primary | `var(--client-primary)` |
| 폰트 | Pretendard / JetBrains Mono |

페이지: `/client/agents` (갤러리), `/client/agents/[slug]` (상세), `/client/agents/[slug]/chat` (chat), `/client/tools` (자격증명·OAuth), `/client/history` (채팅 히스토리 — 사이드바와 통합).

재사용 컴포넌트:
- `apps/agent-web/src/components/client/ClientChatView.tsx` — chat UI 본체 (slug + threadId props).
- `apps/agent-web/src/app/(client)/_components/sidebar.tsx` — 메뉴 + thread 목록 (검색 + 우클릭 삭제).
- `apps/agent-web/src/app/(client)/_components/header.tsx` — 페이지 상단 타이틀 헤더.

에이전트 카드 클릭 시 누락 자격증명이 있으면 `<MissingCredentialsDialog>` 표시 → 사용자를 `/client/tools?focus=<targetId>` 로 유도.
