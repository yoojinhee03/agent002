# plan.md — 남은 작업 계획

> 앞으로 진행할 작업·계획은 이 파일에 누적 기록한다. 완료된 작업은 `작업일지.md` 에 결과
> 기록 후, 본 파일의 해당 항목을 제거하거나 "완료" 로 표시.
>
> 각 항목은 다음 형식으로 적는다:
> - 목적 / 배경
> - 결정된 사항 (이전 사이클에서 확정된 정책)
> - 구현 범위 (파일·함수 수준)
> - 엣지 케이스
> - 검증 시나리오
> - 커밋 분할 안

---

## Phase 6 — Idle 1시간 자동 로그아웃

### 목적
사용자가 **1시간 이상 활동이 없으면** 자동 로그아웃 + 로그인 페이지로 redirect. admin /
client 각 토큰은 독립 — admin 탭 활동이 client 탭의 idle 타이머를 reset 하지 않음. 활동이
이어지는 동안에는 무한 유지 (현재 access 15분 / refresh 7일 정책은 그대로).

### 결정된 사항 (이전 사이클에서 확정)
- 활동 reset 트리거: `mousedown`, `keydown`, `touchstart`, `apiClient.request 성공`,
  WebSocket 메시지 수신. `mousemove` 는 제외 (너무 자주 발생).
- 만료 시 동작: `apiClient.clearTokens(scope)` → `loginPathFor(scope)` 로 redirect +
  toast "1시간 동안 활동이 없어 자동 로그아웃되었습니다".
- 타이머 체크 간격: 30초 setInterval 로 `Date.now() - storedAt > 1시간` 검사.
- scope 분리 — `admin_last_activity_at` / `client_last_activity_at` 별도 저장.
- 백엔드 변경 없음. 클라이언트에서 강제.

### 구현 범위
1. `apps/agent-web/src/hooks/use-idle-logout.ts` — 신규 훅. 시그니처:
   ```ts
   useIdleLogout({
     scope: 'admin' | 'client'
     timeoutMs: number   // 3_600_000
     onTimeout: () => void
   })
   ```
   - 마운트 시 `last_activity_at_${scope}` 가 없으면 `Date.now()` 로 초기화.
   - 위 이벤트 리스너 등록(passive) + 30초 setInterval 검사.
   - cleanup 시 모두 해제.

2. `apps/agent-web/src/lib/api-client.ts`
   - `LS_KEYS` 옆에 `LS_LAST_ACTIVITY[scope]` 상수 추가 + export.
   - `request` 성공 시 active scope 의 `lastActivityAt` 갱신.
   - `setTokens` (로그인 직후) / `clearTokens` (로그아웃) 도 lastActivity 같이 처리.

3. WebSocket 메시지 수신 hook
   - `wsClient` 정의 위치 (`apps/agent-web/src/lib/websocket-client.ts` 또는 비슷) 의
     `onMessage` 직후 active scope 의 lastActivity 갱신.

4. Layout 통합
   - `apps/agent-web/src/app/(dashboard)/layout.tsx`
     - `useIdleLogout({ scope: 'admin', ..., onTimeout })`
     - `onTimeout`: `apiClient.clearTokens('admin')` + `router.replace('/login')` + toast.
   - `apps/agent-web/src/app/(client)/layout.tsx` — 동일 패턴 `scope: 'client'`.

### 엣지 케이스
| 케이스 | 동작 |
|--------|------|
| 같은 scope 두 탭 | localStorage 공유로 자동 reset 반영 |
| 탭 닫고 1시간 후 재오픈 | 마운트 시점에 timeout 검사 → 곧장 logout |
| 첫 마운트 (storedAt 부재) | `Date.now()` 로 초기화, 그 시점부터 1시간 카운트 |
| 활동이 다른 탭에서 발생 | localStorage 같은 origin 공유 → reset 자동 반영 |
| 사용자 시계 조작 | `Date.now()` 신뢰 (별도 방어 없음) |

### 커밋 분할
1. `useIdleLogout` 훅 + LS 키 상수
2. apiClient `request` / WS message 의 activity hook
3. (dashboard) / (client) layout 통합
4. lint + tsc + 작업일지

### 관련 코드 위치
- `apps/agent-web/src/lib/api-client.ts:88-130` (LS_KEYS / getActiveScope / setTokens / clearTokens)
- `apps/agent-web/src/app/(dashboard)/layout.tsx`
- `apps/agent-web/src/app/(client)/layout.tsx`
- WS client 위치는 착수 시 확인

---

## Phase 4 — admin "전체 보기" 모드 + owner 표시 (계정 종속화 확장)

### 목적
- 일반 사용자는 본인 Project 의 리소스만 가시.
- admin role 은 "전체 보기" 토글로 모든 사용자의 리소스를 가로질러 조회 가능.
- 다른 사용자가 만든 리소스에 **owner 이름 + id tag + 흐림(opacity)** 표시.
- admin role 은 다른 사용자 리소스 수정/삭제 권한 보유.

### 결정된 사항 (Phase 1 사이클에서 확정)
- 적용 리소스: **Agent / Tool(custom) / Skill**. Provider(인증키) / Tool(API key) 는
  Phase 3 에서 이미 사용자별 분리 완료.
- admin 의 권한:
  - 다른 사용자 리소스 **수정·삭제** (실행은 본인 인증키 필요)
  - 비밀번호 리셋 (이미 Phase 3 에서 완료)
- 일반 user 의 행위는 본인 Project 한정.
- UI 표시: 다른 owner 의 리소스는 카드/row 에 owner name + id tag + 흐릿한 opacity.

### 구현 범위
1. 백엔드 — `apps/api/src/modules/agents/`, `tools/`, `skills/`
   - list 메서드에 `scope: 'self' | 'all'` 인자 (admin 만 'all' 허용).
   - admin role + `scope=all` 일 때 projectId 필터 해제.
   - 응답에 owner 정보 포함 (Project.members 또는 직접 User join — 모델 구조 확인 필요).
   - update / delete 가드: admin role 이면 다른 Project 도 통과.

2. shared 타입 — `packages/shared/src/types/`
   - `Agent`, `Tool`, `Skill` 응답에 `owner?: { id: string; name: string; email: string }`
     optional 필드 추가.

3. apiClient — `apps/agent-web/src/lib/api-client.ts`
   - `agents.list(projectId, scope?)` / `tools.list(projectId, scope?)` 등 메서드에
     `scope` 인자 옵션.

4. 프론트엔드 — admin 페이지의 list/카드
   - 상단에 "전체 보기" toggle (admin role 만 노출).
   - 카드/row 에 다른 owner 리소스 표시 시 ID tag + 옅은 opacity(예: 60%) + owner 이름.

### 엣지 케이스
| 케이스 | 동작 |
|--------|------|
| admin 이 다른 owner 의 agent 를 chat 실행 | admin 본인의 Provider 인증키로 실행 시도 (Phase 3 의 사용자별 키 정책 그대로) |
| 일반 user 가 직접 URL 로 다른 사용자 리소스 접근 | 백엔드에서 403 반환 |
| owner 사용자가 삭제된 후 그가 만든 리소스 | owner 표시는 "(삭제된 사용자)" |

### 커밋 분할
1. 백엔드 scope 인자 + admin guard + owner join
2. shared 타입에 owner 필드 추가
3. apiClient `scope` 인자
4. agents 페이지 — 전체 보기 토글 + id tag/흐림 표시
5. tools / skills 페이지 동일 패턴
6. lint + tsc + 작업일지

### 관련 코드 위치
- 백엔드 list: `apps/api/src/modules/agents/agents.service.ts`,
  `apps/api/src/modules/tools/tools.service.ts`,
  `apps/api/src/modules/skills/skills.service.ts`
- 프론트엔드 list: `apps/agent-web/src/app/(dashboard)/agents/page.tsx`,
  `apps/agent-web/src/app/(dashboard)/tools/page.tsx`,
  `apps/agent-web/src/app/(dashboard)/skills/page.tsx`

---

## Phase 7 — DeepAgents Core Capabilities 미구현 항목 점검

### 배경 — "langchain → deepagents native 마이그레이션은 됐는가?"
됐다. 단, **범위가 "SDK 교체 + 실행 하네스 일원화"** 였다.
- `c57df2d` — 자체 `packages/deepagent-sdk/` 제거, 공식 `deepagents` 패키지 도입,
  `deepagent_bridge` 를 `create_deep_agent()` 기반으로 전면 rewrite.
- `a9c659d` — 공식 `subagents` 파라미터로 서브에이전트 위임 전환.
- `23ff748` — 공식 `skills` / `backend` 인자 와이어링.
- 현재 의존성: `deepagents>=0.5.2` (langgraph 1.1.x / langchain 1.x 는 deepagents 의
  기반 런타임이라 남는 게 정상 — 목표는 "langchain 제거"가 아니라 "자체 SDK 제거"였음).

그러나 주변 커스텀 로직(메모리·가드레일·도구권한)은 deepagents-native 로 **전환된 게
아니라** `src/modules/deep/*` 로 **이관(relocate)** 되어 deepagents 를 감싸는 커스텀
래퍼로 남아 있다. 그 결과 deepagents 공식 Core capabilities 13개 중 일부가 미구현/
자체구현 상태다.

### 현황 (deep-agents 공식 문서 Core capabilities 대조)
| 항목 | 상태 | 비고 |
|------|------|------|
| Models | ✅ | `_create_model()`, provider 분기, Anthropic 병렬도구 패치 |
| Subagents | ✅ | `build_subagents()` — 모델·도구·interrupt_on·skills |
| Human-in-the-loop | ✅ | `interrupt_on`, `toolPermissions.requires_approval` 매핑 |
| Skills | ✅ | `skills=` + `_sync_skills_for_run()` + StoreBackend |
| Event streaming | ✅ | 메인 경로(`deepagent_bridge`)가 `astream_events(v2)` 사용. 단 native 이벤트를 그대로 노출하지 않고 2단 자체 어댑터(`_pump_astream_events` → `external_event_adapter` → `chat.*`)로 변환 |
| Streaming (`stream_mode`) | ⚠️ | Event streaming 과 택일 관계 — 메인 경로는 미사용, 레거시 워크플로우 v1(`langgraph_service`)만 `astream(stream_mode=[...])` 사용. `stream_mode="custom"`/`get_stream_writer` 패턴 미사용 |
| Context engineering | ⚠️ | deepagents 기본 미들웨어(`write_todos` 등) 의존 + 자체 TODO 규칙 프롬프트 |
| Backends | ⚠️ | `CompositeBackend+StateBackend+StoreBackend` 를 `/skills/` 라우팅에만 사용. FilesystemBackend·VFS 미사용 |
| Memory | ⚠️ | deepagents native `memory=` 미전달. 자체 `MemoryManager`(Redis STM+Postgres LTM+요약) 결과를 system prompt 에 텍스트 주입 |
| Async subagents | ❌ | `AsyncSubAgent` 사용처 전무. 원격 Agent Protocol/ASGI 위임 경로 없음 |
| Permissions | ❌ | `create_deep_agent(..., permissions=[])` 명시적 비활성화 — "STATE 탭 UI 구현 후 재활성화" 의도적 보류 |
| Sandboxes | ❌ | Modal/Daytona/Deno/local-VFS 샌드박스 백엔드 미사용 |
| Interpreters | ❌ | 코드 실행(`execute` 도구) 경로 없음 |
| Profiles | ⚠️ | 모델 runtime profile(`max_input_tokens` 등) override 기능. 미설정 → 모델 기본 profile 사용. auto-summarization/컨텍스트 한도 동작에 영향. 주로 CLI 설정용 기능이라 임베디드 SDK 사용에서는 우선순위 낮음 |
| Harness | ✅ | 별도 구현 항목이 아니라 `create_deep_agent()` 가 제공하는 내장 capability 묶음의 총칭 — agent002 는 이 하네스 위에서 동작 중 |

### ⚠️ 부분/자체구현 항목 상세

#### Context engineering — 부분
공식 taxonomy 는 **5가지 컨텍스트 유형**이다 (planning/`write_todos` 는 여기 포함되지
않음 — 별도 harness capability):
- ⚠️ **Input context** (system_prompt + memory + skills) — system_prompt 적극 구성
  (`resolve_system_prompt`, TODO 운영 규칙 등), skills ✅, **memory 는 비활성**(아래 Memory 항목)
- ❌ **Runtime context** — `context_schema` + `context=` 미사용. invoke 시 deepagents
  runtime context 객체를 전달하지 않음
- ❌ **Context compression / Offloading** — 도구 결과 >20K 토큰 시 VFS 파일로 내보내는
  기능. `permissions=[]` + `filter_vfs_tools()` 로 VFS 가 꺼져 있어 동작 불가
- ⚠️ **Context compression / Summarization** — 컨텍스트가 모델 `max_input_tokens` 의 85%
  도달 시 LLM 요약 발동. 하네스 기본 동작에 의존하나, 원본 메시지를 VFS 에 보존하는
  부분은 VFS 가 꺼져 약화됨
- ✅ **Context isolation** — `subagents` 파라미터로 위임 (`build_subagents`)
- ⚠️ **Long-term memory** — VFS StoreBackend 기반이 정석이나, 자체 `MemoryManager` 로
  대체했고 그마저 비활성 (아래 Memory 항목 참고)

> 참고: `write_todos`(planning)는 agent002 가 적극 활용 중이며 자체 보정 로직도 다수
> (`_todo_operating_rules_prompt`, `_sweep_final_todos`, `_auto_mark_quick_action_target`,
> `_revert_in_progress_todos_on_cancel`). 단 이는 context engineering taxonomy 가 아니라
> harness 의 planning capability 다.

#### Backends — 부분
공식: StateBackend / StoreBackend / FilesystemBackend / Sandbox / CompositeBackend.
- 현재: `CompositeBackend(default=StateBackend(), routes={"/skills/": StoreBackend(namespace=("filesystem",))})`
- `StateBackend` 가 default 지만 VFS 도구가 꺼져 있어 실질 사용 거의 없음
- `StoreBackend` 는 `/skills/` 경로 전용 (Postgres Store)
- skills 미사용 run 은 `backend=None` (deepagents 기본 StateBackend)
- `FilesystemBackend` · `Sandbox` 미사용
- → backend 추상화는 쓰지만 **skills 파일 라우팅 용도로만** 활용

#### Memory — 자체구현했으나 사실상 미연결 (⚠️ 중요)
공식: deepagents native `memory=` 파라미터 (long-term memory 를 VFS 경로로 노출).
- native `memory=` **미전달**
- 자체 `MemoryManager` 존재 — Redis STM(`deepagent:stm:{thread_id}`) + Postgres LTM
  (`deep_agent_memory` 테이블) + `summarize_messages()` 요약 압축
- **그러나 브릿지는 `get_context()` 만 호출** — STM 을 읽어 system prompt 에 주입
- `add_messages()` · `store_episodic()` 는 **코드베이스 전체에서 호출처가 없음**
  → STM 에 쓰는 경로가 없으므로 `get_context()` 는 사실상 항상 `[]` 반환
- `MemoryManager` 가 `model=` 없이 생성됨 → 요약 압축 경로도 작동 불가
- **결론: 자체 메모리 레이어는 실질적으로 비활성(dead code) 상태.** 실제 멀티턴 대화
  지속은 전적으로 LangGraph **checkpointer**(`get_saver()`, Postgres checkpoint)가 담당
- → "자체구현" 이라기보다 "자체구현했으나 write 경로 미연결" 로 정정

#### Event streaming — 사용 중 (✅, 단 자체 어댑터 경유)
deepagents 의 스트리밍 수신 API 는 두 가지이고 택일 관계다:
- **Event streaming** (`astream_events`) — 그래프 전 구성요소의 lifecycle 이벤트
  (`on_chat_model_stream`·`on_tool_start`·`on_tool_end` 등) firehose
- **Streaming** (`.stream()` + `stream_mode` `updates`/`messages`/`custom`) — mode 별 chunk

agent002 현황:
- 메인 경로 `deepagent_bridge.py` 의 `_pump_astream_events` 가 **`astream_events(version="v2")` 사용**
  → **Event streaming API 를 채택**한 것
- 단 native 이벤트를 그대로 노출하지 않고 2단 자체 어댑터로 변환:
  `astream_events` raw → `_pump_astream_events`(표준 이벤트) → `hitl_gateway` emit →
  `external_event_adapter.py`(`chat.*` 정제, `EXTERNAL_CHAT_ENABLED` 토글) → 프론트
- `stream_mode="custom"` / `get_stream_writer` 등 "Streaming" 페이지 API 는 미사용
  (레거시 워크플로우 v1 `langgraph_service` 만 `astream(stream_mode=[...])` 사용)
- → **"Event streaming API 를 메커니즘으로 쓴다" 는 ✅. "native 이벤트 포맷을 그대로
  활용한다" 는 아님** — 자체 `chat.*` 포맷으로 변환해서 사용

#### Profiles — 기본값 사용
모델 runtime profile(`max_input_tokens` 등) override 미설정 → 모델 기본 profile 사용.
auto-summarization 임계값·컨텍스트 한도 표시에 영향. 주로 deepagents CLI 의 TOML
설정 기능이라 임베디드 SDK 사용 맥락에서는 advanced·저우선순위. (FAQ Q6 참고)

### 결정 필요 사항 (착수 전 사용자 확인)
- 우선순위: `Permissions`/`Backends` 는 이미 "STATE 탭 UI 후 재활성화" 로 묶여 있음.
  `Async subagents`·`Sandboxes`·`Interpreters` 는 진입점 자체가 없음 — 어느 항목부터
  설계할지 미정.
- `Memory` 를 deepagents native `memory=` 로 전환할지, 현 커스텀 `MemoryManager` 유지할지
  정책 미정 (native 전환 시 STM/요약 압축 동작 차이 검증 필요).

### 다음 단계
1. 위 표 항목 중 착수 대상 선정 → 해당 영역 deep-agents 공식 문서 재조회(Context7).
2. 선정 항목별 구현 범위·엣지 케이스·검증 시나리오를 본 Phase 하위에 상세화.

---

## Phase 8 — Built-in 검색 도구 자격증명 자동 주입 (serper / brave)

### 목적 / 배경
Tools 페이지에서 사용자가 Serper / Brave 검색 도구를 등록하고 API key 를 me-tools 화면에서
입력해도, runner 실행 단계에서 `serper_search` / `brave_search` 도구 함수에 **api_key 가
inject 되지 않아** 실제로는 `api_key=""` 인 상태로 호출된다 (401/404). 즉 UI/카탈로그상
활성화만 되어 있고 실제 호출은 실패. Gmail 도구는 `get_custom_tools(agent_id, user_id,
source)` 흐름으로 OAuth 토큰을 fetch 하여 inject 하므로 동작하는데, search 도구만 이 흐름이
빠져 있음.

### 결정된 사항 (이전 사이클에서 확정)
- 자격증명 매핑은 `apps/api/src/modules/client-agents/tool-credential-map.ts` 의 기존 매핑
  (`serper_search → targetId:'serper'`, `brave_search → targetId:'brave'`, authType=`api_key`)
  을 권위로 한다. 신규 매핑 도구 등록 시 이 파일만 갱신하면 자동 주입되도록 일관 적용.
- runner 측 `_build_all` 의 lambda 클로저에 **빌드 시점에 api_key 를 미리 캡처**. LLM 이
  도구 호출 시 api_key 인자를 채우는 부담을 제거.
- 누락 시 동작: 기존 Gmail 패턴과 동일하게 `emit_error(thread_id, ..., type='credential_missing',
  details.targetId)` 로 명시적 emit. UI 가 사용자에게 자격증명 등록을 안내.
- 환경변수 fallback (`os.getenv("SERPER_API_KEY")`) 은 도입하지 않는다 — Phase 10-7 의
  "사용자별 자격증명만 사용" 원칙과 충돌.

### 구현 범위
- `apps/agent-runner-py/src/modules/builtin_tools/builtin_tools_service.py`
  - `_build_all(agent_id, thread_id, user_id, source, user_credentials)` — 마지막 인자 추가.
  - serper/brave lambda 를 `api_key = user_credentials.get(f"tool:{targetId}") or ""` 로
    미리 바인딩. 빈 키면 함수 진입부에서 즉시 `RuntimeError("credential_missing:serper")`.
- `apps/agent-runner-py/src/modules/builtin_tools/builtin_tools_service.py::BuiltinToolsService.get_tools`
  - `user_credentials` 파라미터 추가.
- `apps/agent-runner-py/src/modules/agents/agents_service.py::_load_builtin_tools` /
  `load_agent_with_deps` — `userCredentials` 를 BuiltinToolsService 까지 전달.
- `apps/agent-runner-py/src/modules/deep/tool_wrapping.py` 또는 deepagent_bridge — search
  도구 진입부에서 `credential_missing` 발생 시 `emit_error` 로 변환.
- `tool-credential-map.ts` 매핑 키 → runner 가 동일 slug (`tool:serper`, `tool:brave`)
  로 자격증명 dict 를 조회하도록 사양 통일. 현재 NestJS 가 `kind:targetId` 포맷으로 inject
  중인지 사전 확인.

### 엣지 케이스
- 동일 thread 에서 사용자 자격증명이 중간에 갱신된 경우 — 다음 turn 부터 적용 (도구 lambda
  는 `_build_all` 호출 시점에 캡처되므로 자동).
- agent.builtinToolIds 에 serper 만 있고 사용자가 brave 만 등록한 경우 — 호출 자체가 없음.
- `assistant_tools.list_available_tools` 가 `_build_all` 을 호출해 카탈로그를 만드는 경로 —
  이 경로는 user_credentials 무관(메타데이터만 추출)이므로 변경 없음.

### 검증 시나리오
1. 사용자 A 가 Serper API key 미등록 → `serper_search` 호출 시 채팅에 `credential_missing:
   serper` 에러 카드 + me-tools 등록 가이드 노출.
2. 사용자 A 가 Serper 키 등록 → 같은 에이전트 검색 정상 동작.
3. 사용자 B 가 미등록 상태로 같은 에이전트 실행 → 본인 자격증명만 inject 되므로 사용자 A
   의 키가 새지 않는다 (격리).
4. Brave 만 등록, agent 가 serper 호출 → credential_missing.

### 커밋 분할 안
1. `builtin_tools_service.py` 시그니처 확장 + lambda 캡처.
2. `agents_service.py` 호출체인에 user_credentials 전달.
3. `credential_missing → emit_error` 변환 + 클라이언트 UI 안내(필요 시).
4. 회귀 테스트.

---

## Phase 9 — 인기 MCP 서버 사전 등록 카탈로그 (원클릭 install + 자격증명 매핑)

### 목적 / 배경
사용자가 Agent Studio 에 MCP 서버를 등록할 때 처음부터 URL/transport/스키마를 일일이
입력하는 부담이 있음. 일반적으로 자주 쓰이는 MCP 서버를 분류·정리한 정적 카탈로그를
제공해 "원클릭 등록" 흐름을 가능하게 한다. 자격증명 매핑(Phase 8 패턴) 까지 통합.

### 결정된 사항
- 카탈로그 출처: `modelcontextprotocol/servers` 공식 reference + 실사용 우선순위 합집합
  (2026-05-19 조사 결과 기준, 작업일지 참조).
- 자격증명 매핑은 `tool-credential-map.ts` 와 동일한 슬롯 구조 사용 — `mcp:{slug}` 또는
  `oauth:{slug}` 로 통일. Gmail 슬롯(`oauth:gmail`) 은 MCP 의 gmail 서버와 공유.
- "카탈로그 노출" 과 "자동 설치" 분리 — 1차는 카탈로그 GET 만, 사용자가 install 클릭 시
  필요 자격증명 슬롯이 me-tools 에 자동 추가.

### 1차 카탈로그 (Tier 1 — 우선 노출)
**공식 reference** (자격증명 불필요)
- `filesystem`, `fetch`, `git`, `memory`, `sequential-thinking`, `time`

**코드 / Git / 모니터링**
- `github` (PAT 또는 OAuth) — 가장 자주 쓰이는 통합
- `gitlab` (PAT)
- `sentry` (auth token)

**검색 · 웹**
- `brave-search` (API key — Phase 8 의 brave 자격증명 슬롯 공유)
- `tavily`, `exa` (API key, LLM 친화 의미 검색)
- `firecrawl` (API key, 사이트 크롤링/마크다운)
- `puppeteer` / `playwright` (자격증명 불필요)

**DB**
- `postgres`, `sqlite`, `mongodb`, `redis` — 연결 문자열 입력

**생산성 / 협업**
- `slack` (Bot Token 또는 OAuth)
- `linear` (API key)
- `notion` (Internal Integration Token)
- `jira` / `confluence` (OAuth / API token)
- `gmail`, `google-calendar`, `google-drive` (OAuth — 기존 Gmail 슬롯 확장)

**디자인 / 콘텐츠**
- `figma` (Personal access token)

**클라우드 / 배포**
- `cloudflare` (API token), `vercel` (token), `aws` (access key)

**결제 / SaaS**
- `stripe` (API key)
- `supabase` (project URL + service role key)

**Agent 특화**
- `e2b` (API key — 격리 코드 실행 샌드박스) ← 코드 실행 에이전트의 핵심

### 구현 범위 (1차)
- 신규 파일: `apps/api/src/modules/mcp/mcp-catalog.ts`
  - `MCP_CATALOG: MCPServerEntry[]` (slug, name, description, repoUrl, transport 기본값,
    requiredCredentials: ToolCredentialEntry[])
- `apps/api/src/modules/mcp/mcp.controller.ts`
  - `GET /api/projects/:projectId/mcp/catalog` — 카탈로그 노출
  - `POST /api/projects/:projectId/mcp/install` — 카탈로그 항목 한 줄 등록 (slug 기준)
- `apps/agent-web/src/app/(dashboard)/mcp/page.tsx` (또는 Tools 페이지 하위)
  - "추천 MCP 추가" 버튼 → 카탈로그 모달 → 필요 자격증명 입력 UI (me-tools 통합)

### 엣지 케이스
- 동일 슬러그의 MCP 서버가 이미 등록된 경우 — 중복 등록 금지, 기존 행 갱신 옵션 제공.
- Reference 서버처럼 자격증명이 필요 없는 항목 — credential UI 스킵.
- OAuth 류 (slack, gmail, jira) — 별도 OAuth 콜백 라우트 필요 (현 Gmail 패턴 재사용).

### 검증 시나리오
1. 카탈로그 GET → Tier 1 항목 전부 노출.
2. `github` 원클릭 등록 → me-tools 에 `mcp:github` 슬롯 생성, PAT 입력 후 `status='connected'`
   로 전환.
3. 등록된 MCP 가 `agent.mcpServerIds` 에 추가되면 runner 가 정상 도구 호출.

### 커밋 분할 안
1. `mcp-catalog.ts` 정적 카탈로그 + GET 엔드포인트.
2. 원클릭 install 엔드포인트 + UI 모달.
3. OAuth 필요 항목별 콜백 라우트 (slack / jira / notion).
4. 도구 단위 자격증명 자동 주입 — Phase 8 의 search 도구 패턴을 MCP 도구에도 확장.

---

## Phase 10 — MCP UX 보강 (죽은 mcp_server_id 정리 + Slack 전송 옵션 카탈로그화)

### 목적 / 배경
2026-05-20 Slack 통합/PDF 점검 세션에서 두 가지 UX 공백이 반복 확인됨. 매번 DB 를 직접
수정해야 했고, 다른 환경 이전 시 재발한다. 코드/UX 에 녹여 재발 방지.

> 직전 세션에서 **데이터/설정으로만** 처리한 것(코드 아님, 환경마다 재현 필요):
> - 에이전트 `4c936ac2`(Context7 도우미) `mcpServerIds`: 죽은 `de362a52` → Context7 `998787df`+Tavily `3f6dc49d`.
> - 에이전트 `061fbc22`(회의록→Slack) `mcpServerIds`: 죽은 `5df47df5` → 새 Slack `297a4b8a`.
> - Slack 앱 스코프 `mpim:read`/`channels:join` + reinstall + 봇 `#회의` 초대.
> - Slack MCP `297a4b8a` `config.env.SLACK_MCP_ADD_MESSAGE_TOOL=true` (전송 도구 활성화).

### 10-1. 죽은 `mcp_server_id` 를 편집 화면에서 제거 가능하게

#### 문제
MCP 서버를 삭제→재생성하면 에이전트 `mcpServerIds`/`toolPermissions` 에 **존재하지 않는
서버 id** 가 남는다. Tool Access Permissions 패널은 이를 `mcp:de362a52…` 로 렌더하지만
대응 서버가 없어 **토글 해제 대상이 없어 UI 로 못 지운다.** (이번 세션 de362a52, 5df47df5 2회 발생.)

#### 결정 필요 사항 (착수 전 사용자 확인)
- UX 택1: **(a) 저장 시 orphan 자동 정리** (개입 없음, 단순) vs **(b) "삭제됨—제거" 배지+버튼** 명시 제거.
- 서브에이전트(`OrchestrationPanel`/flow 노드)에도 동일 정리 적용할지.

#### 구현 범위 (파일·라인)
- `apps/agent-web/src/components/agents/builder/ToolsTab.tsx`
  - `:215` `map[`mcp:${g.serverId}`]` — 사용 가능 MCP 서버 라벨 맵(=available 목록 출처).
  - `:585` `...Array.from(selectedMcpServerIds).map(id => `mcp:${id}`)` — 권한 패널 키 목록.
  - `:588-589` `permissions`/`onChange` (toolPermissions 직렬화).
  - available 서버 목록과 `mcpServerIds` 비교 → orphan 식별 → (a)저장 시 `mcpServerIds`+`toolPermissions` 에서 제거 또는 (b)제거 UI 노출.
- `apps/agent-web/src/components/agents/builder/OrchestrationPanel.tsx:468` — `mcp:{id.slice(0,8)}` 렌더(서브에이전트 동일 이슈).

#### 엣지 케이스
- orphan 이 `toolPermissions` 키에만 남고 `mcpServerIds` 엔 없는 경우(또는 그 반대) 양쪽 모두 정리.
- 정상 서버 선택/해제에는 영향 없을 것(회귀 금지).

#### 검증 시나리오
1. 에이전트가 없는 mcp_server_id 참조 → 편집 화면에서 제거/자동정리 가능.
2. 저장 후 DB `mcp_server_ids`/`tool_permissions` 에 orphan 잔존 없음.

### 10-2. mcp-catalog Slack 항목에 `SLACK_MCP_ADD_MESSAGE_TOOL` env 필드 추가

#### 문제
slack-mcp-server 는 전송 도구(`conversations_add_message`)를 **기본 비활성**하며
`SLACK_MCP_ADD_MESSAGE_TOOL` env 로만 켠다. 카탈로그 Slack `envSchema` 에 토큰만 있어 UI
등록 시 전송이 항상 꺼진 채 생성된다(이번에 DB 직접 수정함).

#### 구현 범위 (파일)
- `apps/agent-web/src/lib/mcp-catalog.ts` — `id:'slack'` 의 `envSchema` 에 항목 추가:
  ```ts
  { key: 'SLACK_MCP_ADD_MESSAGE_TOOL', label: '메시지 전송 허용', required: false,
    secret: false, placeholder: 'true (전 채널) 또는 C0123,C0456 (특정 채널만)' }
  ```
  (빈값=읽기 전용, `true`=전 채널, 콤마구분 채널ID=허용목록, `!ID`=차단목록. `note` 로 안내 보강.)
- `apps/agent-web/src/components/mcp/McpCatalogPanel.tsx` — **non-secret/optional env 필드**도
  입력받아 `config.env` 에 포함하는지 확인. secret 위주 처리면 일반 env 분기 추가.

#### 결정 필요 사항
- `McpEnvField` 에 secret=false 필드 렌더/저장 경로가 이미 있는지(없으면 추가).
- 기본값은 비활성(빈값) 권장(보안). 안내만 강하게.

#### 검증 시나리오
1. UI 로 Slack MCP 등록 시 "메시지 전송 허용" 입력 가능 → `config.env.SLACK_MCP_ADD_MESSAGE_TOOL` 저장.
2. runner 가 해당 env 로 slack-mcp-server 기동 → `conversations_add_message` 도구 로드.
3. 빈값이면 기존처럼 전송 비활성.

### 작업 순서 / 커밋 분할
1. **10-2 먼저** (작고 독립적, 회귀 위험 낮음) → `feat(web): mcp-catalog Slack 전송 옵션 env 필드`.
2. **10-1** (UX 결정 후) → `feat(web): 에이전트 편집에서 끊긴 mcp_server_id 정리`.
3. 각 변경 전 `작업일지.md` 기록(§1-1-5), `cd apps/agent-web && pnpm lint` 통과 확인.

---

## 향후 추가 후보

- 시드 데이터 정리: 글로벌 `Provider.apiKeyEncrypted` 컬럼의 잔여 데이터 마이그레이션
  (현재 deprecated 상태로 무시되고 있음).
- `useUserStore` 의 client-side `initProject` fallback 제거 (registerDirect 가 Project
  생성하므로 거의 사용 안 됨, 잔존 데이터 없으면 제거 가능).
- `mockApi` alias (api-client.ts:796) 정리 — 이름과 실체가 불일치, `apiClient` 만 export.

이 후보들은 정식 Phase 가 아니라 향후 cleanup 으로 분리.
