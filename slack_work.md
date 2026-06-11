# Slack 연동 작업 기록 (2026-05-20)

## 목표
Slack 워크스페이스(`agent002`) 채널에서 봇 멘션(`@AgentStudio Agent ...`) 또는 봇 DM 수신 시,
매핑된 AgentStudio Agent 가 응답을 생성해 같은 Slack 스레드에 답변 게시.

## 아키텍처 결정

- **수신 방식**: Socket Mode (공개 URL 불필요, App-Level Token + WebSocket)
- **워크스페이스**: 단일(`agent002`) MVP. 멀티 워크스페이스는 향후 OAuth Add-to-Slack 흐름으로 확장.
- **토큰 저장**: `.env` 가 아닌 DB(`slack_installations` 테이블)에 AES-256-GCM 암호화 저장.
- **매핑 단위**: `(workspace_team_id, channel_id, mode)` UNIQUE. mode 는 `channel | dm | both`.
- **응답 게시**: Slack `chat.postMessage` (`thread_ts` 동일 스레드에).
- **자격증명 라우팅**: `SlackInstallation.installedByUserId` 의 user 자격증명(OpenAI/Anthropic 등)으로 invoke.

## Slack App 측 설정 (사용자가 수행)

- Workspace: `agent002` (T0B53DSD3T6)
- App: `AgentStudio Agent` (A0B4TFS3L3V, bot user `U0B4XQXL2JJ`)
- Socket Mode 활성화 + App-Level Token (`xapp-…`) 발급 (`connections:write`)
- Event Subscriptions ON + `app_mention`, `message.im` 구독
- Bot Token Scopes (`xoxb-…`):
  - `app_mentions:read` ← **필수 (manifest 누락분 추후 추가)**
  - `channels:read`, `channels:history`
  - `groups:read`, `groups:history`
  - `chat:write`
  - `users:read`
  - `im:read`, `im:history`
  - `reactions:read`
- 봇을 채널에 초대 (`/invite @AgentStudio Agent`) — 채널 멘션 수신은 봇이 그 채널 멤버여야 함.

## 코드 변경

### 1) DB 스키마 (`packages/database/prisma/schema.prisma`)

신규 모델 2개 + enum 1개 추가:

- **`SlackInstallation`** — 워크스페이스별 봇 설치 (id, projectId, **installedByUserId**, workspaceTeamId UNIQUE, workspaceName, botUserId, botTokenEnc, appTokenEnc, enabled, installedAt, updatedAt)
- **`SlackChannelAgent`** — 채널→Agent 라우팅 매핑 (id, projectId, workspaceTeamId, channelId, channelName, agentId, mode, enabled, createdAt, updatedAt). UNIQUE(workspaceTeamId, channelId, mode).
- enum **`SlackRoutingMode`** = `channel | dm | both`
- `Project`/`Agent` 모델에 inverse relation 추가

### 2) Prisma 마이그레이션 (3개, 수동 SQL 작성·적용)

> dev DB 에 외부 drift 가 있어 `prisma migrate dev` 가 reset 을 요구. 데이터 보호상 reset 회피하고 우리 변경분만 수동 SQL 로 적용 + `_prisma_migrations` 에 직접 등록.

- `20260520080123_add_slack_channel_agent/migration.sql` — `SlackRoutingMode` enum + `slack_channel_agents` 테이블 + 인덱스/FK
- `20260520081220_add_slack_installation/migration.sql` — `slack_installations` 테이블 + 인덱스/FK
- `20260520090537_add_slack_installation_user/migration.sql` — `installed_by_user_id` 컬럼 추가

```sql
UPDATE slack_installations SET installed_by_user_id = '<admin user id>' WHERE installed_by_user_id IS NULL;
```
기존 row 1건 backfill 완료 (admin@example.com).

### 3) Backend (`apps/api/src/modules/slack/`)

신설 파일:
- `slack.module.ts`
- `slack-installations.service.ts` — 토큰 암호화 저장 + `auth.test` 자동 검증
- `slack-installations.controller.ts` — `GET/POST/PATCH/DELETE /api/slack/installations` (admin only, `@CurrentUser('id')` 로 admin user 자동 저장)
- `slack-channel-agents.service.ts` — 매핑 CRUD + 이벤트 핸들러용 lookup(`find(teamId, channelId, mode)`)
- `slack-channel-agents.controller.ts` — `GET/POST/PATCH/DELETE /api/slack/channel-agents`
- `slack-runtime.service.ts` — **핵심**
  - `onModuleInit` 시 활성 installation row 로드 → Bolt App + Socket Mode 부팅
  - `app.event('app_mention')` / `app.event('message')` 핸들러 등록
  - 이벤트 수신 → DedupeSet 으로 중복 제거 → 매핑 조회 → `agent-runner-py` 의 `/api/v1/threads/{threadId}/invoke` 호출 → 응답 텍스트 추출 → `chat.postMessage`
  - Slack `thread_ts` 동일하면 AgentStudio `Thread` 재사용 (PostgreSQL JSON metadata 검색)
  - Thread 생성 시 **`userId: installation.installedByUserId`** 주입 → admin 의 OpenAI/Anthropic 자격증명 자동 사용
  - 에러 시 fallback 메시지 ("죄송합니다, 응답 생성 중 오류가 발생했습니다.")
  - `LogLevel.DEBUG` + Bolt `app.error()` 핸들러 + 진입 로그(`[app_mention] channel=... text=...`)로 진단 강화
- DTO 4개: `create-installation`, `upsert-installation`, `create-channel-agent`, `update-channel-agent`

기타:
- `apps/api/package.json` — `@slack/bolt@^4.7.2` 추가
- `apps/api/src/app.module.ts` — `SlackModule` 등록

### 4) Frontend (`apps/agent-web/`)

신설:
- `src/app/(dashboard)/integrations/slack/page.tsx` — `/integrations/slack` 페이지 (admin 전용)
- `src/components/slack/SlackInstallationCard.tsx` — 토큰 등록 모달, enabled 토글, 삭제
- `src/components/slack/SlackChannelAgentList.tsx` — 채널 매핑 추가/삭제/토글

수정:
- `src/lib/api-client.ts` — `SlackInstallationView`, `SlackChannelAgent`, `SlackRoutingMode` 타입 + `apiClient.slack.{installations, channelAgents}` 메서드. `projectId` 를 query param 으로 전송.
- `src/lib/mcp-catalog.ts` — Slack(Bot Token) MCP 카탈로그 항목 추가 (참고용, 본 Slack Events 흐름과는 별개)
- `src/components/layout/app-sidebar.tsx` — Admin 섹션에 Slack 링크 추가

## 진행 중 만났던 문제 & 해결

| # | 증상 | 원인 | 해결 |
|---|------|------|------|
| 1 | Slack manifest YAML 입력이 거부 | Slack manifest editor 가 JSON-only | JSON 으로 전환 |
| 2 | 토큰 등록 시 `projectId: undefined` Prisma 에러 | Frontend 가 `projectId` query 미전송 | api-client.slack.* 메서드들이 `projectId` 인자 받아 query 추가 |
| 3 | 토큰 등록 200 OK 인데 UI 가 "미연결" 표시 | Backend 응답은 row 객체, frontend 는 `installed: boolean` 기대 | `page.tsx` loadInstallation 에서 `data.id` 존재 여부로 `installed` 도출 |
| 4 | 멘션 보내도 응답 X / 로그도 X | Bot Token 의 granted scope 에 `app_mentions:read` 없음 (manifest 누락) | OAuth & Permissions 에서 scope 추가 → **Reinstall** → enabled OFF/ON 으로 Bolt App 재기동 |
| 5 | 이벤트 수신은 됐는데 에이전트 응답: "응답 생성 중 오류" | `openai provider 자격증명 미등록` (Slack thread 의 `userId: null` 이라 admin 자격증명 못 찾음) | `SlackInstallation.installedByUserId` 컬럼 추가 → installation 저장 시 admin userId 자동 저장 → Slack thread 생성 시 그 userId 주입 |

## 진단 가능한 로그 위치

- `.dev-logs/api.log` — NestJS api 표준출력 (Bolt DEBUG 로그 + `[SlackRuntimeService]` 진입/에러 로그 모두 여기)

## 다음 단계 (인터넷 복구 후)

1. 위 #5 backfill + 재기동 후 멘션 재시도 → 응답 정상 확인
2. 채널이 아닌 봇 DM 흐름 검증
3. 동일 Slack `thread_ts` 후속 메시지 → 같은 AgentStudio Thread 재사용 확인
4. (선택) Bolt `logLevel: DEBUG` 를 prod 에선 INFO 로 낮추기
5. (장기) 멀티 워크스페이스 OAuth "Add to Slack" 흐름 추가

## 작업 브랜치

`refactoring-deep-agent` (사용자 명시 지시 없이 신규 브랜치 미생성)

## 관련 작업일지

`작업일지.md` 의 2026-05-20 항목 (MCP 카탈로그에 Slack(Bot Token) 추가, 이외 Slack 모듈 신설 항목은 backend-senior-developer 위임 보고 기준)
