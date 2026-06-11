# DeepAgent 리팩터링 작업 계획 (Work Plan)

> 기준 문서: [refactoring-deep-agent.md](./refactoring-deep-agent.md)
> 화면 구현 갭: [refactoring-deep-agent-ui-gaps.md](./refactoring-deep-agent-ui-gaps.md)
> 대상 브랜치: `refactoring-deep-agent`
> 최종 업데이트: 2026-05-14
> 진행 상태: **Phase 0 ~ 10 완료**. Phase 7 잔여 항목 4건, Phase 8 통합 회귀 4건, Phase 11(idle 자동 로그아웃)·후속 6건이 남음.

---

## 0. 남은 작업 (Top of Mind) — 2026-05-14 기준

> 이전 사이클까지 누적된 큰 줄기(Phase 1~10 + 대시보드 파이프라인 + Skills + Gmail OAuth + Client 로그인 분리 Phase 1~5 등)는 모두 코드/DB 에 반영됐다. 화면·런타임 차원에서 **즉시 손댈 수 있는 잔여 작업**만 모은다.

### 0-1. Phase 7 UI ↔ Runner 잔여 (4건)

| # | 항목 | 우선 | 비고 |
|---|------|------|------|
| 7.3 | Main Agent 컨테이너 시각화 — dashed frame + "MAIN · {name}" 라벨 + running blue dot pulse | P1 | `FlowCanvas.tsx`/`MainAgentNode.tsx` 에 dashed 컨테이너 미구현. 디자인 시안만 존재. |
| 7.9 | Tool Permissions `restricted.conditions` 인자 제한 래퍼 | P2 | `tool_wrapping.py:48` 의 `restricted` 가 메시지 반환만 — 인자 검증 래퍼 추가 필요. |
| 7.12 | Jinja 변수 확장 — `{{previous_output}}`, `{{kb_results}}` | P3 | `prompt_resolver.py` 에 `{{current_time}}/{{current_timezone}}/{{plan.mode}}/{{guardrails.max_output_length}}` 만 치환. 나머지 미구현. |
| 7.13 | `maxOutputLength` vs LLM `max_tokens` 역할 분리 | P3 | 두 경로가 여전히 중복. 사후 절단 코드 분리 + 문서 명확화. |

### 0-2. Phase 8 SubAgent 미들웨어 — 회귀 검증 잔여

스파이크·구현·단위테스트(8.1~8.12)는 완료, **통합 회귀(8.13~8.18) 만 미실시**. Gmail/Skills 후속 작업으로 사실상 사용 검증된 상태이지만 회귀 체크리스트는 닫지 않음.

| # | 시나리오 | 상태 |
|---|---------|------|
| 8.13 | 1단계 sub-agent 위임 — WS 이벤트 포맷 100% 일치 | 대기 |
| 8.14 | 2단계 중첩 sub-agent depth=2 + parent_id 체인 | 대기 |
| 8.15 | commit `445c41f` Gmail 시나리오 재현 | 대기 (Gmail 채팅 운영 중) |
| 8.16 | per-subagent `interrupt_on` HITL 카드 | 대기 |
| 8.17 | (선택) 2개 sub-agent 병렬 `task` 인터리빙 | 대기 |
| 8.18 | 전체 회귀(`pytest` + `pnpm lint` + Phase 6 시나리오) | 대기 |

### 0-3. Phase 11 — Client 로그인 분리 후속

| # | 작업 | 비고 |
|---|------|------|
| 11.1 | Idle 1시간 자동 로그아웃 | Phase 6 작업으로 예정됐던 항목. 진행 안 됨. |
| 11.2 | `useClientUserStore` 분리 (현재 admin/client 공통) | path 전환 시 비동기 교체 race 가능성, 분리로 명확화 |
| 11.3 | `mockApi` alias(`api-client.ts:796`) 이름 정리 | 의미는 이미 실 API — 이름만 남음 |

### 0-4. 후속 (Phase 9/10 영역 외, 별도 사이클로 분리됨)

- **Sub-agent provider key override** — `build_subagents` 에 spec 별 user_credentials 매핑.
- **resume 흐름 user_credentials 전파** — `hitl_router → hitl_service → threads_service.resume_message`.
- **외부 client(`/v1/chat/*`) 자격증명** — deployment 시점 admin 자격증명 또는 system-wide provider 사용.
- **`Tool.requiresCredential` 메타** — tool/mcp 자격증명 자동 도출 확장.
- **응답 envelope `{data, error}` 글로벌 인터셉터** — NestJS 일관 응답 모양.
- **비동기 메시지 모델** — `/v1/chat/messages` 즉시 `{runId, startedAt}` + runner 백그라운드 invoke.
- **`GET /v1/chat/threads/:id/messages` cursor 페이지네이션**.
- **DailyMetric `environment`/`agentId` 컬럼** — ad-hoc 쿼리 → cron 사전 집계.
- **VFS 재활성화** (Phase 5 Backlog) — PlaygroundTab STATE 탭에 `state["files"]` 시각화 + "가상 파일" 명시 UX.

### 0-5. 디렉토리 정리

- `packages/database/prisma/add-gpt5-models.ts` / `add-missing-models.ts` / `add-models.ts` 일회성 헬퍼 스크립트 — 커밋 or 삭제 결정.
- `__pycache__` 변경분 `.gitignore` 점검.

---

## 1. 서브 에이전트 구성

| 에이전트 | 책임 | 주요 파일 |
|---------|------|---------|
| **backend-senior-developer** | FastAPI/LangGraph/NestJS 코드 구현 | `apps/agent-runner-py/`, `apps/api/` |
| **frontend-senior-developer** | Next.js UI·타입·WebSocket 클라이언트 | `apps/agent-web/` |
| **database-senior-developer** | Prisma 스키마·마이그레이션·시드 | `packages/database/` |
| **dev-ops** | pnpm/uv/Docker/pyproject 의존성·인프라 | `pyproject.toml`, `package.json`, `docker-compose*.yml`, lock 파일 |
| **qa** | 단위/통합/회귀 테스트·이벤트 포맷 검증 | `tests/`, `pytest`, `pnpm lint` |

에이전트 정의 파일: `.claude/agents/*.md`

---

## 2. 확정된 결정 사항 (D1~D5 + Q1~Q3)

모든 결정은 권장안으로 확정되었다. (2026-04-15 사용자 승인)

### D1. VFS — 공식 VFS 사용 ✅

- **결정**: 공식 `deepagents` 내장 VFS(`ls/read_file/write_file/edit_file`) 사용.
- **처리**: 기존 `builtin_tools/vfs_service.py` deprecate → 공식 VFS로 대체.
- **데이터**: `state["files"]` dict에 저장, LangGraph checkpointer(PostgreSQL)로 스레드별 유지.
- **주의**: 기존 `vfs_service.py`에 저장된 데이터가 있으면 마이그레이션 전략 별도 수립 필요.

### D2. 분기 제거 — 전면 일원화 ✅

- **결정**: `_should_use_deepagent()` 분기 완전 제거. 모든 에이전트가 `create_deep_agent()` 경로 사용.
- **처리**: planning/subagents 미사용 단순 에이전트는 `subagents=[]` + instructions만 넘겨 공식 패키지로 처리.
- **효과**: 코드 경로 단일화, 이벤트 어댑터 1개만 유지.
- **일반 LangGraph 경로(`langgraph_service`)**: 워크플로우(v1) runs 전용으로만 유지.

### D3. toolPermissions DB 필드 추가 ✅

- **결정**: `Agent` 모델에 `toolPermissions Json? @map("tool_permissions")` 필드 추가.
- **마이그레이션**: `20260415_add_agent_tool_permissions`
- **효과**: 도구 권한 정책(auto/requires_approval/restricted/disabled)이 DB에서 읽혀 실제 동작.
- **기존 UI**: `ToolPermissionsPanel.tsx` 이미 존재 — 연결만 하면 됨.

### D4. SDK 삭제 시점 — Phase 5에서 일괄 삭제 ✅

- **결정**: Phase 1~4 완료 + QA 통과(Phase 6) 후 Phase 5에서 일괄 삭제.
- **이유**: 검증 후 삭제로 롤백 위험 최소화. git 이력에 복원 가능.
- **삭제 대상**: `packages/deepagent-sdk/` 전체 22파일.

### Q1. VFS 도구 충돌 — 공식 VFS 자동 대체 + 필터링 ✅

- **결정**: 공식 `deepagents` 내장 VFS(`ls/read_file/write_file/edit_file`)로 완전 대체.
- **구현**:
  - `tools` 리스트를 `create_deep_agent`에 넘기기 전 `ls / read_file / write_file / grep` 이름 도구를 **자동 필터링**으로 제거.
  - 프론트 `ToolsTab` builtin 선택지에서 VFS 항목 제거 (공식이 자동 포함하므로 선택 불필요).
  - DB `builtinToolIds`에 VFS 항목이 저장된 기존 에이전트는 필터링으로 무해하게 무시.
- **이유**: 공식 VFS는 `state["files"]`에 저장되어 checkpointer로 자동 영속화. 자체 `vfs_service.py`는 인메모리 방식으로 스레드 재개 시 파일이 유실되는 구조적 문제가 있었음.

### Q2. `invoke / resume / get_messages` 경로 — resume만 전환 ✅

- **결정**: `resume`만 `create_deep_agent` 그래프로 전환. `invoke`와 `get_messages`는 LangGraph 경로 유지.
- **이유**:
  - `resume`: `stream`이 `create_deep_agent` 그래프에서 interrupt를 걸었으므로, **동일 그래프 인스턴스**에서 resume해야 올바른 thread state를 찾을 수 있음. 다른 그래프 인스턴스로 resume하면 HITL 전체가 깨짐.
  - `invoke`: 배치/API 호출용. stream과 그래프를 통일할 필요 없음. 범위 최소화.
  - `get_messages`: LangGraph checkpointer에서 직접 읽으므로 그래프 종류 무관. `messages` 키는 공식 패키지 state에도 동일하게 존재.
- **처리**: `get_messages` 응답에서 `todos / files` 필드가 포함되면 필터링하여 기존 포맷 유지.

### Q3. 서브에이전트 중간 WebSocket 이벤트 중계 — 유지, 내부만 교체 ✅

- **결정**: `_delegate` 클로저 구조(중계 로직 130줄)를 **유지**. 내부 실행 엔진만 교체.
- **구현**:
  - 공식 `subagents=[...]` 선언 **미사용**.
  - `_delegate` 내부의 `lg.stream(...)` 호출을 `stream_with_deepagent(sub_loaded, child_thread_id, message, sub_tools)`로 교체.
  - `emit_agent_streaming / emit_step_progress / emit_reasoning_streaming` 중계 로직은 그대로 유지.
- **이유**: 공식 `subagents` API는 실시간 이벤트 중계 훅이 없어 현재 UX 구현 불가. 현재 `_delegate` 구조가 잘 동작하므로 실행 엔진만 교체해 리스크 최소화.

### D5. no-op 필드 UI — "비활성" 표시 + 툴팁 ✅

- **결정**: 공식 패키지 미지원 필드는 UI에서 회색 처리 + "현재 버전에서 지원되지 않습니다" 툴팁.
- **대상 필드**:

| 필드 | 위치 | 처리 |
|------|------|------|
| `cotVisible` | ReasoningTab | 비활성 표시 (파싱은 계속 동작) |
| `parallelToolExecution` | ReasoningTab | 비활성 표시 |
| `planningDepth` | PlanningTab | 비활성 표시 |
| `thinkingDepth` | ReasoningTab | 비활성 표시 |
| `reactMaxIterations` | ReasoningTab | `stepLimit`(→`recursion_limit`)으로 대체, 필드 제거 |

---

## 3. 기능 변경 요약 (리팩터링 핵심 내용)

> 상세 내용: [refactoring-deep-agent.md](./refactoring-deep-agent.md)

| 영역 | 현재 (자체 SDK) | 변경 후 (`deepagents`) |
|------|----------------|----------------------|
| 진입점 | `DeepAgent(config, tools).stream()` | `create_deep_agent().compile().astream()` |
| 계획 수립 | `planner.decompose_task()` → `plan.created` | `write_todos` 내장 도구 → todos diff |
| 서브 에이전트 | `_delegate` + 수동 위임 | `subagents=[...]` + `task` 도구 자동 위임 |
| VFS | `vfs_service.py` 별도 | `ls/read_file/write_file/edit_file` 내장 |
| 시스템 프롬프트 | `resolve_system_prompt()` 직접 주입 | 공식 상세 프롬프트 + `instructions` append |
| 메모리 (단기) | Redis STM | LangGraph checkpointer (PG) |
| 메모리 (장기) | PG LTM + 요약 | 자체 MemoryManager 외부 래퍼로 유지 |
| 가드레일 (입력) | `InputGuardrail` (그래프 내) | `agents_service.stream` 진입 시 사전 필터 |
| 가드레일 (출력) | `OutputGuardrail` + PII (그래프 내) | 이벤트 어댑터 출력단 후처리 |
| 도구 권한 | `apply_policy` 4단계 | `requires_approval`→interrupt, `restricted`→래퍼, `disabled`→제외 |
| 추론 제한 | `StepLimitGuard` | `recursion_limit` 매핑 |
| HITL resume | `Command(resume=...)` | 동일 (LangGraph 공통) |
| 이벤트 스트림 | 자체 이벤트 | LangGraph stream → 어댑터 변환 |
| 분기 조건 | `_should_use_deepagent()` | **제거** → 전면 일원화 |

---

## 4. 전체 작업 Phase

### Phase 0 — 착수 준비 (dev-ops + qa)

| # | 작업 | 담당 | 상태 |
|---|------|------|------|
| 0.1 | `deepagents` PyPI 최신 안정 버전 확인 + langgraph 호환성 점검 | dev-ops | 완료 |
| 0.2 | `docker compose up -d` + `pnpm dev` 전 서비스 부팅 베이스라인 | dev-ops | 완료 |
| 0.3 | `pytest` + `pnpm lint` 베이스라인 테스트 현황 | qa | 완료 |

### Phase 1 — 자체 SDK 분리·이관 (backend + qa)

공식 패키지 도입 **이전**, 독립 실행 가능, 롤백 안전.

| # | 작업 | 담당 | 상태 |
|---|------|------|------|
| 1.1 | `apps/agent-runner-py/src/modules/deep/` 디렉토리 생성 | backend | 완료 (`c57df2d`) |
| 1.2 | `deep/guardrails.py` — 입출력 가드레일 + PII (deepagent-sdk 이관) | backend | 완료 |
| 1.3 | `deep/memory.py` — STM/LTM 래퍼 (deepagent-sdk 이관) | backend | 완료 |
| 1.4 | `deep/tool_wrapping.py` — `apply_policy` 4단계 재구현 | backend | 완료 |
| 1.5 | `deepagent_bridge.py` import 경로를 `deep.*`로 교체 | backend | 완료 |
| 1.6 | 단위 테스트 — `tests/modules/deep/` | qa | 완료 (`test_guardrails.py`, `test_memory.py`, `test_tool_wrapping.py`) |
| 1.7 | 회귀 — 기존 DeepAgent 경로 정상 동작 확인 | qa | 완료 |

### Phase 2 — 공식 deepagents 통합 (backend + dev-ops)

| # | 작업 | 담당 | 상태 |
|---|------|------|------|
| 2.1 | `pyproject.toml` — `deepagents` 추가, `deepagent-sdk` path source 제거, `uv.lock` 갱신 | dev-ops | 완료 (`c57df2d`) |
| 2.2 | `deepagent_bridge.py` rewrite — `create_deep_agent(tools, instructions, model)` 호출 | backend | 완료 |
| 2.3 | 이벤트 어댑터 — LangGraph stream → `token/plan.created/step.update/run.completed/error` | backend | 완료 (`18ad828` astream_events 기반으로 재작성) |
| 2.4 | `instructions` 전단 — `prompt_resolver.resolve_system_prompt()` + `MemoryManager.get_context()` 주입 | backend | 완료 |
| 2.5 | 가드레일/PII 후처리 — 이벤트 어댑터 출력단 | backend | 완료 |
| 2.6 | 도구 권한 적용 — `requires_approval`→`interrupt_before`, `restricted`→래퍼, `disabled`→리스트 제외 | backend | 완료 (단, `restricted.conditions` 인자 제한은 Phase 7) |
| 2.7 | `recursion_limit` 매핑 — `reasoningConfig.stepLimit` → `config={"recursion_limit":...}` | backend | 완료 |
| 2.8 | Checkpointer 공유 — `checkpoint_service.get_saver()` 를 `compile(checkpointer=saver)` 에 재사용 | backend | 완료 |
| 2.9 | VFS 필터링 — `tools` 넘기기 전 `ls/read_file/write_file/grep` 이름 도구 자동 제거 (Q1) | backend | 완료 (`b584834` VFS 비활성화) |
| 2.10 | `resume` 함수를 `create_deep_agent` 그래프 경로로 전환 (Q2) | backend | 완료 |
| 2.11 | `get_messages` 응답에서 `todos/files` 필드 필터링 보정 (Q2) | backend | 완료 |
| 2.12 | `_delegate` 내부 `lg.stream()` → `stream_with_deepagent()` 교체 (Q3) | backend | 완료 (`445c41f` sub-agent Gmail 도구 연동) |
| 2.13 | 단위 테스트 — `test_deepagent_bridge.py` (이벤트 어댑터 mock) | qa | 완료 |

### Phase 3 — 분기 제거·일원화 (backend + frontend)

| # | 작업 | 담당 | 상태 |
|---|------|------|------|
| 3.1 | `_should_use_deepagent` 분기 제거 — 모든 에이전트 `create_deep_agent` 경로 | backend | 완료 |
| 3.2 | `load_agent_with_deps` SQL + 반환 dict에 `toolPermissions`, `hitlPolicy`, `slug` 필드 추가 (기존 누락 수정) | backend | 완료 |
| 3.3 | 단순 에이전트(`subagents=[]`, 가드레일 없음) 동작 검증 | qa | 완료 |
| 3.4 | `ToolsTab` builtin 선택지에서 VFS 항목 제거 (`ls/read_file/write_file/grep`) (Q1) | frontend | 완료 |
| 3.5 | no-op 필드 UI 비활성 처리 + 툴팁 (`cotVisible`, `parallelToolExecution`, `planningDepth`, `thinkingDepth`) (D5) | frontend | 부분완료 — `cotVisible` 아직 활성 (Phase 7-8) |
| 3.6 | `reactMaxIterations` 필드 제거 → `stepLimit`(→`recursion_limit`) 단일화 | frontend | 완료 |
| 3.7 | TS 타입 재매핑 — `packages/shared/src/types/agent.ts`, `apps/agent-web/src/types` | frontend | 완료 |

### Phase 4 — DB 스키마 확장 (database + backend + frontend)

| # | 작업 | 담당 | 상태 |
|---|------|------|------|
| 4.1 | `Agent.toolPermissions Json?` 마이그레이션 작성 (`20260415_add_agent_tool_permissions`) | database | 완료 |
| 4.2 | `packages/shared` 타입 동기화 — `AgentToolPermissions` 타입 신설 | database + frontend | 완료 |
| 4.3 | `deepagent_bridge` — DB `toolPermissions` → `tool_policies` 매핑 연결 | backend | 완료 |
| 4.4 | `ToolPermissionsPanel.tsx` — DB 저장 연결 (기존 UI 활용) | frontend | 완료 |

### Phase 5 — 자체 SDK 제거 (dev-ops + backend)

| # | 작업 | 담당 | 상태 |
|---|------|------|------|
| 5.1 | `pnpm-workspace.yaml`에서 `deepagent-sdk` workspace 항목 제거 (삭제 전 선행 필수) | dev-ops | 완료 |
| 5.2 | `packages/deepagent-sdk/` 전체 삭제 (22 파일) | dev-ops | 완료 (`c57df2d`) |
| 5.3 | 잔존 import 검색·제거 (`grep -r "from deepagent"`) | backend | 완료 |
| 5.4 | `AGENTS.md` DeepAgent SDK 관련 섹션 업데이트 | backend | 완료 (`4a1271a` 공식 문서 참조 규칙 추가) |

### Phase 6 — 통합 검증 (qa 주도)

| # | 시나리오 | 담당 | 상태 |
|---|---------|------|------|
| 6.1 | 채팅 스트리밍 — 메시지 왕복, WebSocket 이벤트 포맷 검증 | qa | 완료 (`318c28b` 중복·스크롤 버그 수정, `c6b1fd7` 도구 카드 접기) |
| 6.2 | HITL — `requires_approval` 도구 → interrupt → resume | qa | 완료 |
| 6.3 | 서브에이전트 위임 — `task` 도구 호출 + 자식 실행 로그 | qa | 완료 (`445c41f`) |
| 6.4 | 장기 메모리 — 동일 thread 재개 시 컨텍스트 주입 | qa | 완료 |
| 6.5 | 가드레일 — 차단 토픽 차단, PII redact | qa | 완료 |
| 6.6 | 도구 권한 — `disabled`/`restricted` 동작, `requires_approval` interrupt | qa | 부분완료 — `restricted.conditions` 인자 제한은 Phase 7 |
| 6.7 | 회귀 — 기존 workflow runs 정상 재생, langgraph_service 경로 | qa | 완료 |
| 6.8 | 전체 lint/pytest 통과 | qa + dev-ops | 완료 |

### Phase 7 — UI ↔ Runner 갭 해소 (전 에이전트 협업)

> 상세: [refactoring-deep-agent-ui-gaps.md](./refactoring-deep-agent-ui-gaps.md)
>
> Phase 6 검증 이후 식별된 "UI는 있지만 Runner 가 미사용/부분사용" 항목 정리. 우선순위 P1~P3.

| # | 작업 | 담당 | 우선 | 상태 |
|---|------|------|------|------|
| 7.1 | `agent.token` / `step.completed` payload 에 `inputTokens`/`outputTokens` 포함 (usage_metadata) | backend | P1 | 완료 (2026-04-28, `_pump_astream_events` 가 `AIMessageChunk.usage_metadata` 누적 → `run.completed.data.usage`) |
| 7.2 | 모델별 단가 테이블 + `cost` 계산 (DebugPanel 메트릭 실제 값) | backend + db | P1 | 완료 (2026-04-28, `runs/pricing.py` + `WorkflowRun.modelId` 컬럼) |
| 7.3 | Main Agent 컨테이너 UI — dashed frame + "MAIN · {name}" 라벨 + running blue dot pulse | frontend | P1 | **대기** — `FlowCanvas.tsx`/`MainAgentNode.tsx` 미반영 |
| 7.4 | Handoff 필드 7종 활성화 or D5-스타일 비활성 표시 결정 (`handoffCondition/handoffTarget/confidenceThreshold/handoffExpr/retry/backoff/fallback`) | frontend + backend | P1 | 완료 (2026-05-11, `AgentFlowSettingsPanel.tsx:39` Handoff 탭 disabled + "준비 중" 배지 — 방안 B 채택) |
| 7.5 | Architecture `tool_calling`(Fast) / `plan_execute`(Planning) Runner 분기 완성 | backend | P1 | 완료 (Client UI 에서 `react`/`plan_execute` 모드 토글, plan_execute 전용 system prompt 및 sweep/TODO 룰. tool_calling 은 BasicTab ARCHITECTURE 섹션 제거로 선택 차단) |
| 7.6 | Architecture `custom_graph`(Expert) 옵션 UI 처리 (disabled 유지 or 제거) | frontend | P2 | 완료 (2026-05-12, `MainAgentModal.tsx`/`BasicTab.tsx` 에서 ARCHITECTURE 섹션 전체 제거) |
| 7.7 | Output Schema Runner 검증 연결 — `guardrails.py` 에 JSON schema validate 단계 추가 | backend | P2 | 완료 (2026-04-27, deferred 모드로 출력 필터·PII·`validate_schema` 와이어링, `jsonschema==4.26.0` 의존성 추가) |
| 7.8 | `cotVisible` D5 비활성 표시 (회색 + "현재 버전 미지원" 툴팁) | frontend | P3 | 완료 (`ReasoningTab.tsx:40` `DisabledField` 적용 — cotVisible/thinkingDepth) |
| 7.9 | Tool Permissions `restricted.conditions` 인자 제한 래퍼 구현 | backend | P2 | **대기** — `tool_wrapping.py:48` 의 `restricted` 가 메시지만 반환, 인자 검증 미구현 |
| 7.10 | Orchestration Mode (`sequential/parallel/conditional`) Runner 반영 or 비활성 표시 | backend + frontend | P2 | 완료 (`PlanningTab.tsx:341` `DisabledField` + "준비 중" 배지로 비활성 표시 채택) |
| 7.11 | Replanning Trigger (`never/on_failure/always`) Runner 반영 or 비활성 표시 | backend + frontend | P3 | 완료 (PlanningTab 동일 패턴, DisabledField) |
| 7.12 | Jinja 프롬프트 변수 확장 — `{{previous_output}}`, `{{current_time}}`, `{{kb_results}}` | backend | P3 | **부분완료** — `{{current_time}}/{{current_timezone}}/{{plan.mode}}/{{guardrails.max_output_length}}` 만 치환 (`prompt_resolver.py:74-101`). `{{previous_output}}`, `{{kb_results}}` 미구현 |
| 7.13 | `maxOutputLength` vs LLM `max_tokens` 역할 분리 (사후 절단 vs LLM 파라미터) | backend | P3 | **대기** — 분리 작업 미실시 |

### Phase 8 — 공식 SubAgent 미들웨어로 전환 (backend + qa)

> Q3 결정("`_delegate` 클로저 유지, 내부 엔진만 교체")을 **재검토**한다. deepagents 문서(Context7 `/websites/langchain_oss_python_deepagents/subagents`)에 따르면 공식 `subagents=[...]` 파라미터는 `task` 내장 도구 + 그래프 라이프사이클 자동 관리 + per-subagent `interrupt_on` + async 병렬 실행을 지원한다. `astream_events` v2 스트림은 중첩 이벤트에 `parent_ids`를 포함하므로 WebSocket 중계 호환 가능성이 높다 — 다만 **실제 이벤트 페이로드 형태는 스파이크로 선확인**해야 한다.
>
> 목표: 자체 `_load_teammate_tools` + `_delegate` 클로저(~130줄) 제거 + DB→`subagents` dict 변환 함수(~30줄) 추가. 순증: **-100줄**, 이점: async 병렬 실행 + per-subagent HITL.
>
> **전제 조건**: Phase 6 회귀 통과. Sub-agent 연동 기준 커밋 `445c41f`(Gmail) 테스트 시나리오 보유. 본 Phase는 별도 feature branch(`feature/subagent-middleware`)에서 진행하고, 실패 시 Q3 기존 구조로 롤백.

#### 8-1. 스파이크 — 공식 `subagents` 이벤트 중계 가능성 검증

| # | 작업 | 담당 | 우선 | 상태 |
|---|------|------|------|------|
| 8.0.1 | 최소 재현: `create_deep_agent(subagents=[{weather 1개}])` + `graph.astream_events(version="v2")` 실행, 중첩 이벤트 파일에 덤프 | backend | P0 | 완료 (`spikes/subagent_astream_events_spike.py`) |
| 8.0.2 | 덤프 분석 — `on_tool_start`(name=`task`) payload 에서 실제 sub-agent 이름 추출 가능 키 확인 | backend | P0 | 완료 (`input.subagent_type`) |
| 8.0.3 | Sub-agent 내부 `on_tool_start` 가 부모 스트림에 포함되는지, 포함된다면 식별 방법 확인 | backend | P0 | 완료 (`on_chain_start` name=`<subagent>` 로 경계 + `parent_ids` 체인) |
| 8.0.4 | Q3 결정 갱신(공식 전환 go/no-go) — 결과를 `refactoring-deep-agent.md` Q4 로 기록 | backend | P0 | 완료 — **GO** |

> **스파이크 결과 (2026-04-23)**:
> - `on_tool_start` name=`task` 의 `data.input.subagent_type` 에 sub-agent 이름 포함 (`weather-bot`).
> - Sub-agent 진입은 `on_chain_start` name=`<subagent_name>` 로 명확히 경계화.
> - 5단계 중첩까지 `parent_ids` 체인 유지(`root → tools → task → weather-bot → sub-tools → get_weather`).
> - Sub-agent 내부 `on_tool_start`(`get_weather`) 가 부모 astream_events 스트림에 그대로 포함됨.
> - FakeChatModel 한계로 `on_chat_model_stream` 은 관찰 못했으나 구조상 동일 parent_ids 체인 유지 예상 — 실제 LLM 연동에서 통합 테스트 8.13 로 재검증.

#### 8-2. 구현

| # | 작업 | 담당 | 우선 | 상태 |
|---|------|------|------|------|
| 8.1 | `deepagent_bridge.build_subagents(specs)` 신설 — spec → `{name, description, system_prompt, tools, model, interrupt_on}` dict 리스트 변환 | backend | P1 | 완료 (`a9c659d`) |
| 8.2 | `stream_with_deepagent()` — `create_deep_agent(..., subagents=build_subagents(...))` 전달 | backend | P1 | 완료 (`a9c659d`) |
| 8.3 | `resume_with_deepagent()` 동일 적용 | backend | P1 | 완료 (`a9c659d`) |
| 8.4 | 이벤트 어댑터 — `on_tool_start/end/error` 에서 `name == "task"` 케이스 분기: `input.subagent_type` → `stepType="agent"`, `nodeId=f"agent:{name}"` | backend | P1 | 완료 (`a9c659d`) |
| 8.5 | `ui_depth` 를 parent_ids 중 emitted_ids 개수로 계산 — 중첩 sub-agent 대응 | backend | P1 | 완료 (`a9c659d`) |
| 8.6 | sub-agent 레벨 `interrupt_on` — `hitlPolicy.tools` → `{toolName: True}` 변환 | backend | P2 | 완료 (`a9c659d`) |
| 8.7 | `_load_teammate_tools` / `_load_inline_teammate_tools` / `_delegate` 클로저 제거 | backend | P1 | 완료 (`a9c659d`) |
| 8.8 | `load_agent_with_deps` 에서 teammate_tools → all_tools 병합 제거, `subAgentSpecs` 반환 | backend | P1 | 완료 (`a9c659d`) |
| 8.9 | 레거시 DB 경로 `visited` 체크 유지 (`_build_db_subagent_specs`) | backend | P2 | 완료 (`a9c659d`) |
| 8.10 | (선택) async 병렬 실행 — system_prompt 가이드 추가 검토 | backend | P3 | 대기 |

#### 8-3. 테스트

| # | 작업 | 담당 | 우선 | 상태 |
|---|------|------|------|------|
| 8.11 | 단위 — `tests/modules/agents/test_subagent_middleware.py::TestBuildSubagents` (5 케이스) | qa | P1 | 완료 (`a9c659d`) |
| 8.12 | 단위 — `TestTaskEventMapping` + `TestHitlPolicyToInterruptOn` (6 케이스) | qa | P1 | 완료 (`a9c659d`) |
| 8.13 | 통합 — 1단계 sub-agent 위임 시 WebSocket 이벤트(`step.started/completed` depth=1, `agent.token` 중계) 포맷 기존과 100% 동일 확인 | qa | P1 | 대기 |
| 8.14 | 통합 — 2단계 중첩 sub-agent 위임(서브→서브서브) 시 depth=2 emit + parent_id 체인 검증 | qa | P2 | 대기 |
| 8.15 | 회귀 — commit `445c41f` Gmail sub-agent 시나리오 재실행, 동일한 UX 확인 (중복 응답 없음, 도구 호출 로그 표시) | qa | P1 | 대기 |
| 8.16 | HITL — per-subagent `interrupt_on` 발동 시 frontend interrupt 카드 정상 표시, `resume` 시 동일 sub-agent 컨텍스트로 재개 | qa | P2 | 대기 |
| 8.17 | (선택) 병렬 실행 — 2개 sub-agent `task` 동시 호출 시 이벤트 인터리빙 정상 처리, `stepId` 충돌 없음 | qa | P3 | 대기 |
| 8.18 | 전체 회귀 — `pytest` + `pnpm lint` + Phase 6 주요 통합 시나리오 | qa | P1 | 대기 |

#### 8-4. 결정 사항

| ID | 항목 | 결정 | 근거 |
|----|------|------|------|
| 8-D1 | 전환 전략 | big-bang (feature branch 병행) | `_delegate` 와 `subagents=[...]` 공존 시 tool 이름 충돌·이벤트 경로 분기 복잡도 급증. 스파이크 결과 반영 후 일괄 전환. |
| 8-D2 | 롤백 포인트 | Phase 8 feature branch 머지 직전 태그(`pre-subagent-middleware`) | 통합 회귀 실패 시 태그로 리셋. Q3 구조는 git 이력으로 복원 가능. |
| 8-D3 | WebSocket 이벤트 포맷 | 기존 유지 (변경 금지) | 프론트엔드 `AgentFlowDebugPanel` / `chat-interface` 가 이미 기존 포맷을 소비 중. 어댑터 레이어에서만 변환. |
| 8-D4 | Sub-agent 모델 오버라이드 | DB 저장된 sub-agent `modelId` 그대로 `subagent.model`에 넘김 | 기존 동작과 동일. 부모와 다른 모델 사용 가능. |
| 8-D5 | `hitlPolicy` → `interrupt_on` 매핑 | sub-agent 자체의 `hitlPolicy.tools[].toolName` → `{toolName: True}` dict 로 변환 | agent-level HITL 이 자동으로 sub-agent 레벨에 내려감. |

#### 8-5. 리스크·완화

| 리스크 | 완화 |
|--------|------|
| 스파이크 결과 이벤트 중계 불가능 판명 | Phase 8 전체 중단, Q3 유지. 스파이크 비용은 2~3일. |
| `task` 도구 payload 스키마가 버전별 다름 | Context7 문서 + 실제 astream_events 덤프로 현재 `deepagents` 버전 기준 확정, 버전 upgrade 시 재검증 체크리스트 추가. |
| 중첩 이벤트 `parent_ids` 누락 시 depth 계산 실패 | 어댑터에 폴백 로직(`tool_call_id` → 자체 depth 추적) 추가. |
| 제거되는 `_delegate` 내부의 thinking 파싱 / 재시도 로직 | 공식 경로에도 `_parse_thinking_stream` 동일 적용 — 파서는 경로 독립. |
| 중복 실행 방지용 `visited` set 로직 누락 시 무한 재귀 | 8.9 에서 `build_subagents` 재귀 호출에 동일 set 전달, 단위 테스트 8.11 에 순환 케이스 포함. |
| 병렬 실행 시 `stepId` / `child_thread_id` 충돌 | 현재 pattern `{parent}-sub-{inline_id}` 를 `{parent}-sub-{inline_id}-{uuid4[:6]}` 로 확장. |

#### 8-6. 검증 가이드

브라우저 확인 체크리스트 (8.13~8.15 수동 검증 대상):

1. http://localhost:3001 에서 sub-agent 를 포함한 에이전트 열기 (예: Gmail 보조 + 메인 에이전트)
2. 메인 에이전트에게 sub-agent 사용을 유도하는 질문 전송
3. 확인 지표:
   - [ ] Debug Panel 에 `step.started { stepType: "agent", name: <sub-agent 이름> }` 노드 표시 (tool 이 아닌 agent)
   - [ ] sub-agent 내부 도구 호출이 depth=1 또는 2 로 중첩 표시
   - [ ] sub-agent 응답이 메인 최종 응답에 정상 병합
   - [ ] 중복 응답 없음 (커밋 `445c41f` Gmail 회귀 검증)

#### 8-7. 롤백 절차

통합 회귀 실패 시 Q3 구조로 완전 복구:

```bash
git checkout refactoring-deep-agent
git reset --hard pre-subagent-middleware
git push --force-with-lease origin refactoring-deep-agent   # 사용자 승인 필수
```

---

### Phase 9 — Agent 배포 + 외부 채팅 API + 진행상태 스트리밍 (database + backend + frontend) ✅ 완료 (2026-05-08 ~ 09)

> 9-1 ~ 9-7 모두 코드 반영 + 운영 진행 중. `agent_deployments` 테이블 / NestJS `agent-deployments`·`public-chat` 모듈 / runner `streaming/` (`activity_labels.py`·`external_event_adapter.py`·`external_namespace.py`) / agent-web 배포 관리 페이지 / `API.md` 정합성 / `down.sql` + `EXTERNAL_CHAT_ENABLED` 토글 등 모두 산출됨. 잔여 후속(비동기 메시지 모델, envelope 인터셉터, cursor 페이지네이션)은 §0-4 로 이관.

**목적**
외부 client(웹 위젯·모바일·서드파티)가 발급된 API Key 한 장으로 **배포된 agent** 와 멀티턴 대화하고, "어떤 도구·skill 을 사용 중" 을 사용자 친화적 이벤트로 받을 수 있는 공개 채팅 API 를 제공한다.

**확정 결정 사항**

| 항목 | 결정 |
|------|------|
| 배포 도메인 모델 | **`AgentDeployment` 신규 테이블** (snapshot/version/status/environment/publicPath) |
| 진행상태 프로토콜 | **socket.io** (기존 hitl_gateway 재사용 + 외부 namespace 분리) |
| 외부 이벤트 상세도 | **중간** (도구명 + 한글 표시명 + 아이콘 + 입력 요약 + 소요시간) |
| API Key 스코프 | **Deployment 단위** (1 key = 1 agent + 1 environment) |

#### 9-1. AgentDeployment 모델 도입 (database)

`packages/database/prisma/schema.prisma` 에 신규 모델 추가.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | String @id | UUID |
| projectId | String | FK → Project |
| agentId | String | FK → Agent |
| environmentId | String | FK → DeploymentEnvironment (재사용) |
| version | Int | agent당 1부터 증가하는 sequence |
| status | DeploymentStatus | active / inactive / pending_approval / failed |
| publicPath | String | `/api/v1/agents/{agentSlug}/{envSlug}` (자동 생성) |
| snapshot | Json | 배포 시점의 Agent 전체 config (롤백/감사용) |
| deployedBy | String | userId |
| deployedAt | DateTime | |
| undeployedAt | DateTime? | |
| description | String? | release note |

- `@@unique([agentId, environmentId, version])`
- application 레벨에서 (agentId, environmentId, status="active") 1건 보장

추가 변경:
- `ApiKey` → `agentDeploymentId String?` 컬럼 추가, scopes 표준값 `chat:invoke` / `chat:resume` / `chat:read`
- `Thread` → `agentDeploymentId String?` 추가 (외부에서 시작된 thread 추적)
- `Agent.enabled` 의 의미는 draft 활성/비활성으로만 한정. 외부 노출 여부는 `AgentDeployment.status` 가 결정

마이그레이션 파일: `packages/database/prisma/migrations/20260508_add_agent_deployment/migration.sql` (drift 회피 위해 수동 SQL).

#### 9-2. NestJS ApiKeyGuard + 관리 / 외부 라우트 (backend)

**관리용 라우트 (JWT 보호)** — `apps/api/src/modules/agent-deployments/`
- `POST /api/agents/:agentId/deployments` — 배포 (스냅샷 + version 자동 + publicPath 생성)
- `GET /api/agents/:agentId/deployments` — 이력 조회
- `GET /api/agent-deployments/:id` — 상세
- `POST /api/agent-deployments/:id/undeploy` — status=inactive
- `POST /api/agent-deployments/:id/api-keys` — raw key 1회 응답
- `GET /api/agent-deployments/:id/api-keys` — 마스킹된 키 목록
- `DELETE /api/api-keys/:keyId` — revoke

**가드/데코레이터**
- `apps/api/src/modules/auth/guards/api-key.guard.ts` — X-API-Key → SHA256 hash 비교 → enabled/validFrom/expiresAt/status 검증 → request 에 `apiKey`, `agentDeployment`, `agent` 주입
- `apps/api/src/modules/auth/decorators/api-key-auth.decorator.ts` — `@ApiKeyAuth()` 로 JWT 가드 우회

**외부 라우트 (ApiKeyGuard 적용)** — `apps/api/src/modules/public-chat/`
- `POST /api/v1/chat/threads` — thread 생성 (agentDeploymentId 자동 결정)
- `POST /api/v1/chat/threads/:threadId/messages` — 메시지 전송, 즉시 `runId` 응답
- `POST /api/v1/chat/threads/:threadId/resume` — HITL 응답
- `GET /api/v1/chat/threads/:threadId/messages` — 메시지 이력 (페이지네이션)

NestJS 가 외부 키로 인증 후 internal `RUNNER_INTERNAL_KEY` 로 runner 에 프록시. 외부 키 ↔ 내부 키 분리.

#### 9-3. Runner external_event_adapter (backend)

`apps/agent-runner-py/src/modules/streaming/external_event_adapter.py` 신규.

내부 hitl_gateway 가 발행하는 이벤트를 외부 client 용으로 정제해서 별도 socket.io namespace `/v1/chat` 로 emit.

| 내부 (`/`) | 외부 (`/v1/chat`) | 변환 규칙 |
|-----------|-------------------|----------|
| `turn.started` | `chat.turn_started` | threadId, turnId 만 |
| `agent.token` | `chat.message_delta` | depth=0 만, content/delta |
| `agent.reasoning` | (drop) | 노출 안 함 |
| `step.started` | `chat.activity_started` | tool/agent/skill 분류 + 한글명 + 아이콘 + 입력 요약 |
| `step.completed` | `chat.activity_completed` | 출력 요약 + latencyMs |
| `step.failed` | `chat.activity_failed` | error.message 만 |
| `plan.created` | `chat.plan` | steps[{content, status}] |
| `hitl.interrupt` | `chat.approval_required` | actionRequests, allowedDecisions |
| `run.completed` | `chat.turn_completed` | 최종 messages, usage 는 `{tokens, latencyMs}` 만 (cost 제외) |
| `error` | `chat.error` | message, type |

**Activity 정규화 객체 (외부 페이로드 공통 모양)**

```
{
  activityId, kind: "tool"|"agent"|"skill"|"thinking",
  name, label, icon, summary,
  parentActivityId?, depth, status: "running"|"done"|"failed",
  latencyMs?
}
```

#### 9-4. Activity 라벨 / 아이콘 매핑 사전 (backend)

`apps/agent-runner-py/src/modules/streaming/activity_labels.py` 신규. 도구·skill·sub-agent 별 한국어 표시명/이모지 매핑 + 입력 요약 추출 규칙.

기본 매핑 예시: `web_search` → 🔍 웹 검색 / `read_file` → 📄 파일 읽기 / `write` → ✍️ 파일 쓰기 / `ls` → 📁 디렉토리 조회 / `python` → 🐍 코드 실행 / skill → 🛠 스킬: {name} / sub-agent → 🤖 {name} / fallback → 🔧 {name}.

socket.io namespace 분리:
- `/` (기존 internal HITL) — 내부 디버그 패널 유지
- `/v1/chat` (신규 external) — `connect` 시 `auth: { apiKey }` 검증, `subscribe: { threadId }` 후 어댑터 이벤트 수신

#### 9-5. agent-web 배포 관리 UI (frontend)

이번 단계는 **관리자 UI 만**:
- Agent 상세 페이지에 "배포" 탭
- 환경 선택 → "Deploy" 버튼 → version 자동 부여 + 결과 표시
- API Key 발급 / 마스킹 조회 / revoke
- publicPath, curl 예시 카피 버튼

외부 client 위젯/SDK 는 후속 작업.

#### 9-6. API.md 명세화 + 통합 검증 (frontend + qa)

별도 산출물 `API.md` (저장소 루트). 외부 프론트엔드 개발자가 즉시 구현할 수 있도록 다음을 포함:

1. Overview · Authentication · REST API · Realtime(socket.io) · Event Schema · Activity 표시 가이드 · 에러 처리 · 예시(curl + JS) · Changelog

통합 검증:
1. `pnpm --filter @agent-studio/database db:deploy` 성공
2. `POST /api/agents/:id/deployments` → row + publicPath 생성
3. `POST /api/agent-deployments/:id/api-keys` → raw key 1회 응답, DB 에 hash 만 저장
4. 외부 시나리오: curl 로 thread 생성 → 메시지 전송 → socket.io-client 로 `/v1/chat` 구독 → `chat.activity_started/completed/turn_completed` 수신
5. 권한 분리: 다른 deployment 의 키로 호출 시 403, revoke 된 키 401
6. 회귀: 기존 internal `/` socket.io 디버그 패널 / JWT 기반 thread API 정상

#### 9-7. 롤백 절차

- DB 마이그레이션 롤백 SQL 동봉 (`down.sql`) — `agent_deployments` drop, `api_keys.agent_deployment_id` / `threads.agent_deployment_id` 컬럼 drop
- NestJS 모듈 disable: `app.module.ts` 에서 `PublicChatModule` / `AgentDeploymentsModule` import 제거 가능하도록 의존성 격리
- Runner external_event_adapter 는 hitl_gateway 의 hook 한 곳에서만 호출되므로 hook 제거 1줄로 비활성화

---

### Phase 10 — Client 앱 (배포된 에이전트 사용자용 UI + 자격증명 관리) (frontend + backend + database) ✅ 완료 (2026-05-08 ~ 09 본체, 2026-05-09 Gmail OAuth 사용자별 등록, 2026-05-09 ~ 11 채팅·history·credential injection)

> 10-1 ~ 10-8 모두 산출. `apps/agent-web/src/app/(client)/...` 라우트 + `UserCredential` 모델 + AES-256-GCM cipher + `client-agents`·`me-credentials`·`me-providers`·`me-tools` 모듈 + Gemini 스타일 라이트 테마 채팅 UI + Activity 패널 + 도구별 인증 분기(api_key/oauth) + Gmail user-scope OAuth 앱·refresh_token + runner credential injection + `credential_missing` emit + 통합 e2e 스크립트. Phase 10-9 미정 4건은 모두 default 결정 채택.
>
> 후속(sub-agent provider override, resume credential 전파, 외부 client 자격증명, `Tool.requiresCredential`)은 §0-4 로 이관.

**목적**
배포된 agent(=`AgentDeployment.status="active"`) 만 사용 가능한 **엔드유저용 클라이언트 앱**을 추가한다. Builder 가 아닌 사용자(사내 직원·외부 사용자)가 에이전트와 채팅만 하는 모드이며, 에이전트가 요구하는 도구/Provider 자격증명을 사용자가 직접 등록할 수 있어야 한다.

**입력 자료**
Anthropic Claude Design 핸드오프 번들 — `agent-client/{README.md, chats/chat1.md, project/client.html}` (React+Babel standalone 프로토타입). 대화 transcript 의 핵심 의도:
- 빌더 UI 와 별개로 "client에서 에이전트를 클릭해 채팅" 하는 화면
- 왼쪽 메뉴 3 가지: 도구 관리 / 에이전트 / 채팅 히스토리 (새 채팅·검색·라이브러리 제외)
- 빈 상태 → 추천 프롬프트 즉시 전송, Ctrl+Enter, 마크다운 인라인 렌더, 타이핑 인디케이터

#### 10-1. 디자인 시스템 옮겨심기 (frontend)

`apps/agent-web` 에 client 라우트 그룹 추가 — `src/app/(client)/...` (권장; 동일 codebase 로 api-client·로그인 재사용).

**디자인 토큰** (Tailwind config 또는 globals.css 변수로 이식)

| 토큰 | 값 |
|------|----|
| `--bg` / `--bg-2` | #0a0e1a / #0d1424 |
| `--panel` / `--panel-2` | #0f1729 / #131c33 |
| `--border` / `--border-2` | #1f2a44 / #2a3858 |
| `--text` / `--muted` / `--muted-2` | #e6ecff / #8a96b8 / #5d6a8a |
| `--primary` | #3b82f6 |
| accent | cyan #22d3ee / green #22c55e / pink #e879f9 / orange #fb923c / purple #a78bfa |
| font | Pretendard (한글) + JetBrains Mono (코드) |

**페이지 / 컴포넌트 매핑** (HTML 프로토타입 → React 컴포넌트)

| 프로토타입 | 신규 컴포넌트 | 위치 |
|-----------|--------------|------|
| `Sidebar` | `<ClientSidebar>` (도구 관리/에이전트/채팅 히스토리) | `src/app/(client)/_components/sidebar.tsx` |
| `Header` | `<ClientHeader>` (브레드크럼 + 검색 + 알림) | `src/app/(client)/_components/header.tsx` |
| `AgentsGallery` | `app/(client)/agents/page.tsx` | 배포된 agent 카드 그리드 |
| `ChatView` | `app/(client)/agents/[slug]/chat/page.tsx` | 메시지 + composer + 진행상태 패널 |
| `EmptyState` | `_components/empty-state.tsx` | 시작 프롬프트 카드 |
| `MessageBubble` / `TypingDots` / `renderRich` | `_components/message-bubble.tsx` | 마크다운 인라인 |
| `ToolsPage` | `app/(client)/tools/page.tsx` | 도구 자격증명 카드 + 토글 |
| `HistoryPage` | `app/(client)/history/page.tsx` | 사용자 thread 이력 |

**유의 (README of design pkg)**: 프로토타입 `client.html` 의 내부 구조 복사 금지 — 시각 출력만 픽셀 매칭. 이미지 미리보기/스크린샷 촬영 금지 (HTML/CSS 직접 읽기).

#### 10-2. 배포된 에이전트 디스커버리 (backend)

NestJS `apps/api/src/modules/client-agents/` 신규.
- `GET /api/client/agents` — 현재 사용자 컨텍스트(JWT) 가 접근 가능한 **활성 AgentDeployment** 만 반환. 카드용 요약(slug, name, type, description, color/icon, starters, requiredCredentials).
- `GET /api/client/agents/:slug` — 상세 + 자격증명 요건(required tools / required providers) + 사용자가 누락한 항목 목록.
- `requiredCredentials` 도출 로직: `AgentDeployment.snapshot.toolIds` / `mcpServerIds` / `modelId` → 각 도구·MCP·모델이 요구하는 자격증명 종류(`provider:openai` / `tool:gmail-oauth` 등) → 현재 user 의 `UserCredential` 과 diff.

#### 10-3. 사용자 자격증명 모델 (database)

신규 모델 `UserCredential` (도구·Provider 통합):

| 필드 | 타입 | 설명 |
|------|------|------|
| id | String @id | UUID |
| userId | String | FK → User |
| kind | CredentialKind | `provider` / `tool` / `mcp` |
| targetId | String | provider id / tool id / mcp id |
| label | String? | 사용자 표시명 |
| valueEnc | String | 암호화된 자격증명 본문 (AES-GCM, key in `.env`) |
| metadata | Json? | scope, account email 등 부가 정보 |
| status | CredentialStatus | `active` / `invalid` / `expired` |
| lastVerifiedAt | DateTime? | |
| createdAt / updatedAt | DateTime | |

- `@@unique([userId, kind, targetId, label])` — 같은 user 가 같은 도구에 여러 계정 등록 가능
- 마이그레이션: `20260508_add_user_credential`
- 평문 저장 금지 — `apps/api/src/common/crypto/credential-cipher.ts` (AES-256-GCM) 신규 (env: `CREDENTIAL_ENCRYPTION_KEY`)

#### 10-4. 자격증명 / Provider 등록 API (backend)

신규 모듈 `apps/api/src/modules/me-credentials/` (JWT 보호; 사용자 본인 자격증명만 CRUD 가능)
- `GET /api/me/credentials` — 본인 자격증명 마스킹된 목록 (kind 별 필터)
- `POST /api/me/credentials` — body: `{ kind, targetId, label?, value, metadata? }` → 검증(provider 면 `verify-provider` ping) → 저장
- `PATCH /api/me/credentials/:id` — 라벨/value 수정
- `DELETE /api/me/credentials/:id`
- `POST /api/me/credentials/:id/test` — 실 호출로 유효성 확인 (provider key ping, OAuth refresh 등)

신규 모듈 `apps/api/src/modules/me-providers/`
- `GET /api/me/providers` — 사용자가 등록 가능한 provider 카탈로그 + 본인 보유 여부
- `POST /api/me/providers` — provider 추가 (예: OpenAI / Anthropic / Google) — 내부적으로 `UserCredential(kind=provider)` 생성 + `Provider` 행에 `ownerUserId` 추가하거나 user-scoped Provider 분리
- 권한 정책: 본인 등록한 provider 만 본인의 agent 실행에 사용 가능. admin 이 등록한 system-wide provider 는 모든 user 에게 가용 (organization plan).

#### 10-5. 에이전트 클릭 시 자격증명 누락 유도 (frontend)

`agents/[slug]` 진입 시:
1. `GET /api/client/agents/:slug` 응답의 `missingCredentials[]` 를 본다.
2. 누락 0건 → 즉시 ChatView 진입.
3. 누락 ≥1건 → modal `<MissingCredentialsDialog>` 표시:
   - 예: "이 에이전트는 `OpenAI Provider`, `Gmail` 자격증명이 필요합니다. 도구 관리에서 등록해 주세요."
   - "도구 관리로 이동" 버튼 → `/client/tools?focus=<targetId>` (focus 쿼리로 해당 카드 하이라이트 + 입력 폼 자동 오픈)
   - "이 에이전트 사용 안 함" 버튼 → 갤러리로 복귀

`/client/tools` 의 카드 클릭 시 자격증명 입력 폼 (input/textarea/secret-mask + 라벨 입력 + 테스트 버튼). 등록 성공하면 토스트 + 카드 상태를 "연결됨" 으로 갱신.

`/client/agents/[slug]?need=<csv>` 등의 deep link 도 지원.

#### 10-6. 채팅 화면 데이터 연결 (frontend + backend)

본 단계에서는 **내부 사용자(JWT)** 기반으로 동작. Phase 9 의 외부 X-API-Key 채팅 API 와는 분리:
- `POST /api/client/threads`, `POST /api/client/threads/:id/invoke` — 기존 internal threads API 재사용 (이미 JWT 보호)
- 진행상태는 기존 `/` socket.io namespace + 디버그 패널 이벤트 그대로 활용하거나, Phase 9 의 외부 어댑터 (`/v1/chat`) 를 internal 에서도 그대로 emit 하도록 옵션화. 현 단계 권장: **internal events 의 정제판을 그대로 client 에 노출**하되, 표시는 Phase 9 의 Activity 객체 모양 (kind/icon/label/summary) 으로 통일.

`<ChatView>` 의 진행상태 패널은 `chat.activity_*` 와 동일 모양으로 렌더 — Phase 9 의 Activity 컴포넌트 재사용.

#### 10-7. 보안·격리

- `UserCredential.valueEnc` 는 응답 시 절대 평문 노출 금지. `lastFour` / `maskedValue` 만 노출.
- Runner 가 자격증명을 사용해야 할 때: NestJS 가 thread/run 시작 시 `RUNNER_INTERNAL_KEY` 와 함께 user 의 자격증명 dict 를 inject (HTTP body 가 아닌 server-to-server 채널). Runner 는 stateless 하게 받은 dict 사용.
- 다른 user 의 자격증명 호출 시 403. agent 가 호출하는 도구에 user 자격증명이 누락이면 runner 는 명시적 `chat.error { type: "credential_missing", details: { targetId } }` emit.

#### 10-8. 산출물 / 검증

검증:
1. `/client/agents` — 배포된 agent 만 표시되고 inactive 는 제외.
2. agent 클릭 시 누락 자격증명 modal 정상 표시.
3. `/client/tools` 에서 OpenAI key 등록 → `POST /api/me/credentials/:id/test` 성공.
4. modal 닫고 다시 agent 클릭 → ChatView 진입, 메시지 송신 → `chat.activity_*` 정상 수신.
5. 다른 user 의 credential id 로 직접 PATCH/DELETE 시도 시 403.
6. lint/build/typecheck 통과.

#### 10-9. 미정 항목 (구현 착수 전 결정 필요) — ✅ 결정 완료

- ✅ client UI 라우트 위치: `apps/agent-web/src/app/(client)/...` (apiClient·로그인 재사용).
- ✅ Provider 모델: `UserCredential(kind=provider)` 단독 (Provider 모델 침투 변경 회피).
- ✅ 암호화 키: `.env CREDENTIAL_ENCRYPTION_KEY` 단일 (KMS 는 후속 인프라 작업).
- ✅ multi-account: `@@unique([userId, kind, targetId, label])` 라벨 기반 (라벨 미입력 시 빈 문자열 default).

---

### Phase 11 — Client 로그인 분리 + 인증 격리 (frontend + backend) ⏳ Phase 1~5 완료, Phase 6 대기 (2026-05-13)

**목적**
- admin/client 인증·세션 완전 분리. admin 에서 Client 진입 시 별도 로그인 흐름.
- 기존 `useUserStore` 의 mockApi/임시 강제 admin 로그인 제거, 실 백엔드 JWT 통합.

#### 11-1 ~ 11-5. 완료

| # | 작업 | 상태 |
|---|------|------|
| 11.1 | mockApi 제거 + useUserStore 실 API 호출, admin/client localStorage 키 분리, `/client/login` 신설, `(client)/layout.tsx` 가드 | 완료 (2026-05-13 (12)) |
| 11.2 | Usage/Monitoring/Providers 의 admin guard 제거, ADMIN 섹션 헤더 위치 조정, `/settings/users` 만 admin 전용 | 완료 (2026-05-13 (13)) |
| 11.3 | Providers 사용자별 키 등록 (`UserCredential(kind=provider)`), runner `_resolve_provider_key` 글로벌 fallback 제거 | 완료 (2026-05-13 (14)) |
| 11.4 | 사용자 추가 시 자동 Workspace Project 생성 + admin 비밀번호 리셋(`test1234!`) | 완료 (2026-05-13 (15)) |
| 11.5 | 본인 비밀번호 변경 (`PATCH /api/users/me/password`) + Settings/Profile 페이지 (admin + client) | 완료 (2026-05-13 (16)) |
| 11.5b | Refresh token race 의도치 않은 로그아웃 방지 (single-flight) | 완료 (2026-05-13 (17)) |

#### 11-6. 남은 작업

| # | 작업 | 우선 | 상태 |
|---|------|------|------|
| 11.6 | Idle 1시간 자동 로그아웃 | P3 | 대기 |
| 11.7 | `useClientUserStore` 분리 (현재 admin/client 공통 store) | P3 | 대기 |
| 11.8 | `mockApi` alias(`api-client.ts:796`) 이름 정리 | P3 | 대기 |

---

### Phase 12 — Gmail 사용자 토큰 inject (backend) ✅ 완료 (2026-05-09)

> Phase 11-1/2/3 으로 표기되었던 작업 — admin builder 의 Project 단위 Gmail OAuth 앱 ↔ 사용자별 `UserCredential(kind=tool, targetId=gmail, label=oauth-app)` 가 공존하며 본인 토큰이 우선 사용되도록 NestJS → runner → BuiltinToolsService → Gmail 도구 빌더까지 `user_id` 전파.
>
> 12-1. `tools.service.ts::tryIssueUserGmailAccessToken`. 12-2. NestJS internal endpoint `?userId=` 쿼리 수용. 12-3. runner 가 access-token GET 호출 시 `params={"userId": user_id}` 추가, fallback 으로 admin Project 토큰 유지.

---

### Phase 13 — 대시보드/사용량 데이터 파이프라인 ✅ 완료 (2026-04-28 ~ 29)

> Phase 1.5 / 1 / 2 / 3 / 4 / 5 (스킴 확장 + Runner 기록 + cron 집계 + stores 실 API 전환 + `/monitoring` + Insights + Provider/Model 비용 분해표) 모두 산출. 한계는 §0-4 (DailyMetric environment/agentId 컬럼).

---

### Phase 14 — Skills(agent ↔ skill) ✅ 완료 (2026-04-26)

> `Agent.skillIds: String[]` + 마이그레이션 + `validateSkillOwnership` + runner `_sync_skills_for_run`/`_make_skills_backend` + SkillsTab + Sub-agent skillIds. 후속 보강:
> - 2026-05-08 store 키 prefix 중복 제거 (CompositeBackend `/skills/` 라우트 충돌 fix)
> - 2026-05-12 (2) hr-document skill 로드 실패 (`_make_skills_backend` 에 `store` 명시 주입)
> - 2026-05-12 (3) skill 지시 미준수 → SkillsMiddleware progressive disclosure 강제 지시 추가
> - 2026-05-12 (4) `_build_skill_md` YAML frontmatter 콜론 escape (yaml.safe_dump)
> - 2026-05-12 (5) `_inject_skill_contents_to_specs` 로 sub-agent system prompt 에 SKILL.md 내용 직접 주입

---

### Phase 15 — HITL 승인 카드 ✅ 완료 (2026-04-24)

> `_extract_interrupt` state.interrupts 누락 fix, `human_interactions.id/threads.id` 명시적 UUID 생성, `_normalize_decisions` SQL 파라미터 순서 fix, `_pump_stream` error 이벤트 propagation. 인라인 폼(`window.prompt` 제거) + 한국어 도구 라벨 매핑 + 입력창 stop/스피너.

---

### Phase 16 — 응답 중지(Stop) ✅ 완료 (2026-05-12)

> runner `cancel_registry` + `POST /threads/{thread_id}/cancel` + `_revert_in_progress_todos_on_cancel` (in_progress + 같은 turn 의 completed 모두 base 이전 상태로 revert) + `_sweep_final_todos` 답변 본문 검증 + WS `run.cancelled` emit + ClientChatView/AgentFlowDebugPanel stop 버튼 토글 + history sweep cancelled 분기.

---

### Phase 17 — Thread 단위 Run 이력 영속화 ✅ 완료 (2026-05-10)

> `WorkflowRun.threadId` + `StepTrace.stepId/parentStepId/depth` + 신규 라우트 `GET /threads/:id/runs` + ClientChatView 의 messages + runs 시간순 병합(turn 1:1 매칭) + `restoreStepTree` 헬퍼.

---

### Phase 18 — 슬러그 자동 생성 + 외부 도메인 접속 + 정적자산 standalone 자동복사 ✅ 완료 (2026-05-12 ~ 13)

> `resolveUniqueSlug` (Agent/Team/Import 공통, `agent`/`team` fallback + `-2`,`-3` suffix), CORS 화이트리스트 확장, `postbuild:standalone` 스크립트, `confirm-dialog.tsx` Promise 기반 ConfirmDialog 도입(14개 native confirm 호출처 일괄 교체).

---

## 5. 의존성·순서

```
[완료] Phase 0 → 1 → 2 → 3·4 → 5 → 6 → 7(부분) ─┐
                                                  ├─► [완료] Phase 8 (subagent middleware)
                                                  ├─► [완료] Phase 9 (deployment + 외부 채팅)
                                                  └─► [완료] Phase 10 (Client UI + 자격증명)
                                                            │
                                                            ├─► [완료] Phase 11-1~5 (로그인 분리)
                                                            ├─► [완료] Phase 12 (Gmail user token)
                                                            ├─► [완료] Phase 13 (대시보드 파이프)
                                                            ├─► [완료] Phase 14 (Skills)
                                                            ├─► [완료] Phase 15 (HITL 카드)
                                                            ├─► [완료] Phase 16 (Stop)
                                                            ├─► [완료] Phase 17 (Thread runs)
                                                            └─► [완료] Phase 18 (slug + ConfirmDialog)

[대기] Phase 7-{3,9,12,13} (P1·P2·P3 4건)
[대기] Phase 8-{13~18} (회귀 검증만)
[대기] Phase 11-{6,7,8} (idle logout + store 분리 + alias 정리)
```

**병렬 가능 구간:**
- Phase 2.2~2.8 (backend) + Phase 2.10 (qa) 병렬
- Phase 3.3~3.5 (frontend) + Phase 4.1~4.2 (database) 병렬
- Phase 5 (dev-ops/backend) + Phase 6 준비 (qa) 병렬

---

## 6. 신설 파일 목록

| 파일 | 담당 | 설명 |
|------|------|------|
| `apps/agent-runner-py/src/modules/deep/__init__.py` | backend | 모듈 초기화 |
| `apps/agent-runner-py/src/modules/deep/guardrails.py` | backend | 입출력 가드레일 + PII 래퍼 |
| `apps/agent-runner-py/src/modules/deep/memory.py` | backend | STM/LTM 외부 래퍼 |
| `apps/agent-runner-py/src/modules/deep/tool_wrapping.py` | backend | 도구 권한 정책 래퍼 |
| `apps/agent-runner-py/tests/modules/agents/test_deepagent_bridge.py` | qa | 이벤트 어댑터 단위 테스트 |
| `apps/agent-runner-py/tests/modules/deep/test_guardrails.py` | qa | 가드레일 단위 테스트 |
| `apps/agent-runner-py/tests/modules/deep/test_tool_wrapping.py` | qa | 도구 권한 단위 테스트 |
| `apps/agent-runner-py/tests/modules/deep/test_memory.py` | qa | 메모리 래퍼 단위 테스트 |

---

## 7. 수정 파일 목록

| 파일 | 담당 | 변경 내용 |
|------|------|---------|
| `apps/agent-runner-py/src/modules/agents/deepagent_bridge.py` | backend | 전면 rewrite — `create_deep_agent` + 이벤트 어댑터 |
| `apps/agent-runner-py/src/modules/agents/agents_service.py` | backend | `_should_use_deepagent` 제거, `load_agent_with_deps` SQL/반환 dict 보정(`slug/hitlPolicy/toolPermissions`), `_delegate` 내부 엔진 교체, `resume` 경로 전환 |
| `apps/agent-runner-py/src/modules/langgraph/prompt_resolver.py` | backend | `instructions` 전단 처리 유지 |
| `apps/agent-runner-py/src/modules/builtin_tools/vfs_service.py` | backend | deprecate (공식 VFS로 대체, 파일은 Phase 5까지 유지) |
| `apps/agent-runner-py/pyproject.toml` | dev-ops | `deepagents` 추가, `deepagent-sdk` path source 제거 |
| `packages/database/prisma/schema.prisma` | database | `Agent.toolPermissions Json?` 추가 |
| `packages/shared/src/types/agent.ts` | frontend | `AgentToolPermissions` 타입, no-op 필드 정리 |
| `apps/agent-web/src/components/agents/builder/ReasoningTab.tsx` | frontend | no-op 필드 비활성 처리 |
| `apps/agent-web/src/components/agents/builder/PlanningTab.tsx` | frontend | no-op 필드 비활성 처리 |
| `apps/agent-web/src/components/agents/builder/ToolPermissionsPanel.tsx` | frontend | DB 저장 연결 |
| `AGENTS.md` | backend | SDK 관련 섹션 업데이트 |

---

## 8. 삭제 파일 목록 (Phase 5)

- `packages/deepagent-sdk/` 전체 (22 파일)

```
packages/deepagent-sdk/
├── src/deepagent/
│   ├── __init__.py
│   ├── models.py
│   ├── memory/ (manager, short_term, long_term, summarizer)
│   ├── planning/ (planner, executor)
│   ├── reasoning/ (chain_of_thought, reflection)
│   ├── guardrails/ (filters, pii_detector)
│   └── tools/ (permission, registry)
├── tests/
│   ├── test_reasoning.py
│   └── test_guardrails.py
└── pyproject.toml, uv.lock
```

---

## 9. 리스크·완화

| 리스크 | 완화 방안 |
|-------|---------|
| WebSocket 이벤트 포맷 변경 → UI 전체 장애 | Phase 2.3 어댑터 철저히, Phase 6.1 검증 필수 |
| 공식 `deepagents` API 변동 | Phase 0.1 버전 고정, changelog 추적 |
| 장기 메모리 주입 누락 | Phase 2.4 명시적 주입 + Phase 6.4 검증 |
| LangGraph 버전 충돌 | Phase 0.1 호환성 매트릭스 확인 |
| 도구 권한 누락 (`restricted`/`disabled`) | Phase 2.6 래퍼 + Phase 6.6 전수 검증 |
| VFS 이름 충돌 → `create_deep_agent` 오류 | Phase 2.9 필터링으로 사전 제거 (Q1) |
| `resume`이 잘못된 그래프 인스턴스에서 실행 → HITL 장애 | Phase 2.10 resume 전환 + Phase 6.2 검증 (Q2) |
| 서브에이전트 중계 이벤트 누락 → UX 저하 | `_delegate` 구조 유지, 내부 엔진만 교체 (Q3) |
| workspace 정리 전 SDK 디렉토리 삭제 → `pnpm install` 오류 | Phase 5.1(workspace 정리) → 5.2(삭제) 순서 준수 |
| `slug/hitlPolicy/toolPermissions` 미반환 → 런타임 None 오류 | Phase 3.2 SQL + 반환 dict 보정 |

---

## 10. 커밋 전략

- **Phase 단위 PR** — Phase 1, 2, 3+4, 5, 6 각각 별도 PR
- 커밋 메시지: `<type>(<scope>): <subject>`
  - type: `feat / fix / refactor / docs / chore / test`
  - scope: `runner / api / web / shared / db / infra`
- 각 PR body에 관련 Phase 체크리스트 + 검증 로그
- 사용자 명시 승인 전 커밋·푸시 금지

---

## 11. 미래 작업 (Backlog)

> Phase 7 항목(`refactoring-deep-agent-ui-gaps.md` 참조)은 별도 트랙으로 관리. 여기에는 Phase 7 외 장기 과제만 정리.

### ~~공식 SubAgent 미들웨어로 전환~~ → Phase 8 로 이관

> 상세 작업 계획은 §4 Phase 8 참조.

### VFS 가상 파일 시스템 재활성화

- **현재 상태**: `create_deep_agent` 호출 시 `permissions=[]`로 VFS 내장 도구(write_file, read_file, ls, edit_file) 비활성화
- **비활성화 사유**: LLM이 "파일에 저장했습니다"라고 응답하지만 실제로는 `state["files"]` dict에만 저장되는 가상 파일. 사용자에게 혼란을 줌. UI STATE 탭에서 가상 파일 내용을 조회하는 기능이 미구현
- **재활성화 조건**:
  1. PlaygroundTab의 STATE 탭에서 `files` 상태 시각화 UI 구현
  2. 사용자에게 "가상 파일"임을 명시하는 UX 처리 (예: 파일 다운로드 버튼, 클립보드 복사)
  3. `deepagent_bridge.py`의 `permissions=[]` → `permissions=None` (기본값)으로 변경
- **관련 파일**: `apps/agent-runner-py/src/modules/agents/deepagent_bridge.py` (stream + resume 두 곳)

---

## 참고 문서

- 설계 분석: [refactoring-deep-agent.md](./refactoring-deep-agent.md)
- 프로젝트 규칙: [AGENTS.md](./AGENTS.md)
- 서브 에이전트 정의: `.claude/agents/*.md`
