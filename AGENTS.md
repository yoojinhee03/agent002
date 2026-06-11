# AGENTS.md — AgentStudio AI Harness Rules

> 이 파일은 Claude Code, Gemini CLI 등 모든 AI 코딩 에이전트의 공통 행동 규칙을 정의합니다.
> **바이브 코딩 사이클** (AI 코딩 → 리뷰 → 규칙 보강)을 반복하며 점진적으로 고도화합니다.

---

## Project Overview

AgentStudio is an enterprise AI Agent management platform — a Turborepo monorepo with three services:

- **apps/agent-web** — Next.js 16 frontend (port 28002)
- **apps/api** — NestJS management API (port 28001) — auth, projects, workflows, tools, runs, deployments
- **apps/agent-runner-py** — FastAPI execution engine (port 28003) — LangGraph Python + deepagents 패키지 기반 실행 엔진
- **packages/shared** — TypeScript types shared across TS apps

---

## Commands

### 최초 셋업 (fresh clone)
```bash
# 1) 환경변수 준비
cp .env.example .env
cp apps/agent-runner-py/.env.example apps/agent-runner-py/.env

# 2) 한 방 실행 (Docker → pnpm install → prisma generate → migrate deploy)
pnpm setup

# 3) 시드 (선택)
pnpm db:seed

# 4) Python 실행 엔진 의존성
cd apps/agent-runner-py && uv sync && cd -

# 5) 전체 서비스 기동
pnpm dev
```

> `pnpm setup`은 `docker compose up -d` → `pnpm install` → `db:generate` → `db:deploy` 순으로 실행된다.
> Prisma 마이그레이션 명령(`db:migrate` / `db:deploy` / `db:push` / `db:seed` / `db:studio`)은 모두 `dotenv-cli`로 루트 `.env`를 자동 로드하므로 별도 환경변수 export가 필요 없다.

### Root (all services via Turborepo)
```bash
pnpm dev        # Start all services in watch mode
pnpm build      # Build all apps/packages
pnpm lint       # Lint all apps/packages
pnpm clean      # Clean build artifacts and Turbo cache
```

### apps/api (Management API)
```bash
pnpm dev              # NestJS watch mode, port 28001
pnpm build            # Compile TypeScript
pnpm lint             # ESLint on src/**/*.ts
pnpm db:migrate       # Prisma migration (dev)
pnpm db:push          # Push schema without migration
pnpm db:seed          # Seed initial data (admin@example.com / password)
pnpm db:studio        # Open Prisma Studio
```

### apps/agent-web (Frontend)
```bash
pnpm dev        # Next.js + Turbopack, port 28002
pnpm build      # Production build
pnpm lint       # ESLint on src/
```

### apps/agent-runner-py (Execution Engine — Python)
```bash
# uv 기반 (권장)
cd apps/agent-runner-py
uv sync                              # 의존성 설치
uvicorn src.main:app --port 28003 --reload  # 개발 서버

# pip 기반
pip install -e .
python -m src.main
```

### Infrastructure (Docker)
```bash
docker compose up -d    # Start PostgreSQL (port 28010) + Redis (port 28011) for development
```

---

## Architecture

### Service Map
```
apps/agent-web  (Next.js 16, port 28002)
      │
      ├──→  apps/api                (NestJS, port 28001)  — 관리 API
      └──→  apps/agent-runner-py    (FastAPI, port 28003)  — 실행 엔진 (Python)
                    │
             ┌──────┴──────┐
          PostgreSQL      Redis
          (port 28010) (port 28011)
```

### apps/api — Management API
- **모듈:** auth, users, projects, workflows, tools, runs, providers, environments, deployments, endpoints, api-keys, dashboard, usage, monitoring
- JWT Bearer 인증 + role guard (admin/user)
- Prisma ORM on PostgreSQL 16
- Swagger docs at `/api/docs`

### apps/agent-runner-py — Execution Engine (Python)
- **기술 스택:** FastAPI + uvicorn / LangGraph Python / python-socketio / Prisma Python / aioredis / arq
- **모듈:** `auth`, `cache`, `langgraph`, `agents`, `teams`, `threads`, `hitl`, `builtin_tools`, `mcp`, `execution`
- **`src/modules/deep/`** — 가드레일(`guardrails.py`), 메모리(`memory.py`), 도구 권한(`tool_wrapping.py`), 공유 모델(`models.py`) 내부 래퍼 모음
- deepagents 자동 라우팅: 에이전트의 `memoryConfig/guardrailsConfig/reasoningConfig`가 활성화된 경우 공식 `deepagents` 패키지 및 `src/modules/deep/`을 통해 실행
- 동일 WebSocket 이벤트 포맷 (`agent.streaming`, `step.progress`, `run.completed`) — 기존 프론트엔드와 완전 호환
- Swagger docs at `/api/v1/docs` (FastAPI 자동 생성)

### apps/agent-web — Frontend
- Zustand + Immer 상태 관리 (stores: user, project, workflow, run, tool, deployment)
- `@xyflow/react` — 워크플로우 캔버스 (drag-and-drop, 커스텀 노드)
- `src/lib/api-client.ts` — fetch 기반 API 클라이언트 (단일 `ApiClient` 클래스)
- Tailwind CSS 4 + shadcn/ui

### packages/shared
- 두 서비스(api, web)와 공유하는 TypeScript 타입 (`Workflow`, `WorkflowRun`, `StepTrace`, `Tool` 등)
- **변경 시 두 앱 모두 영향을 받는다.** 변경 전 파급 범위를 먼저 확인한다.

---

## Database

PostgreSQL 16, Prisma 관리.

| 엔티티 | 설명 |
|--------|------|
| User / Project | 인증, 워크스페이스 |
| Workflow / WorkflowVersion | 에이전트 워크플로우 정의 + 버전 이력 |
| Tool | HTTP / Code / Search 도구 |
| WorkflowRun / StepTrace | 실행 기록 + 노드별 트레이스 |
| AgentMemory | 에이전트 메모리 (short-term, long-term, episodic) |
| Provider / Model | AI 프로바이더 설정 |
| Deployment / Endpoint / ApiKey | 배포 및 외부 API 접근 관리 |
| DailyMetric | 사용량 집계 |

스키마: `apps/api/prisma/schema.prisma`

---

## Authentication

- **Management API** (`apps/api`): JWT Bearer 토큰 — `POST /api/auth/login`
- **Execution Engine** (`apps/agent-runner-py`): `X-API-Key` 헤더 — 엔드포인트별 키

---

## Phase 1 — AI 코딩 (Coding Phase)

### 1-1. 작업 착수 전 필수 확인

1. **범위 확인** — 요청 범위를 벗어나는 변경을 하지 않는다. 기능 추가/리팩터링은 명시된 경우만 허용.
2. **파일 읽기 우선** — 수정 전 반드시 대상 파일을 읽는다. 읽지 않은 파일은 추측으로 작성하지 않는다.
3. **의존성 확인** — `packages/shared` 변경은 서비스(api, web) 모두에 영향을 준다. 변경 전 파급 범위를 먼저 파악한다.
4. **기존 패턴 우선** — 새 유틸·헬퍼·추상화를 만들기 전에 기존 코드에서 재사용 가능한 패턴을 찾는다.
5. **작업일지 기록** — 모든 작업 착수 전 `작업일지.md`에 작업 내용·목표를 기록한다. 작업 완료 후 결과·변경 파일·특이사항을 기록한다. 작성자 이름은 `git config user.name` 결과를 사용한다. # Added: 2026-04-23

### 1-2. 코드 작성 원칙

- **언어 준수** — 모든 답변은 항상 한국어로 작성한다.
- **최소 변경** — 요청된 것만 구현한다. 주변 코드를 정리하거나 개선하지 않는다.
- **보안 우선** — SQL injection, XSS, command injection 등 OWASP Top 10을 항상 검토한다.
  - 사용자 입력은 class-validator DTO로 검증.
  - API Key, JWT Secret 등 시크릿은 절대 코드에 하드코딩하지 않는다.
- **타입 안전** — `any` 타입 사용을 금지한다. 불명확한 경우 `unknown`을 쓰고 타입 가드를 추가한다.
- **에러 처리** — 외부 API 호출, DB 쿼리, Redis 연산에는 반드시 에러 처리를 포함한다.
  - NestJS: `HttpException` 또는 전용 exception filter 사용.
  - Next.js: `try-catch` + `sonner` toast 패턴 준수.
- **주석 금지** — 자명한 코드에 주석을 추가하지 않는다. 비자명한 로직에만 간결한 주석을 허용한다.

### 1-3. 서비스별 규칙

#### apps/api (Management API)
- 새 기능은 NestJS 모듈 구조(module / controller / service / dto)를 따른다.
- Prisma 쿼리는 서비스 레이어에서만 호출한다. 컨트롤러에서 직접 쿼리 금지.
- 새 엔드포인트는 Swagger `@ApiOperation`, `@ApiResponse` 데코레이터를 포함한다.
- 기본 포트: `28001`. 환경변수 `PORT`로 오버라이드 가능.

#### apps/agent-runner-py (Execution Engine — Python)
- 실행 흐름: `threads_router` → `threads_service` → `agents_service` → `langgraph_service` (또는 `deepagent_bridge`)
- 새 엔드포인트 추가 시 FastAPI `APIRouter`를 사용하고 `src/main.py`에 `include_router`로 등록한다.
- 모든 에이전트 실행은 `deepagent_bridge`의 `create_deep_agent()` 경로로 일원화되었다. 워크플로우(v1) runs만 `langgraph_service` 경로를 사용한다.
- WebSocket 이벤트는 `hitl_gateway.py`의 emit 함수를 통해서만 발행한다. 직접 `sio.emit()` 호출 금지.
- 환경변수는 `src/config.py`의 `Settings` 클래스에서만 읽는다. 다른 곳에서 `os.environ` 직접 접근 금지.
- 기본 포트: `28003`.
- **Deep Agents 공식 문서 참조 의무 (구현 전 필수)** — `src/modules/deep/*`, `deepagent_bridge`, 서브에이전트·메모리·가드레일·도구 권한·HITL·백엔드 저장소 관련 코드를 작성·수정할 때는 **반드시 아래 중 하나로 최신 공식 문서를 먼저 조회한 뒤** 구현한다. 추측/훈련 지식 기반 구현 금지. # Added: 2026-04-22
  - Context7 (우선): `mcp__plugin_context7_context7__query-docs` 로 `/websites/langchain_oss_python_deepagents` 호출 — `https://docs.langchain.com/oss/python/deepagents/` 하위 페이지(overview, quickstart, customization, core-capabilities/models, core-capabilities/context-engineering, core-capabilities/backends, core-capabilities/subagents, core-capabilities/async-subagents, core-capabilities/human-in-the-loop, deployment 등) 전체가 인덱싱되어 있음.
  - Context7 (보조): `/langchain-ai/deepagents` — 패키지 소스·예제 스니펫 (API 시그니처 확인용).
  - 폴백: `WebFetch https://docs.langchain.com/oss/python/deepagents/<subpath>` — Context7 접근 불가 시에만.
  - **트리거 키워드**: `deepagents`, `create_deep_agent`, `SubAgent`, `memory`(short/long/episodic), `guardrail`, `tool_wrapping`, `context engineering`, `backend`(fs/store), `human-in-the-loop`, `async subagent` 중 하나라도 해당되면 발동.

#### NAVER WORKS 연동 (Bot API) # Added: 2026-05-25

> 네이버 웍스 Bot API 코드(인증·메시지 전송·callback)를 작성·수정할 때는 아래 규칙을 따른다. 상세 스니펫은 `/naver-works` 스킬과 `naver-works-integrator` 서브에이전트를 통해 사용한다.

- **서브에이전트**: `naver-works-integrator` — NAVER WORKS Bot API 작업은 이 에이전트로 위임한다.
- **스킬**: `/naver-works` — JWT 인증, 메시지 전송, callback 처리 스니펫과 공식 문서 링크 제공. 구현 전 먼저 호출한다.
- **인증**: Service Account JWT(RS256). 엔드포인트 `https://auth.worksmobile.com/oauth2/v2.0/token`, grant `urn:ietf:params:oauth:grant-type:jwt-bearer`. `iat`/`exp`는 **요청마다 재생성**(Unix 초, `exp-iat ≤ 3600`). 액세스 토큰은 메모리 캐시 + 만료 60초 전 갱신.
- **시크릿**: `NAVER_WORKS_CLIENT_ID` / `NAVER_WORKS_CLIENT_SECRET` / `NAVER_WORKS_SERVICE_ACCOUNT` / `NAVER_WORKS_PRIVATE_KEY[_PATH]` / `NAVER_WORKS_BOT_ID` / `NAVER_WORKS_BOT_SECRET` / `NAVER_WORKS_SCOPE`. 코드·로그·커밋 메시지에 절대 노출 금지. Python은 `Settings`, NestJS는 `ConfigService`로만 읽는다.
- **메시지 전송 엔드포인트**: 채널 `POST /v1.0/bots/{botId}/channels/{channelId}/messages`, 사용자 `POST /v1.0/bots/{botId}/users/{userId}/messages` (base: `https://www.worksapis.com`). 헤더 `Authorization: Bearer …`, `Content-Type: application/json`. 성공 HTTP 201.
- **콘텐츠**: 공식 문서(`bot-send-content` 하위 페이지)에 정의된 파라미터만 사용. 문서 외 필드 추가 금지.
- **Callback**: `X-WORKS-Signature` HMAC-SHA256(bot_secret, raw_body)→Base64 검증을 **비즈니스 로직 이전**에 수행. 검증 성공 시 즉시 HTTP 200 응답 후 처리는 비동기(BackgroundTasks/Queue)로 위임. NAVER WORKS는 실패 재시도를 보내지 않으므로 200 지연 시 누락 발생.
- **파일성 메시지**(image/file/audio/video): callback payload는 `fileId`만 포함. 본문은 별도 다운로드 API로 가져온다.
- **문서 확인 의무**: 불명확한 필드/응답은 추측하지 말고 `WebFetch`로 `https://developers.worksmobile.com/kr/docs/...` 를 조회해 검증한다.

#### OAuth MCP 표준 (sandbox 격리 환경) # Added: 2026-06-02

> sandbox 컨테이너 안에서 도는 MCP 서버가 OAuth 인증을 받아야 할 때 따르는 공통 표준. agent-runner-py 가 단일 `/oauth/callback` 라우트로 모든 thread/MCP 의 콜백을 수신해 sandbox 매핑 포트로 프록시한다.

- **콜백 URL**: `Settings.PUBLIC_OAUTH_CALLBACK_URL` (예: `http://dweax.iptime.org:28003/oauth/callback`). provider 콘솔에는 **단일 URL** 등록. thread별 라우팅은 `state` 로.
- **state 컨벤션**: `state = "<thread_id>:<csrf_random>"`. MCP 서버는 자체 CSRF 검증을 `csrf_random` 부분으로 수행. 라우터는 `:` 앞 부분만 `thread_id` 로 사용.
- **표준 env** (MCP 서버 측이 읽도록 구현. 모든 stdio MCP 호출에 무조건 주입됨 — OAuth 안 쓰는 MCP 는 무시하면 됨):
  - `MCP_OAUTH_REDIRECT_URI` — provider 등록 + 토큰 교환 시 body 의 redirect_uri
  - `MCP_OAUTH_CALLBACK_HOST` — 내부 리스너 바인드 (`0.0.0.0`)
  - `MCP_OAUTH_CALLBACK_PORT` — 내부 리스너 포트 (`9876`)
  - `MCP_OAUTH_STATE_PREFIX` — state 앞에 붙일 thread_id
  - 위 4개는 `mcp_client_service._stdio_params_for_call` 가 `docker exec -e` 로 자동 주입. 별도 DB 플래그/UI 토글 없음.
- **포트 매핑**: sandbox 컨테이너의 `9876/tcp` 가 호스트의 임의 포트로 매핑됨(`docker_sandbox._create_container`). `SandboxManager.get_oauth_host_port(thread_id)` 로 조회.
- **MCP 등록 시 사용자 env 우선**: `mcp_servers.config.env` 에 `MCP_OAUTH_*` 키를 명시하면 그 값이 표준 주입을 덮어씀.
- **provider 가 HTTPS 강제** 시 SSL/리버스 프록시 추가 — 본 표준은 HTTP 만으로도 동작 가능.

#### apps/agent-web (Frontend)
- 상태 변경은 Zustand 스토어를 통해서만 한다. 컴포넌트 내부 `useState`는 UI-local 상태로만 한정한다.
- API 호출은 `src/lib/api-client.ts`의 `apiClient` 싱글턴을 통해서만 한다. `fetch` 직접 호출 금지.
- `apiClient`에 새 메서드를 추가할 때 반드시 `ApiClient` 클래스 **내부**에 추가한다. (클래스 닫는 `}` 이전)
- **Mutation 핸들러는 반드시 `useApiMutation`을 사용한다.** (`src/lib/use-api-mutation.ts`) # Added: 2026-05-28
  - 직접 `try/catch + toast.success/error` 작성 금지. 자체 `useState saving/deleting` loading 상태 신설 금지 (`isPending` 사용).
  - 한국어 기본 메시지는 `src/lib/messages/mutation.ts`의 `MSG.<domain>.<verb>` 상수에서 가져온다. 도메인이 없으면 상수에 추가.
  - 성공 시 `onSuccess` 콜백 안에서 Zustand store local update(`addX`/`updateX`/`removeX`)를 호출한다. 어쩔 수 없는 경우만 list refetch.
  - 버튼은 `disabled={mutation.isPending}` + `{mutation.isPending ? <Loader2 className="... animate-spin" /> : <원래 아이콘 />}` 패턴. shadcn `Button` wrapper 도입 금지 — 프로젝트는 raw `<button>` + Tailwind 사용.
- Tailwind 클래스는 `cn()` 유틸을 통해 조건부로 적용한다.
- 워크플로우 캔버스 컴포넌트는 `src/components/workflow-canvas/` 디렉토리에 위치한다.
- 새 노드 유형 추가 시 `nodes/` 디렉토리에 컴포넌트를 추가하고 `nodes/node-types.ts`에 등록한다.
- 기본 포트: `28002`.

#### packages/shared
- 타입 변경 시 api / agent-web 서비스 모두의 영향을 확인하고 명시한다.
- `NodeType`은 `workflow.ts`에서만 정의한다. `agent-run.ts`는 `workflow.ts`에서 import해 re-export한다. (중복 export 금지)
- breaking change는 반드시 사용자에게 알리고 확인 후 진행한다.

### 1-4. 커밋 메시지 형식

```
<type>(<scope>): <subject>
```

- **type:** `feat` / `fix` / `refactor` / `docs` / `chore` / `test`
- **scope:** `api` / `runner` / `web` / `shared` / `infra`
- **subject:** 현재 시제, 소문자, 마침표 없음 (한국어 가능)
- 커밋은 요청 없이 자동으로 하지 않는다.
- **`git push`는 반드시 사용자에게 확인을 받은 후에만 실행한다. 커밋 완료 후 "push하시겠습니까?" 라고 먼저 물어본다.** # Added: 2026-04-15

### 1-5. 회귀 진단 원칙 — 파이프라인 trace 우선 # Added: 2026-05-19

> "DB·UI 가 비어 있다" / "기능이 작동 안 한다" 류 회귀를 받았을 때 LLM·프롬프트·모델 같은
> 한쪽 가설로 곧장 들어가지 말고, 데이터가 흐르는 **전체 파이프라인 단계** 를 먼저 trace 한다.

#### 1-5-1. 회귀 보고를 받으면 먼저 파이프라인을 그린다

표준 파이프라인 예시 (Agent Studio 의 LLM-매개 흐름):
```
사용자 입력
  → 백엔드 LLM 호출 (응답 로깅 확인)
    → backend WS emit (room_subscribers 등 로깅 확인)
      → frontend WS handler (콘솔 / store 변화)
        → frontend 사용자 액션 (예: '적용' 버튼)
          → handler 함수 (state 변화 / closure)
            → API 호출 (request body 확인)
              → 백엔드 처리 → DB
```
각 단계에서 데이터가 정상으로 통과하는지 1단계씩 확인. 어디서 끊겼는지 식별한 뒤 그
지점만 손본다.

#### 1-5-2. 백엔드 로그가 정확하면 백엔드는 더 이상 의심하지 않는다

런타임 로그에서 LLM 출력 / WS emit 인자가 **정확한 값으로 채워져 있음** 이 확인되면,
원인은 frontend 적용 흐름 또는 API/DB 단이다. 프롬프트·모델·도구 호출 강제 같은 LLM 측
패치를 추가로 쌓지 말 것.

#### 1-5-3. `await callback()` 직전 `setState` 패턴은 stale closure 1순위 의심

다음 패턴은 React useCallback 클로저 함정이 매우 자주 발생한다:
```ts
setPendingChanges((p) => ({ ...p, ...newFields }))   // ① 비동기 큐
await persistAgent()                                  // ② useCallback 클로저가 ① 이전 값을 캡처
```
`persistAgent` 가 `useCallback(..., [pendingChanges])` 으로 묶여 있으면 같은 render cycle
에서 새 값이 안 보인다. 해결: callback 내부에서 직접 saveData 를 구성하거나, 새 값을
함수 인자로 명시 전달하거나, ref / 최신 state 를 읽도록 변경.

#### 1-5-4. 비용이 큰 LLM 호출을 사용자가 반복 중이면 추가 표면 패치를 멈춘다

사용자가 "Opus / GPT-5 Pro 등으로 여러 번 시도 중" 을 언급하면 즉시 표면 패치를 중단하고
**§1-5-1 의 파이프라인 trace 부터** 다시 한다. 비용·시간 낭비를 막는 신호로 본다.

---

## Phase 2 — 리뷰 (Review Phase)

AI가 코드를 작성한 뒤, 또는 사람이 리뷰를 요청할 때 아래 체크리스트를 순서대로 확인하고 결과를 간결하게 보고한다.

### 2-1. 리뷰 체크리스트

```
[ ] 범위 준수 — 요청 범위 외 변경이 없는가?
[ ] 보안 — 입력 검증, 시크릿 노출, injection 취약점이 없는가?
[ ] 타입 안전 — any 타입, 타입 단언(as) 남용이 없는가?
[ ] 에러 처리 — 외부 호출 실패 시 적절히 처리하는가?
[ ] 중복 제거 — 기존 유틸/컴포넌트를 재사용하지 않고 중복 작성한 코드가 없는가?
[ ] 서비스 규칙 — 각 앱의 패턴(모듈 구조, 상태 관리, API 클라이언트)을 따르는가?
[ ] shared 영향 — packages/shared 변경이 다른 앱에 미치는 영향을 확인했는가?
[ ] 빌드/린트 — pnpm lint가 통과하는가?
[ ] ApiClient 구조 — 새 메서드가 클래스 밖에 추가되지 않았는가?
```

### 2-2. 리뷰 보고 형식

```
## 리뷰 결과

### 통과
- (통과한 항목 목록)

### 문제
- [심각도: 높음/중간/낮음] 파일경로:라인번호 — 문제 설명

### 제안
- (선택적 개선 사항 — 요청하지 않았다면 생략)
```

심각도 `높음` 문제가 있으면 코드 제출 전 반드시 수정한다.

---

## Phase 3 — 규칙 보강 (Rule Reinforcement Phase)

리뷰에서 반복되는 패턴이나 새로운 결정이 생기면 이 파일을 즉시 업데이트한다.

### 3-1. 규칙 보강 트리거

| 상황 | 조치 |
|------|------|
| 리뷰에서 동일 문제가 2회 이상 반복 | 해당 금지 규칙을 Phase 1에 추가 |
| 사용자가 특정 패턴을 명시적으로 승인 | 해당 패턴을 Phase 1 가이드에 추가 |
| 새로운 아키텍처 결정이 내려짐 | Architecture 섹션 업데이트 |
| 새 라이브러리/도구 도입 | Commands 또는 서비스별 규칙에 추가 |
| 보안 이슈 발견 | 보안 규칙에 즉시 추가 |

### 3-2. 규칙 보강 방법

1. 사이클 종료 시 사용자에게 "이번 사이클에서 발견된 패턴입니다. AGENTS.md에 추가할까요?" 라고 제안한다.
2. 사용자가 승인하면 이 파일의 해당 섹션에 규칙을 추가한다.
3. 규칙 추가 커밋 예시: `docs(agents): 리뷰 결과 반영 — [패턴 한 줄 요약]`

### 3-3. 규칙 작성 원칙

- **Why 명시** — 규칙이 존재하는 이유를 한 줄로 기록한다.
- **구체적으로** — "좋은 코드를 작성한다" 같은 모호한 규칙은 허용하지 않는다.
- **날짜 기록** — 규칙 추가 시 `# Added: YYYY-MM-DD` 주석을 달아 이력을 남긴다.

---

## Reinforced Rules Log

> 이 섹션은 사이클을 거치며 보강된 규칙의 이력을 기록한다.

| 날짜 | 발견 경위 | 규칙 |
|------|-----------|------|
| 2026-04-10 | MVP 커밋 lint-staged 실패 | `bash -c` 래퍼 사용 — lint-staged가 file args를 ESLint에 전달하지 않도록 |
| 2026-04-10 | MVP 커밋 TS 파싱 에러 | `ApiClient` 클래스 닫는 `}` 이전에 모든 메서드를 추가한다 |
| 2026-04-10 | shared 타입 중복 export | `NodeType`은 `workflow.ts`에서만 정의, `agent-run.ts`는 re-export만 |
| 2026-04-10 | 로그인 불가 이슈 | **[임시 조치]** API 서버 상태와 무관하게 프런트엔드 접근이 가능하도록 `useUserStore`에서 `admin@example.com`으로 강제 로그인 처리함. |
| 2026-04-22 | deepagents 구현 시 최신 공식 문서 누락 | `src/modules/deep/*`·`deepagent_bridge` 작업 전 Context7(`/websites/langchain_oss_python_deepagents`, `/langchain-ai/deepagents`)로 공식 문서 조회 의무화 — 추측 기반 구현 금지. |
| 2026-04-23 | 임의 브랜치 생성 방지 | 새 브랜치는 사용자의 명시적 지시가 있을 때만 생성. `git checkout -b`/`git switch -c`/`git branch` 임의 실행 금지. |
| 2026-05-19 | Agent Assistant 디버깅 — LLM 가설로 시작해 표면 패치 8단계 쌓음. 실제 원인은 frontend `handleApplyProposed` 의 React stale closure | §1-5 회귀 진단 원칙 신설: 파이프라인 trace 우선 / 백엔드 로그가 정확하면 LLM 미의심 / `await callback()` 직전 `setState` 패턴은 stale closure 1순위 의심 / 비용 큰 LLM 반복 시 표면 패치 중단. |
| 2026-05-25 | NAVER WORKS Bot API 연동 도입 | `naver-works-integrator` 서브에이전트 + `/naver-works` 스킬 + §1-3 NAVER WORKS 연동 규칙(JWT iat/exp 재생성, 시크릿 격리, callback 서명 검증 후 200 즉시 응답, 문서 외 파라미터 금지) 신설. |
| 2026-05-28 | 등록/수정/삭제/활성·비활성화 시 화면 피드백 부재 (약 85개 핸들러 중 60% toast 누락 / store local update 누락) | 공통 `useApiMutation` 훅 + `MSG` 메시지 상수 + `extractErrorMessage` 도입. 모든 mutation 핸들러는 이를 통해 toast/loading/store local update를 일관 처리. 직접 try/catch+toast 작성 금지, raw `<button>` + `disabled={isPending}` + Loader2 패턴 표준화. |

---

## AI 에이전트 공통 금지 사항

- 사용자 승인 없이 파일을 삭제하지 않는다.
- 절대 커밋/푸시하지 않는다.
- `.env` 파일을 읽거나 수정하지 않는다.
- `git push --force`, `git reset --hard` 등 파괴적 git 명령을 실행하지 않는다.
- `node_modules`, `dist`, `.next`, `.turbo` 내부 파일을 수정하지 않는다.
- **새 브랜치는 사용자의 명시적 지시가 있을 때만 생성한다.** `git checkout -b`, `git switch -c`, `git branch <name>` 등 브랜치 생성 명령을 임의로 실행하지 않는다. 현재 브랜치에서 작업을 진행하고, 브랜치 분기가 필요하다고 판단되면 먼저 사용자에게 확인한다. # Added: 2026-04-23
