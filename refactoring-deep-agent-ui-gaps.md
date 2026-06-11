# Agent Flow/Builder UI ↔ Runner 구현 갭

> 작성: 2026-04-22 / 최종 갱신: 2026-05-14
> 대상 화면: `apps/agent-web/src/app/(dashboard)/agents/[agentId]/page.tsx` (Agent Flow Builder)
> 대상 소스: `src/components/agents/flow/*`, `src/components/agents/builder/*`, `apps/agent-runner-py/src/modules/*`

현재 화면에 렌더링되지만 백엔드 동작이 없거나 부분적으로만 연결된 항목 전수 목록. 살아있는 체크리스트.

---

## 0. 남은 갭 (2026-05-14 기준)

> §3 이하 상세표는 시계열 기록 보존용으로 그대로 두되, 이번 사이클 기준 **실제 미해결된 항목만** 위로 끌어올린다. Phase 매핑은 [plan §0](./refactoring-deep-agent-plan.md#0-남은-작업-top-of-mind--2026-05-14-기준).

### 0-1. 즉시 손댈 수 있는 잔여 (4건)

| # | 화면/경로 | 항목 | 현 상태 | 우선 | 액션 |
|---|----------|------|--------|------|------|
| 1 | Flow Canvas (`FlowCanvas.tsx` / `MainAgentNode.tsx`) | Main Agent 컨테이너 — dashed frame + "MAIN · {name}" + running blue dot pulse | 디자인만 (코드 없음) | P1 | 노드 bounds 계산해 dashed border + 라벨 + running 시 pulse |
| 2 | Tools Tab → Tool Permissions (`tool_wrapping.py:48`) | `restricted.conditions` 인자 제한 래퍼 | 메시지만 반환, 인자 검증 X | P2 | `restricted` 분기에 input 인자 검증 추가 |
| 3 | Prompt Tab (`prompt_resolver.py:74-101`) | Jinja 변수 — `{{previous_output}}`, `{{kb_results}}` | `{{current_time/_timezone/plan.mode/guardrails.max_output_length}}` 만 치환 | P3 | 변수 치환 맵 확장 |
| 4 | Guardrails Tab ↔ Model Tab | `maxOutputLength` 사후 절단 ↔ `max_tokens` LLM 파라미터 역할 분리 | 두 경로 중복 | P3 | 사후 절단 경로 분리 + 문서 명확화 |

### 0-2. 이전 사이클에 닫힌 항목 (참고)

- ✅ **Debug Panel 메트릭 토큰/비용** — `usage_metadata` 누적 + `runs/pricing.py` 단가 + `WorkflowRun.modelId` (Phase 13, 2026-04-28~29).
- ✅ **Provider × Model 비용 분해표** — `/usage` 페이지에 추가 (2026-04-29).
- ✅ **Output Schema 검증** — deferred 모드 `_filter_last_assistant_message` + `validate_schema()` + `jsonschema==4.26.0` (2026-04-27).
- ✅ **Handoff 7 필드** — `AgentFlowSettingsPanel.tsx:39` 에서 Handoff 탭 자체를 disabled + "준비 중" 배지 (2026-05-11). 방안 B 채택.
- ✅ **Architecture `custom_graph` / Deep Autonomous 옵션** — `MainAgentModal.tsx` / `BasicTab.tsx` 의 ARCHITECTURE 섹션 전체 제거 (2026-05-12). 옵션 자체가 사라져 결정 종료.
- ✅ **Architecture `plan_execute` Runner 분기** — Client 채팅에서 `react`/`plan_execute` 토글, plan_execute 전용 system prompt + sweep + TODO 운영 규칙(`_todo_operating_rules_prompt`) 분기 (2026-05-12).
- ✅ **Reasoning `cotVisible` / `thinkingDepth` D5 비활성** — `ReasoningTab.tsx:40` `DisabledField` 적용. "현재 버전에서 지원되지 않습니다" 라벨.
- ✅ **Planning `orchestrationMode` / `replanningTrigger` / `parallelToolExecution` / `planningDepth`** — `PlanningTab.tsx` DisabledField + "준비 중" 배지.
- ✅ **HITL 승인 카드 인라인 폼** — `window.prompt` 제거, 도구명 한국어 매핑, 인자별 input/textarea (2026-04-24).
- ✅ **응답 중지(Stop)** — runner `cancel_registry` + `_revert_in_progress_todos_on_cancel` + WS `run.cancelled` + UI Square 토글 + group chip "취소됨" (2026-05-12).
- ✅ **Thread 단위 Run 이력 영속화** — `GET /threads/:id/runs` + ClientChatView 의 turn 1:1 매칭 복원 (2026-05-10).
- ✅ **Client 채팅 UI** — Gemini 스타일 라이트 테마 + ActivityGroupCard "N개 작업 완료" pill + agent.token depth=0 누적 + AgentAvatar (2026-05-09).
- ✅ **자격증명 도구별 분기** — api_key vs oauth, Gmail user-scope OAuth 앱 등록 + refresh_token 저장 + access-token 자동 갱신 (2026-05-09).
- ✅ **Client 로그인 분리** — admin/client localStorage 키 분리, `/client/login` 신설, Providers 사용자별 키 등록, 사용자 추가 시 자동 Workspace Project 생성, refresh token single-flight (2026-05-13).
- ✅ **TO-DO List monotonic forward + 클릭 점프** — 완료된 항목은 과거 snapshot 에서도 completed 유지, 강조된 항목 클릭 시 그 turn 답변 위치로 scrollIntoView (2026-05-13).
- ✅ **답변 본문 기반 TODO sweep** — 모델 over-mark 시 답변에 등장 안 한 항목은 자동 pending 으로 되돌림 (`_todo_appears_in_answer` 휴리스틱, 2026-05-12).
- ✅ **Skills(SKILL.md) 본문 적용** — store 키 prefix 중복 fix + sub-agent 에 SKILL.md 내용 직접 주입 (2026-05-08, 2026-05-12).
- ✅ **Provider 사용자별 키 등록** — admin 글로벌 `Provider.apiKeyEncrypted` deprecated, `UserCredential(kind=provider, targetId=<slug>)` 단독 사용 (2026-05-13).

### 0-3. 의도적으로 disabled / 제거된 UI

- Sidebar: `Workflows`/`Knowledge`/`Evaluation` 메뉴 — disabled + "준비 중" 배지 (2026-05-11).
- Agents 페이지: `Teams`/`Run History`/`A/B 비교` 탭 — disabled + 배지, `템플릿으로 시작` 버튼 disabled.
- AgentFlowSettingsPanel: `Handoff` 탭 — disabled.
- BasicTab / MainAgentModal: ARCHITECTURE 섹션 자체가 사라짐.
- Topbar: Search 입력창 + Bell 알림 disabled.

### 0-4. 디렉토리 정리 (plan §0-5 와 동일)

- `packages/database/prisma/add-{gpt5-models,missing-models,models}.ts` 3 일회성 스크립트 — 커밋 or 삭제 결정.
- `__pycache__` 변경분 `.gitignore` 점검.

---

## 1. 상태 범례

- **동작중** — UI·DB·Runner 3단 모두 연결
- **부분구현** — DB까지 저장되지만 Runner가 미사용/부분사용
- **미구현(no-op)** — UI만 존재하고 DB/Runner 어디에도 반영 안 됨
- **디자인만** — 디자인 시안 또는 설계 문서에 있지만 UI 자체가 없음

---

## 2. 우선순위 Top 10 (P1 = 가장 시급) — 2026-05-14 갱신

| # | 항목 | 상태 | 영향도 | 우선순위 |
|---|------|------|--------|---------|
| 1 | Debug 메트릭 `inputTokens / outputTokens / cost` | ✅ 완료 (2026-04-28, Phase 13) | 높음 | — |
| 2 | Main Agent 컨테이너 (점선 프레임 + "MAIN · {name}" 라벨 + 실행 중 blue dot pulse) | **디자인만** | 중 | **P1** |
| 3 | Handoff 조건/대상 (`handoffCondition`, `handoffTarget`, `retry`, `backoff`, `fallback`) | ✅ 완료 (Handoff 탭 disabled — 방안 B, 2026-05-11) | 중 | — |
| 4 | Architecture 분기 — `tool_calling`(Fast), `plan_execute`(Planning) Runner 미완성 | ✅ 완료 (plan_execute Client UI 토글 + 전용 system prompt, tool_calling/Deep Autonomous 옵션 BasicTab 에서 제거) | 높음 | — |
| 5 | Architecture `custom_graph`(Expert) 옵션 disabled 처리 | ✅ 완료 (ARCHITECTURE 섹션 전체 제거, 2026-05-12) | 낮음 | — |
| 6 | Output Schema (JSON Schema) — Runner에서 출력 강제/검증 미적용 | ✅ 완료 (deferred 모드, 2026-04-27) | 중 | — |
| 7 | Tool Permissions 조건식 (`conditions` for `restricted`) Runner 미사용 | **미구현(no-op)** | 중 | **P2** |
| 8 | Orchestration Mode (`sequential / parallel / conditional`) Runner 미사용 | ✅ 완료 (DisabledField + "준비 중" 배지) | 중 | — |
| 9 | Reasoning `cotVisible` Toggle — D5 비활성 표시 | ✅ 완료 (`ReasoningTab.tsx:40` DisabledField) | 낮음 | — |
| 10 | Replanning Trigger (`never / on_failure / always`) Runner 미사용 | ✅ 완료 (DisabledField) | 낮음 | — |
| 11 | Jinja 변수 확장 — `{{previous_output}}`, `{{kb_results}}` | **부분구현** | 낮음 | P3 |
| 12 | `maxOutputLength` vs LLM `max_tokens` 역할 분리 | **미실시** | 낮음 | P3 |

---

## 3. 영역별 상세

### 3-1. Debug Panel — 메트릭

| 필드 | UI | DB | Runner | 상태 | 근거 / 제안 |
|------|----|----|--------|------|-----------|
| `latencyMs` | O | — | O | 동작중 | `AgentFlowDebugPanel.tsx` 에서 `step.completed.latencyMs` 누적 |
| `inputTokens` | O | `workflow_runs` | O | ✅ 동작중 (2026-04-28) | `_pump_astream_events` 가 `AIMessageChunk.usage_metadata` 누적 → `run.completed.data.usage` |
| `outputTokens` | O | `workflow_runs` | O | ✅ 동작중 (2026-04-28) | 동일 |
| `cost` | O | `workflow_runs` | O | ✅ 동작중 (2026-04-28) | `runs/pricing.py` 모델별 단가 + `WorkflowRun.modelId` 컬럼(2026-04-29) |

✅ Phase 13 완료. `/dashboard`·`/usage`·`/monitoring` 페이지에 실 데이터 표시. Provider × Model 비용 분해표 추가 (2026-04-29).

### 3-2. Sub-Agent Node / Canvas

| 항목 | 상태 | 근거 / 제안 |
|------|------|-----------|
| 노드 카드 자체 | 동작중 | `SubAgentNode.tsx` |
| 실행 중 status dot pulse + 카드 glow | 동작중 (방금 추가됨) | `f67ef1f` 커밋 |
| 실행 중 엣지 파란 점선 흐름 | 동작중 (방금 추가됨) | `f67ef1f` 커밋 |
| Main Agent 컨테이너 점선 프레임 + 라벨 | **디자인만** | 디자인 프로토타입 `project/src/Canvas.jsx:MainAgentContainer` 에만 있음. `FlowCanvas.tsx` 에 미구현 — 노드 bounds 계산해 dashed border + `MAIN · {name}` 라벨 + running 시 blue dot pulse 추가 필요 |
| 그래프 저장/로드 | 동작중 | `agent.graphDefinition` JSON 필드 — 저장·복원 확인됨 (`page.tsx:82`) |

### 3-3. Settings Panel — 기본 (BasicTab)

| 필드 | UI | DB | Runner | 상태 |
|------|----|----|--------|------|
| `name` | O | O | O | 동작중 |
| `description` | O | O | O | 동작중 |
| `role` (search/analyze/generate/validate/tool) | O | O | (표시만) | 부분구현 — Runner 동작에 영향 없음, 시각적 분류용 |
| `memory` (Toggle, MemoryPanel) | O | O | O | 동작중 |

### 3-4. Settings Panel — 프롬프트 (PromptTab)

| 필드 | 상태 | 비고 |
|------|------|-----|
| `systemPrompt` | 동작중 | `deepagent_bridge` 의 `instructions` 로 전달 |
| Jinja 변수 | 부분구현 | `prompt_resolver.py:74-101` 가 `{{user_input}}` + `{{current_time}}` + `{{current_timezone}}` + `{{plan.mode}}` + `{{guardrails.max_output_length}}` 치환. `{{previous_output}}`, `{{kb_results}}` 만 잔여 (Phase 7.12) |

### 3-5. Settings Panel — 도구 (ToolsTab) / ToolPermissionsPanel

| 필드 | UI | DB | Runner | 상태 |
|------|----|----|--------|------|
| 도구 선택 (`toolIds`, `toolGroupIds`, `mcpServerIds`, `builtinToolIds`) | O | O | O | 동작중 |
| `toolPermissions` dict (auto / requires_approval / restricted / disabled) | O | O | O | 동작중 — D3·Phase 4 완료 |
| `conditions` (restricted 정책의 인자 제한 조건식) | O | O | X | **미구현(no-op)** — `tool_wrapping.py:48` 의 restricted 가 메시지만 반환. 인자 검증 래퍼 추가 필요 (Phase 7.9 잔여) |

### 3-6. Settings Panel — 모델 (ModelTab)

| 필드 | UI | DB | Runner | 상태 |
|------|----|----|--------|------|
| `modelId` | O | O | O | 동작중 |
| `temperature` | O | O | O | 동작중 |
| `maxTokens` | O | O | O | 동작중 |
| `topP` | 없음 | 없음 | 없음 | 디자인만 (프로토타입 스펙에는 있음) |
| `timeoutSec` | 없음 | 없음 | 없음 | 디자인만 |

### 3-7. Settings Panel — I/O

| 필드 | UI | DB | Runner | 상태 |
|------|----|----|--------|------|
| `inputSource` (auto/merge/first/user) | 없음 | 없음 | 없음 | 디자인만 |
| `outputFormat` (text/markdown/json) | 없음 (`OutputSchemaTab` 의 format selector 로 일부 대체) | 없음 | 없음 | 디자인만 |
| `outputSchema` (JSON Schema Editor) | O | O (`guardrailsConfig.outputSchema`) | O | ✅ 동작중 (2026-04-27, deferred 모드 `_filter_last_assistant_message` + `validate_schema()` + `jsonschema==4.26.0`) |

### 3-8. Settings Panel — 가드레일 (GuardrailsTab)

| 필드 | UI | DB | Runner | 상태 |
|------|----|----|--------|------|
| `safetyLevel` (low/medium/high) | O | O | O | 동작중 |
| `blockedTopics` | O | O | O | 동작중 |
| `outputFilters` (keyword/regex/llm_check + action) | O | O | O | 동작중 |
| `piiDetection` | O | O | O | 동작중 |
| `jsonSchemaValidation` | O | O | O | ✅ 동작중 (2026-04-27, 3-7 참조) |
| `maxOutputLength` | O | O | 부분 | **부분구현** — LLM `max_tokens` 와 역할 분리 미실시 (Phase 7.13 잔여) |

### 3-9. Settings Panel — Handoff

✅ **방안 B 채택 — 탭 자체 disabled** (`AgentFlowSettingsPanel.tsx:39` `{ id: 'handoff', label: 'Handoff', disabled: true }`, 2026-05-11). 사용자가 7개 no-op 필드를 건드릴 수 없으므로 UI 노이즈로 노출되지 않음. Runner 구현은 다단 에이전트 graph 도입 시 함께 진행하는 것으로 종결.

| 필드 | UI | DB | Runner | 상태 |
|------|----|----|--------|------|
| `handoffCondition` | (탭 disabled) | O | X | UI 잠금 |
| `handoffTarget` | (탭 disabled) | O | X | UI 잠금 |
| `confidenceThreshold` | (탭 disabled) | O | X | UI 잠금 |
| `handoffExpr` | (탭 disabled) | O | X | UI 잠금 |
| `retry` | (탭 disabled) | O | X | UI 잠금 |
| `backoff` | (탭 disabled) | O | X | UI 잠금 |
| `fallback` | (탭 disabled) | O | X | UI 잠금 |

### 3-10. Reasoning Tab

| 필드 | UI | DB | Runner | 상태 |
|------|----|----|--------|------|
| `stepLimit` (→ `recursion_limit`) | O | O | O | 동작중 |
| `thinkingDepth` (1-5) | DisabledField | O | O (prompt 힌트) | ✅ D5 비활성 표시 적용 |
| `cotVisible` | DisabledField | O | X | ✅ D5 비활성 표시 적용 (`ReasoningTab.tsx:145-163`) — "현재 버전에서 지원되지 않습니다" |
| `parallelToolExecution` | DisabledField | O | O | ✅ D5 비활성 표시 적용 (Planning Tab) |
| `reactMaxIterations` | 제거 완료 | — | — | `stepLimit` 로 일원화 |

### 3-11. Planning Tab

| 필드 | UI | DB | Runner | 상태 |
|------|----|----|--------|------|
| `planningDepth` | DisabledField + "준비 중" 배지 | O | O (prompt 힌트) | ✅ D5 비활성 표시 |
| `orchestrationMode` (sequential/parallel/conditional) | DisabledField | O | X | ✅ D5 비활성 표시 (저장만) |
| `replanningTrigger` (never/on_failure/always) | DisabledField | O | X | ✅ D5 비활성 표시 |
| sub-agents spawning (`maxConcurrent`, `delegationStrategy`) | DisabledField | O | 부분 | ✅ D5 비활성 표시 |

### 3-12. Main Agent Modal

✅ **ARCHITECTURE 섹션 자체가 제거됨** (2026-05-12, `MainAgentModal.tsx`/`BasicTab.tsx`). 사용자가 모드를 고를 수 없고, Client 채팅 화면에서만 `react` ↔ `plan_execute` 토글 노출.

| 필드 | UI | DB | Runner | 상태 |
|------|----|----|--------|------|
| `name` | O | O | O | 동작중 |
| `description` (Scenario) | O | O | O | 동작중 |
| `architecture` (필드) | 선택 UI 제거 | O | O (react/plan_execute) | ✅ Client 채팅 토글로만 노출, `_todo_operating_rules_prompt(architecture)` 분기 |
| `modelId` (Brain Model) | O | O | O | 동작중 |

---

## 4. 화면 영역별 커버리지 요약 — 2026-05-14 갱신

| 화면 | 필드 수 | 동작중/완료 | 부분구현 | 미구현/대기 |
|------|--------|--------|---------|---------------|
| Debug Panel (메트릭) | 4 | 4 | 0 | 0 |
| Canvas 시각화 | 5 | 4 | 0 | 1 (Main 컨테이너) |
| Basic Tab | 4 | 4 | 0 | 0 |
| Prompt Tab | 2 | 1 | 1 (Jinja 일부) | 0 |
| Tools Tab / ToolPermissions | 3 | 2 | 0 | 1 (restricted.conditions) |
| Model Tab | 5 | 3 | 0 | 2 (topP/timeoutSec 디자인만) |
| I/O Tab | 3 | 1 | 0 | 2 (inputSource/outputFormat 디자인만) |
| Guardrails Tab | 6 | 5 | 1 (maxOutputLength) | 0 |
| Handoff Tab | 7 | 7 (탭 disabled) | 0 | 0 |
| Reasoning Tab | 5 | 5 (DisabledField 포함) | 0 | 0 |
| Planning Tab | 4 | 4 (DisabledField) | 0 | 0 |
| Main Agent Modal | 4 | 4 (architecture 선택 UI 제거) | 0 | 0 |
| **합계** | **52** | **44 (85%)** | **2 (4%)** | **6 (11%)** |

> 비교: 2026-04-22 → 27 동작중 / 11 부분 / 17 미구현. 한 사이클로 18 항목 폐쇄.

---

## 5. 권장 후속 작업 — 2026-05-14 갱신

§0-1 의 4 건 + 디렉토리 정리. 우선순위:

1. **P1: Main Agent 컨테이너 시각화** — `FlowCanvas.tsx` 에 dashed frame + "MAIN · {name}" 라벨 + running blue dot pulse
2. **P2: Tool Permissions `restricted.conditions` 인자 제한 래퍼** — `tool_wrapping.py:48` restricted 분기에 input 인자 검증 추가
3. **P3: Jinja 변수 `{{previous_output}}`/`{{kb_results}}`** — `prompt_resolver.py` 치환 맵 확장
4. **P3: `maxOutputLength` ↔ `max_tokens` 역할 분리** — 사후 절단 vs LLM 파라미터 경로 분리

---

## 6. 참고 — Claude Code 기능 레퍼런스 (점검 결과)

> AgentStudio가 구현/미구현 판단 시 비교 기준이 되는 "성숙한 에이전트 하네스"의 기능 커버리지.
> 2026-04-22 현재 세션에서 실제 도구 호출로 검증함.

### 6-1. 기능별 상태

| 기능 | Claude Code 상태 | 제공 메커니즘 | AgentStudio 대응 항목 |
|------|------------------|--------------|---------------------|
| **Human-in-the-loop** | ✅ 동작 | `AskUserQuestion` 도구 (1–4 질문, 2–4 선택지, multiSelect·preview 지원) + 위험 도구 호출 시 권한 prompt | Handoff Tab의 `manual` 조건, 도구 `requires_approval` 정책 |
| **Memory** | ✅ 인프라 준비 (저장된 메모리는 아직 없음) | `~/.claude/projects/-Users-leedaeyoung/memory/` + `MEMORY.md` 인덱스 + `CLAUDE.md` 영구 컨텍스트 | `memoryConfig` (short/long/episodic), `AgentMemory` 테이블 |
| **Async subagents** | ✅ 동작 | `Agent` 도구 + `run_in_background: true` → 완료 시 notification (테스트: 2.8초 완료) | Planning Tab의 `orchestrationMode=parallel`, `maxConcurrent` (현재 부분구현) |
| **Skill** | ✅ 동작 | `~/.claude/skills/` 및 `~/.claude/plugins/*/skills/` 의 `SKILL.md` → `/skill-name` 슬래시 커맨드로 노출 (14개+ 설치됨) | 미대응 — Builtin Tools와 개념 유사하나 프롬프트·워크플로우 패키지 단위의 재사용 메커니즘은 없음 |
| **Summarization** | ✅ 동작 (자동, 제어 불가) | 컨텍스트 한도 접근 시 이전 메시지 자동 압축. `/context`로 사용량 확인 | Reasoning/Planning Tab에 관련 필드 없음 — 장기 실행 에이전트의 컨텍스트 관리 미제공 |
| **Todo list** | ✅ 동작 | `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` 도구 (테스트: #1 생성·조회·삭제 확인) | Planning Tab의 sub-agent spawning과 유사하나 에이전트 내부 작업 트래킹 메커니즘은 없음 |
| **VFS (virtual file system)** | ❌ 미구현 | 실제 파일시스템만 사용 | deepagents 공식 스펙상 `backend=fs/store` 존재 — `src/modules/deep/` 에 아직 미반영 |

### 6-2. 검증 방법 (재현용)

- Todo: `TaskCreate({subject, description})` → `TaskList()` → `TaskUpdate({taskId, status:"deleted"})`
- Async subagent: `Agent({run_in_background: true, prompt: ...})` → 완료 알림 수신까지 대기
- Memory 디렉토리: `ls ~/.claude/projects/-Users-leedaeyoung/memory/`
- Skill 목록: 세션 system-reminder의 `# 유저 호출 가능한 스킬` 섹션 또는 `find ~/.claude/plugins -type d -name skills`
- AskUserQuestion: `ToolSearch select:AskUserQuestion`으로 스키마 로드 확인

### 6-3. AgentStudio 관점 시사점

1. **Memory 3계층 (short/long/episodic)** — Claude Code는 파일 기반 단일 구조로 단순화함. AgentStudio의 3계층 분리가 실 사용에서 복잡도 대비 효용이 있는지 검토 필요.
2. **Async subagents 완성도** — Claude Code는 `run_in_background` + 완료 이벤트로 명확. AgentStudio Planning Tab의 `maxConcurrent`/`delegationStrategy`가 현재 부분구현(3-11)이므로 Claude Code 패턴을 참고해 이벤트 모델 정립 가능.
3. **Skill 개념 도입 검토** — AgentStudio는 "프롬프트 + 도구 조합"을 에이전트 단위로만 패키징하는데, Claude Code의 Skill처럼 "재사용 가능한 프롬프트 번들"을 별도 계층으로 분리할지 결정 필요.
4. **Summarization 자동화** — 현재 AgentStudio에는 컨텍스트 압축 메커니즘이 설정에 없음. deepagents `context engineering` 기능 도입 시 검토 항목.
5. **VFS** — deepagents의 `backend=fs/store` 는 Claude Code조차 구현하지 않은 영역. 우선순위 낮음.

---

## 7. 화면 기준 남은 작업 요약 (2026-04-24 작성 / 2026-05-14 폐기 — §0 으로 대체)

> 이 섹션의 ①~⑩ 매핑은 2026-04-24 시점 스냅샷이다. 그 사이 대부분 항목이 닫혔으므로 **현행 잔여는 §0-1 의 4 건** 으로 갈음한다. 이력은 그대로 보존.

### 7-1. 에이전트 실행 화면 — 채팅 + Debug Panel

#### ① Debug Panel 상단 메트릭 카드 (토큰·비용)
- **현재**: `inputTokens / outputTokens / cost` 세 값이 **항상 0**. `latencyMs`만 정상.
- **원인**: Runner 가 WebSocket 이벤트에 LLM `usage_metadata` 를 넣지 않음.
- **할 일**: `agent.token` / `step.completed` payload 에 `{inputTokens, outputTokens, totalTokens}` 포함 → 프론트 누적. 모델별 단가표(`providers` 모듈)를 추가해 `cost` 자동 계산.
- **연결**: Phase 7.1, 7.2

#### ② Flow Canvas — 메인 에이전트 컨테이너 시각화
- **현재**: 메인 노드가 서브에이전트와 같은 평면에 찍혀 있어 계층감이 없음.
- **시안**: **점선 프레임 + "MAIN · {name}" 라벨 + 실행 중 파란 점 pulse**로 메인 에이전트가 전체 서브에이전트를 감싸는 "컨테이너"로 표현.
- **연결**: Phase 7.3

### 7-2. 에이전트 설정 Drawer

#### ③ Main Agent 모달 — Architecture 모드 (핵심, core-features §1 직접 대응)

| 모드 | UI | 실제 동작 |
|------|----|---------|
| **Deep Autonomous (ReAct)** | 선택 가능 | 유일하게 동작 |
| **Fast (tool_calling)** | 선택 가능 | 선택해도 ReAct 로 돌아감 — Runner 분기 미구현 |
| **Planning (plan_execute)** | 선택 가능 | **Plan-and-Execute 그래프 자체가 Runner 에 없음** (Planner → Executor → Replanner 노드 미구현). Planning 탭(⑩) 부분구현의 근본 원인. |
| **Expert (custom_graph)** | disabled | UI 에서 숨길지 유지할지 정책 결정만 남음 |

- **연결**: Phase 7.5, 7.6

#### ④ Prompt 탭 — Jinja 변수 확장
- **현재**: `{{user_input}}` 하나만 치환됨.
- **시안**: `{{previous_output}}`(이전 에이전트 결과), `{{current_time}}`, `{{kb_results}}`(지식베이스 검색).
- **영향**: Handoff 기반 다단 플로우(⑧)를 쓰려면 사실상 필수.
- **연결**: Phase 7.12

#### ⑤ Tools 탭 / Tool Permissions Panel — `restricted` 조건식
- **현재**: 권한 레벨 4종(자동/HITL/제한/차단) 중 **"제한(restricted)"만 `conditions` 필드 미적용**.
- **예시**: "`send_email` 도구는 `to` 필드가 `@company.com` 일 때만 자동 실행" 같은 인자 기반 조건 → UI·DB 는 있지만 Runner 가 읽지 않음.
- **할 일**: `tool_wrapping.py` 에 인자 검증 래퍼 추가.
- **연결**: Phase 7.9 (Phase 6.6 잔여)

#### ⑥ I/O 탭 — Output Schema (JSON Schema 에디터)
- **현재**: 저장은 되지만 **Runner 가 출력에 validate 하지 않음**. 스키마 어긋나도 그대로 응답으로 나감.
- **할 일**: `guardrails.py` 에 JSON schema validate 단계 + 실패 시 재시도/차단 루프.
- **연결**: Phase 7.7

#### ⑦ Guardrails 탭 — `maxOutputLength`
- **현재**: 응답 길이 제한값과 모델 탭의 `maxTokens` 역할이 겹쳐 보임.
- **할 일**: `maxTokens` = LLM 파라미터, `maxOutputLength` = 최종 응답 사후 절단 — 두 경로 분리 + 문서 명확화.
- **연결**: Phase 7.13

#### ⑧ Handoff 탭 — 전체 7개 필드가 **완전 no-op** ⚠️
화면에 필드는 다 있는데 Runner 가 하나도 안 읽음. "다단 에이전트 라우팅" 화면 전체가 허상:
- `handoffCondition` (on_complete / on_success / on_confidence / conditional / manual)
- `handoffTarget`
- `confidenceThreshold`
- `handoffExpr`
- `retry`
- `backoff` (none / linear / exponential)
- `fallback`

→ **처리 방향 결정 먼저**: (A) Runner 에 실제 구현, (B) D5 처럼 "현재 버전 미지원" 회색+툴팁.
- **연결**: Phase 7.4

#### ⑨ Reasoning 탭 — `cotVisible` 토글
- **현재**: 계획(D5)상 "비활성 표시"로 결정됐지만 UI 는 여전히 활성. `<thinking>` 파싱 자체는 이미 동작.
- **할 일**: 회색 처리 + "현재 버전에서 지원되지 않습니다" 툴팁.
- **연결**: Phase 7.8 (Phase 3.5 잔여)

#### ⑩ Planning 탭 — 저장만 되고 동작 없음 (③과 묶어서 처리)
- `orchestrationMode` (sequential / parallel / conditional) — 저장만
- `replanningTrigger` (never / on_failure / always) — no-op
- sub-agent spawning `maxConcurrent` / `delegationStrategy` — 부분구현
→ Plan-and-Execute 모드(③) 완성 시 함께 해소.
- **연결**: Phase 7.10, 7.11

### 7-3. 서브에이전트 회귀 검증 (전환 완료 마무리)

공식 `SubAgentMiddleware` 전환(Phase 8-2 구현 완료) 이후 **UI 기준 회귀 체크 4건** 잔여:
- **1단계 위임 회귀**: `task` 호출 시 서브에이전트 카드 점등, 중복 메시지 없음, 도구 호출 로그 표시 → Gmail 보조 에이전트 시나리오 재현. (Phase 8.13, 8.15)
- **2단계 중첩**: 서브 → 서브서브 호출 시 depth=2 노드와 parent 체인이 Canvas·Debug Panel 에 올바르게 표현. (Phase 8.14)
- **서브에이전트별 HITL**: 메인은 자동승인이어도 서브에만 걸린 `interrupt_on` 이 HITL 카드로 뜨고 resume 시 같은 컨텍스트로 재개. (Phase 8.16)
- **전체 회귀**: `pytest` + `pnpm lint` + Phase 6 주요 시나리오 한 번에. (Phase 8.18)

선택:
- (Phase 8.10) async 병렬 실행 system_prompt 가이드
- (Phase 8.17) 2개 sub-agent 병렬 `task` 이벤트 인터리빙

### 7-4. 기능 단위로 본 구현 상태 총평 — 2026-05-14 갱신

| 기능 | 현재 |
|------|------|
| ReAct | ✅ 동작중 |
| Plan-and-Execute | ✅ 동작중 (Client 채팅 토글, `_todo_operating_rules_prompt` 분기, plan_execute 전용 system prompt) |
| SubAgent | ✅ 동작중 (Gmail/Skills 운영, 회귀 체크리스트만 미마감) |
| Skills | ✅ 동작중 (sub-agent 까지) |
| Tools | ✅ 동작중 (⑤ restricted.conditions 조건식만 미완 — Phase 7.9) |
| HITL | ✅ 동작중 |
| Todo list | ✅ 동작중 (cancel rollback / monotonic forward / answer-based sweep 까지 보강) |

**결론**: 6대 기능 모두 운영 가능. 남은 작업은 시각화 1 건(Main 컨테이너) + 도구 권한 1 건(restricted.conditions) + 프롬프트 변수 2 건 + 길이 제한 정리 1 건 = 5 건이며 어느 것도 차단 이슈가 아님.

### 7-5. 작업 디렉토리 정리
- `__pycache__` 변경분 커밋 제외 처리 (`.gitignore` 확인)
- `packages/database/prisma/add-gpt5-models.ts` / `add-missing-models.ts` / `add-models.ts` 세 일회성 스크립트 → 커밋/삭제 여부 결정

### 7-6. 권장 순서

1. **7-3(서브에이전트 회귀) 먼저 마무리** — 이미 9할 끝난 전환을 닫아 기준선 확보.
2. **①, ②** 빠른 수확 (2~3일): 토큰·비용·Main 컨테이너.
3. **⑧ Handoff 방향 결정** — no-op 7개를 껴안고 갈지 숨길지 먼저 합의해야 ⑩ 계획이 선다.
4. **③ Plan-and-Execute 구현** — 가장 큰 덩어리. ⑩과 ④ 변수 확장이 자동으로 따라옴.
5. 잔여 정합성(⑤⑥⑦⑨).

### 7-7. 항목 ↔ Phase 매핑 요약

| 화면 항목 | Phase |
|-----------|-------|
| ① 토큰 집계 | 7.1 |
| ① 비용 계산 | 7.2 |
| ② Main 컨테이너 | 7.3 |
| ③ Fast / Planning Architecture | 7.5 |
| ③ Expert Architecture | 7.6 |
| ④ Jinja 변수 확장 | 7.12 |
| ⑤ 도구 조건식 | 7.9 (6.6) |
| ⑥ Output Schema 검증 | 7.7 |
| ⑦ maxOutputLength 분리 | 7.13 |
| ⑧ Handoff 7종 | 7.4 |
| ⑨ cotVisible 비활성 | 7.8 (3.5) |
| ⑩ Orchestration / Replanning | 7.10 / 7.11 |
| 7-3. 서브에이전트 회귀 | 8.13 ~ 8.18 |

---

## 8. 이력

| 날짜 | 갱신 내용 |
|------|----------|
| 2026-04-22 | 최초 작성. Phase 6 통합 검증 이후 잔여 갭 전수 조사 결과 반영 |
| 2026-04-22 | 섹션 6 추가 — Claude Code 기능 레퍼런스 (Human-in-the-loop, Memory, Async subagents, Skill, Summarization, Todo list, VFS) 실측 점검 결과 및 AgentStudio 대응 분석 |
| 2026-04-24 | 섹션 7 추가 — 화면 기준 남은 작업 요약 (10개 UI 항목 + 서브에이전트 회귀 + core-features 총평 + Phase 매핑표) |
| 2026-05-14 | §0 신설(남은 갭 4건) + Top 10·영역별 표·Coverage·권장 후속·§7-4 모두 2026-05-14 코드 기준 재정렬. 종료된 항목 17 → 6 (Main 컨테이너 / restricted.conditions / Jinja 변수 2종 / maxOutputLength 분리). Handoff·Architecture·Reasoning·Planning 의 no-op 항목은 UI(`DisabledField` 또는 탭 disabled 또는 옵션 제거)로 마감 |
