# Refactoring 설계: 자체 DeepAgent SDK → LangChain `deepagents` 공식 패키지

> 최초 작성: 2026-04 초
> 최종 갱신: 2026-05-14
> 진행 상태: **Phase 0 ~ 18 본체 완료** — 공식 `deepagents` 패키지로 일원화 / 자체 SDK 삭제 / 서브에이전트 미들웨어 / Agent 배포·외부 채팅 API / Client 앱(자격증명 관리) / Gmail 사용자 토큰 inject / 대시보드 파이프라인 / Skills 연결 / HITL 카드 / Stop / Thread Run 이력. 잔여는 Phase 7 일부(P1 컨테이너 시각화 등) + Phase 8 회귀 검증 + Phase 11 후속(idle logout 등). 상세는 [plan §0](./refactoring-deep-agent-plan.md#0-남은-작업-top-of-mind--2026-05-14-기준).
> 연결 문서: [작업 계획(plan)](./refactoring-deep-agent-plan.md) · [UI 구현 갭](./refactoring-deep-agent-ui-gaps.md)

---

## 1. 배경

현재 `packages/deepagent-sdk/`는 LangGraph 위에 직접 구현한 DeepAgent 스택이다.

| 항목 | 자체 SDK | 공식 `deepagents` |
|------|---------|------------------|
| 계획 수립 | `planner.decompose_task()` (LLM JSON 분해) | `write_todos` 내장 도구 (모델이 state 직접 편집) |
| 서브 에이전트 | `sub_agent_ids` + `_load_teammate_tools` 수동 위임 | `subagents=[...]` + `task` 도구 자동 위임 |
| 가상 파일시스템 | `builtin_tools/vfs_service.py` 별도 | `ls/read_file/write_file/edit_file` 기본 내장 |
| 시스템 프롬프트 | `prompt_resolver.resolve_system_prompt()` | Claude Code 스타일 상세 프롬프트 + `instructions` |
| 메모리 | MemoryManager (Redis STM + PG LTM + 요약) | LangGraph checkpointer 위임 (LTM 미제공) |
| 가드레일 | `InputGuardrail` / `OutputGuardrail` / `pii_detector` | **미제공** |
| 도구 권한 | `apply_policy` 4단계 | interrupt_before/after만 제공 |
| 추론 제한 | `StepLimitGuard` | `config.recursion_limit`으로 대체 |
| HITL resume | `Command(resume=...)` | 동일 (LangGraph 공통) |
| 유지비용 | 자체 구현 22파일 | 패키지 업스트림 의존 |

**리팩터링 목표**: 자체 SDK 유지비용 절감 + 표준 생태계 편입.  
공식 패키지가 다루지 않는 영역(장기 메모리, 가드레일/PII, 세밀한 도구 권한)은 **얇은 래퍼로 재배치**한다. 단순 "교체"가 아닌 **"분할·재조립"** 작업이다.

---

## 2. 공식 `deepagents` 핵심 개념

### `create_deep_agent()` API

```python
from deepagents import create_deep_agent

graph = create_deep_agent(
    tools=[...],               # LangChain 도구 리스트
    instructions="...",        # 시스템 프롬프트 추가분 (공식 상세 프롬프트에 append)
    subagents=[                # 서브 에이전트 정의 (선택)
        {"name": "...", "description": "...", "prompt": "...", "tools": [...]}
    ],
    model=BaseChatModel,       # langchain_core BaseChatModel (없으면 claude-sonnet 기본)
)
compiled = graph.compile(checkpointer=saver)  # LangGraph checkpointer 직접 주입
```

### 4대 핵심 컴포넌트

1. **Planning tool** (`write_todos`) — 실행 도구가 아닌 계획 도구. 모델이 `state["todos"]`에 할 일 목록을 기록하면 그래프가 진행.
2. **Sub-agents** — `task` 도구로 컨텍스트 격리된 자식 에이전트 실행. `subagents` 리스트로 선언.
3. **Virtual File System** — `state["files"]` dict 기반의 `ls/read_file/write_file/edit_file` 내장 도구.
4. **Detailed system prompt** — Claude Code 스타일의 긴 표준 프롬프트가 자동 주입되고, `instructions`가 그 뒤에 append된다.

### 스트림 state 구조

```python
{"messages": [...], "todos": [...], "files": {...}}
```

---

## 3. 기능 맵핑 표

| 자체 SDK 기능 | 공식 `deepagents` 제공 여부 | 전환 후 처리 방식 |
|--------------|--------------------------|----------------|
| `DeepAgent.stream()` | `compiled.astream()` | bridge rewrite |
| `planner.decompose_task()` → `plan.created` | `write_todos` (state diff) | 이벤트 어댑터 재작성 |
| `sub_agent_ids` 위임 | `subagents` + `task` 자동 | `_delegate` 경로 단순화 |
| `builtin_tools/vfs_service.py` | `ls/read_file/...` 내장 | 통합 또는 대체 |
| `resolve_system_prompt()` | `instructions` append | 변수 치환 선행 후 넘김 |
| Redis STM | **미제공** (checkpointer만) | MemoryManager 외부 래퍼로 유지 |
| PG LTM + summarizer | **미제공** | 자체 유지 |
| `InputGuardrail.check()` | **미제공** | `agents_service.stream` 진입 시 사전 필터 |
| `OutputGuardrail` + PII | **미제공** | 이벤트 어댑터 출력단 후처리 |
| `apply_policy` 4단계 | interrupt 단일 축 | `requires_approval` → interrupt, `restricted/disabled` → 도구 래핑 |
| `StepLimitGuard` | **미제공** | `recursion_limit` 매핑 |
| `Command(resume=...)` | 동일 (LangGraph) | 경로 교체만 |
| 이벤트 스킴 | LangGraph stream_mode | 어댑터 레이어 유지 |

---

## 4. 기능적으로 변경되는 부분

### 4-1. 진입점 교체

**현재**: `DeepAgent(config, tools).stream(thread_id, message)`  
**변경 후**: `create_deep_agent(tools, instructions, subagents, model).compile(checkpointer).astream(...)`

- `deepagent_bridge.py` 전면 rewrite 필요.
- `DeepAgentConfig` 매핑 로직 → `instructions` 문자열 + `subagents` 리스트 + `model` 인스턴스로 단순화.

### 4-2. 계획 수립 방식

**현재**: `planner.decompose_task()` → LLM이 JSON 배열 반환 → `plan.created` 이벤트 발행  
**변경 후**: `write_todos` 내장 도구 → `state["todos"]` 갱신 → `updates` stream에서 todos diff 감지

- `plan.created` 이벤트를 생성하는 어댑터가 todos 변경을 감지해서 변환해야 함.
- 프론트엔드 `plan` 패널은 기존 `plan.created` 이벤트를 그대로 소비하도록 유지.

### 4-3. 서브 에이전트 위임

**현재**: `agents_service._delegate` → `_load_teammate_tools` → 수동 langgraph 실행  
**변경 후**: `subagents=[...]` 선언 → `task` 도구로 공식 위임 자동 처리

- `teams_service` / `agents_service._delegate` 경로 단순화 또는 제거 가능.
- sub_agent_ids DB 필드 → 에이전트 로드 시 `subagents` 목록으로 변환.

### 4-4. 가상 파일시스템 충돌

**현재**: `builtin_tools/vfs_service.py` (별도 구현)  
**변경 후**: 공식 `ls/read_file/write_file/edit_file` 내장 도구 (`state["files"]` 저장)

- 두 구현이 충돌. **결정 필요**: 공식 VFS로 대체하거나, 자체 VFS를 tools 리스트에 직접 넘기고 공식 내장 VFS는 비활성화.

### 4-5. 시스템 프롬프트

**현재**: `prompt_resolver.resolve_system_prompt()` → DeepAgent에 직접 주입  
**변경 후**: `prompt_resolver`로 변수 치환 후 → `instructions` 파라미터로 넘김

- 공식 상세 프롬프트 위에 append되므로 프롬프트 충돌 여부 확인 필요.

### 4-6. 메모리

**현재**: `MemoryManager` — `get_context()` / `add_messages()` / `store_episodic()`  
**변경 후**: checkpointer(단기) + 자체 LTM 래퍼 유지

- `MemoryManager`를 그래프 **외부**에서 호출하는 서비스 레이어로 분리.
  - 그래프 실행 전: `get_context()` → `instructions`에 컨텍스트 주입
  - 그래프 실행 후: `add_messages()` / `store_episodic()` 후처리

### 4-7. 가드레일 / PII

**현재**: 그래프 내부에서 `InputGuardrail` / `OutputGuardrail` / `redact_pii`  
**변경 후**: 그래프 외부로 이동

- **입력 가드레일**: `agents_service.stream` 진입 시점에 `InputGuardrail.check()` 호출. 차단이면 `error` 이벤트 발행 후 즉시 반환.
- **출력 가드레일/PII**: 이벤트 어댑터의 `token` 출력 단계에서 `OutputGuardrail.filter` + `redact_pii` 적용.

### 4-8. 도구 권한 정책

**현재**: `apply_policy(auto/requires_approval/restricted/disabled)`  
**변경 후**:

| 기존 정책 | 전환 방식 |
|---------|---------|
| `auto` | 그대로 도구 리스트에 포함 |
| `requires_approval` | `interrupt_before=["tool_name"]` 로 LangGraph interrupt 설정 |
| `restricted` | 도구 입력 인자를 제한하는 래퍼 함수로 wrapping 후 포함 |
| `disabled` | 도구 리스트에서 제외 |

### 4-9. 추론 제한 (StepLimitGuard)

**현재**: `StepLimitGuard(limit)` — stream 루프에서 step 카운트 강제  
**변경 후**: `compiled.astream(..., config={"recursion_limit": step_limit})`

- 의미는 다르지만(node 실행 횟수 vs step 횟수) 실용적으로 동치. UI의 `reasoningConfig.stepLimit` 값을 `recursion_limit`으로 매핑.

### 4-10. 이벤트 스트림 어댑터

**현재 이벤트**: `token / plan.created / step.update / reasoning / run.completed / error`  
**LangGraph stream 원천**: `stream_mode=["updates", "messages"]`

`deepagent_bridge.py`에 어댑터 레이어 유지:
- `messages` 청크 → `token` 이벤트
- `updates.todos` diff → `plan.created` 이벤트
- `updates.tool_calls` / `updates.messages(ToolMessage)` → `step.update` 이벤트
- `<thinking>` 블록 (`_parse_thinking_stream`) → `reasoning` 이벤트
- 스트림 종료 → `run.completed` 이벤트

---

## 5. 고려사항 / 리스크

### 5-1. 이벤트 호환성 (최우선)

프론트엔드는 `agent.streaming / step.progress / run.completed` WebSocket 이벤트를 이미 소비 중이다. `deepagent_bridge`의 이벤트 어댑터가 깨지면 UI 전체에 영향을 준다. **이벤트 포맷을 기존과 동일하게 유지하는 것이 필수 조건이다.**

### 5-2. `_parse_thinking_stream` 보존

`<thinking>` 블록 분리는 DeepAgent 경로와 독립적인 레이어다. 공식 패키지로 교체해도 계속 유지.

### 5-3. 도구 권한 정책의 축 소실

`restricted`(인자 제한)와 `disabled`는 공식에 직접 대응물 없음. 도구 래퍼 패턴으로 `tools` 리스트에 넣기 전에 적용.

### 5-4. 가드레일/PII 위치 이동

공식 패키지는 그래프 중간 단계 개입이 제한적. 그래프 **외부**로 책임 이동:
- 입력 → `agents_service` 레벨 사전 필터
- 출력 → 이벤트 어댑터 후처리

### 5-5. 장기 메모리 자체 유지 필수

공식 패키지는 cross-thread 장기 기억 미제공. `MemoryManager.get_context()` / `store_episodic()`를 **그래프 전/후에 감싸는 서비스 레이어**로 반드시 유지해야 함.

### 5-6. VFS 충돌 결정 필요

공식이 제공하는 `ls/read_file/...`와 `builtin_tools/vfs_service.py`가 중복됨. 둘 중 하나를 선택하고 state 저장 방식(DB vs state["files"])을 통일해야 함.

### 5-7. JSON 4종 설정 스키마 재정의

`memoryConfig / guardrailsConfig / reasoningConfig / planningConfig` 필드 구조는 유지하되, 공식 패키지에 대응물 없는 일부 필드 처리 결정:

| 필드 | 공식 대응 | 처리 방식 |
|------|---------|---------|
| `cotVisible` | 없음 | `_parse_thinking_stream` 여전히 적용 — 유지 |
| `parallelToolExecution` | 없음 | no-op 처리 (공식에서 LangGraph가 자동 처리) |
| `planningDepth` | 없음 | no-op 또는 제거 |
| `stepLimit` | `recursion_limit` | 매핑 |

### 5-8. Prisma `toolPermissions` 필드 부재

`Agent` 모델에 `toolPermissions` 필드가 없어 tool_policies가 DB에서 주입되지 않음. 이번 리팩터링 기회에 `toolPermissions Json?` 추가 권장 (별도 마이그레이션 승인 필요).

### 5-9. 의존성 변화

- `apps/agent-runner-py/pyproject.toml`: `deepagents` 추가, `deepagent-sdk` path source 제거
- `langgraph>=0.2.50` 버전 호환 여부 확인 (공식 패키지 요구 버전 점검)

### 5-10. 분기 전략 재설계

현재 `_should_use_deepagent()` 분기는 memory/guardrails/reasoning 3축 조건으로 DeepAgent 사용 여부를 결정한다. 공식 패키지 도입 후 **권장 방식**: deepagents 그래프로 **전면 일원화**. planning/subagents 미사용 에이전트는 `subagents=[]` + instructions만 넘기면 일반 ReAct처럼 동작한다.

### 5-11. Checkpointer 공유

기존 `AsyncPostgresSaver`(`checkpoint_service.get_saver`)를 `create_deep_agent(...).compile(checkpointer=saver)`에 재사용 → 스레드 연속성 유지 가능. 별도 checkpointer 생성 불필요.

---

## 6. 파일 단위 영향 범위

### 삭제/아카이브

- `packages/deepagent-sdk/` 전체 (22 파일)
  - 단, 가드레일/메모리/권한 모듈은 `apps/agent-runner-py/src/modules/deep/`으로 **이관 후 삭제**

### 전면 rewrite

- `apps/agent-runner-py/src/modules/agents/deepagent_bridge.py`
  - 공식 `create_deep_agent` 호출 + 이벤트 어댑터 + 가드레일 후처리

### 수정

- `apps/agent-runner-py/src/modules/agents/agents_service.py` — `_should_use_deepagent` 제거, import 교체
- `apps/agent-runner-py/pyproject.toml` — `deepagents` 추가, path source 제거
- `apps/agent-runner-py/src/modules/langgraph/prompt_resolver.py` — `instructions` 전단 처리 유지
- `apps/agent-runner-py/src/modules/builtin_tools/vfs_service.py` — 공식 VFS와 통합 결정

### 신설

- `apps/agent-runner-py/src/modules/deep/guardrails.py` — 입출력 가드레일 + PII 래퍼
- `apps/agent-runner-py/src/modules/deep/memory.py` — STM/LTM 래퍼 (MemoryManager 이관)
- `apps/agent-runner-py/src/modules/deep/tool_wrapping.py` — 도구 권한 정책 래퍼

### 최소 변경

- `packages/database/prisma/schema.prisma` — `Agent.toolPermissions Json?` 선택적 추가
- `apps/agent-web/src/components/agents/builder/` — TS 타입 유지, no-op 필드 문서화

---

## 7. 단계적 전환 순서

1. **이 문서 확정** — 팀과 접근법 합의.
2. **가드레일/메모리/도구권한 분리** — `packages/deepagent-sdk/` → `apps/agent-runner-py/src/modules/deep/`으로 이관. 공식 패키지 도입 전에 독립적으로 실행 가능.
3. **`deepagents` 의존성 추가** + `deepagent_bridge.py` 내부를 공식 API로 교체. 이벤트 어댑터 작성.
4. **이벤트 어댑터 통과 테스트** — 기존 UI가 깨지지 않는지 검증.
5. **`_should_use_deepagent` 분기 제거** → deepagents 그래프로 일원화.
6. **`packages/deepagent-sdk/` 삭제** + `pyproject.toml` 정리.
7. (선택) **Prisma 마이그레이션** — `toolPermissions` 필드 추가.

---

## 8. 검증 방법

### 단위 테스트

```bash
cd apps/agent-runner-py
pytest tests/ -v
```

- 이벤트 어댑터: LangGraph stream mock → `token/plan.created/step.update/run.completed` 올바른 포맷 확인
- 가드레일 래퍼: 차단 토픽 입력 → `error` 이벤트, PII 입력 → redact 확인
- 도구 권한 래퍼: `disabled` 도구 호출 시 PermissionError, `requires_approval` 시 interrupt 발생

### 통합 테스트 1 — 채팅 스트리밍

에이전트 chat 페이지(`/agents/[agentId]/chat`)에서 메시지 전송 → DevTools WebSocket 탭에서 `agent.streaming / step.progress / run.completed` 이벤트가 기존 포맷대로 수신되는지 확인.

### 통합 테스트 2 — HITL

`requires_approval` 도구를 가진 에이전트 실행 → interrupt 발생 → `Command(resume=...)` 응답 후 재개. 재개 메시지가 UI에 도달하는지 확인.

### 통합 테스트 3 — 서브 에이전트

`subagents` 설정된 에이전트 실행 → `task` 도구 호출 로그가 `step.progress` 이벤트로 올라오는지 확인.

### 통합 테스트 4 — 장기 메모리

동일 thread_id로 두 번째 대화 시작 → `MemoryManager.get_context()`가 이전 세션 컨텍스트를 `instructions`에 주입하는지 로그 확인.

### 회귀 테스트

```bash
pnpm lint          # TypeScript 전체
pytest             # Python 전체
```

기존 workflow runs (`/workflows/[workflowId]/runs`)가 정상 조회되는지 확인 (langgraph_service 경로 무결성).

---

## 9. 현재 상태 (2026-05-14)

이 문서는 **자체 SDK → 공식 패키지 전환** 의 설계 근거를 보존한다. 전환 자체(Phase 0~6)는 이미 완료됐고, 그 위에 운영 기능(Phase 7~18) 이 누적된 상태다. 화면·런타임 단위 잔여 작업은 [작업 계획 §0](./refactoring-deep-agent-plan.md#0-남은-작업-top-of-mind--2026-05-14-기준) 과 [UI 구현 갭 §0](./refactoring-deep-agent-ui-gaps.md) 에서 추적한다.

### 9-1. 실제 반영된 아키텍처

- 모든 에이전트 실행이 `deepagent_bridge.create_deep_agent()` 경로로 일원화 (`agents_service._should_use_deepagent` 제거).
- `apps/agent-runner-py/src/modules/deep/{guardrails,memory,tool_wrapping,models}.py` 신설 — 자체 SDK 에서 이관된 얇은 래퍼.
- `packages/deepagent-sdk/` 삭제 완료 (22 파일).
- `Agent.toolPermissions Json?` 필드 추가 및 UI `ToolPermissionsPanel` 연결.
- `Agent.skillIds: String[]` 추가, deepagents 공식 `skills=` + `CompositeBackend(routes={"/skills/": StoreBackend(...)})` 경로 사용. sub-agent 에도 동일 적용.
- 서브에이전트 위임은 공식 `subagents=[...]` + `task` 내장 도구 + per-subagent `interrupt_on` (Phase 8 — Q3 기존 `_delegate` 구조 폐기).
- VFS 내장 도구는 `permissions=[]` 로 현재 비활성 (재활성화 조건은 plan Backlog 참조).
- WebSocket 이벤트 포맷 (`agent.streaming / step.progress / run.completed / agent.token / agent.reasoning / step.started / step.completed / step.failed / turn.completed / run.cancelled / hitl.request`) 유지.
- 이벤트 어댑터는 `astream_events` v2 기반 (`_pump_astream_events`), `turn.completed` 폴백 포함, sub-agent 의 `on_tool_start name=task` payload 에서 `subagent_type` 추출.
- 외부 채팅용 `external_event_adapter.py` 가 동일 sio 인스턴스의 별도 namespace `/v1/chat` 로 정제 emit (depth=0 token 만, reasoning drop, cost 제외).
- 채팅 stop: runner `cancel_registry` + `_revert_in_progress_todos_on_cancel` 로 turn 단위 todos rollback.

### 9-2. Runner 가 활용하는 신규 데이터 경로

| 경로 | 주체 | 비고 |
|------|------|------|
| `usage_metadata` 누적 | `_pump_astream_events` | `run.completed.data.usage = {inputTokens, outputTokens, totalTokens, totalCost, modelId}` |
| 비용 계산 | `runs/pricing.py` | OpenAI/Anthropic/Google 단가 + provider prefix(`openai:gpt-4o`) 정규화 |
| Run 영속화 | `runs/runs_writer.record_run()` | `workflow_runs` 1행 + `step_traces` N행. `thread_id/step_id/parent_step_id/depth/model_id` 포함 |
| 사용자 자격증명 inject | NestJS `threads.service.collectUserCredentials` → runner `_resolve_provider_key` | `provider:{slug}` 우선, DB fallback 제거(2026-05-13). 누락 시 `chat.error type=credential_missing` |
| Gmail 사용자 토큰 | `tools.service.ts::tryIssueUserGmailAccessToken` + Gmail 도구 빌더 `?userId=` 쿼리 | 사용자별 `UserCredential(kind=tool, targetId=gmail, label=oauth-app)` 우선, admin Project 토큰 fallback |
| Skills 동기화 | `_sync_skills_for_run` + `_make_skills_backend(store=...)` | 명시적 store 주입(contextvars 의존 제거), 키 prefix `/{agent_id}/{skill}` (`/skills/` 는 CompositeBackend 가 처리) |
| Sub-agent skill 본문 직접 주입 | `_inject_skill_contents_to_specs` | progressive disclosure 한계 우회. systemPrompt 에 SKILL.md 내용을 `[필수 스킬 지시사항 — 반드시 준수]` 로 append |

### 9-3. 신규 / 확장된 도메인 모델

- `AgentDeployment` (project/agent/env/version/status/publicPath/snapshot) — Phase 9-1. `publicPath` 는 UNIQUE 에서 INDEX 로 전환(2026-05-09) — 동일 publicPath 가 여러 row 에 출현 가능.
- `ApiKey.agentDeploymentId`, `Thread.agentDeploymentId` 컬럼 — 외부 키 ↔ deployment 1:N.
- `UserCredential` (userId/kind/targetId/label/valueEnc/metadata/status/lastVerifiedAt) — Phase 10-3. AES-256-GCM, label 기반 multi-account.
- `WorkflowRun.threadId/agentId/projectId/latencyMs/modelId` + `StepTrace.stepId/parentStepId/depth` — Phase 13/17.

### 9-4. 확인된 잔여 갭 (UI 구현 갭 문서로 이관)

세부 항목은 [refactoring-deep-agent-ui-gaps.md §0](./refactoring-deep-agent-ui-gaps.md) 참조. 핵심 4 건:

1. **Main Agent 컨테이너 시각화** — dashed frame + "MAIN · {name}" + running blue dot pulse 미구현 (Phase 7.3).
2. **Tool Permissions `restricted.conditions` 인자 제한 래퍼** — `tool_wrapping.py` 의 restricted 가 메시지 반환만 (Phase 7.9).
3. **Jinja 변수 `{{previous_output}}`/`{{kb_results}}` 미구현** — `{{current_time}}/{{current_timezone}}/{{plan.mode}}/{{guardrails.max_output_length}}` 만 치환 (Phase 7.12).
4. **`maxOutputLength` ↔ `max_tokens` 역할 분리** — 사후 절단 / LLM 파라미터 경로 분리 (Phase 7.13).

이 외 Handoff 7 필드 / Architecture custom_graph / Reasoning cotVisible-thinkingDepth / Planning orchestrationMode·replanningTrigger 는 **방안 B (D5 비활성 표시 / 옵션 자체 제거)** 로 닫힘 — UI 에서 사용자가 그 영역을 건드릴 수 없으므로 Runner 미사용 상태가 노이즈로 노출되지 않음.

### 9-5. 새 규칙 (AGENTS.md 반영됨)

- `src/modules/deep/*`, `deepagent_bridge`, 서브에이전트·메모리·가드레일·도구권한·HITL 관련 코드 수정 시 **Context7** (`/websites/langchain_oss_python_deepagents` 또는 `/langchain-ai/deepagents`) 또는 `https://docs.langchain.com/oss/python/deepagents/<subpath>` 의 공식 문서를 **먼저 조회한 뒤** 구현. 추측 기반 구현 금지 (commit `4a1271a`).
- 새 브랜치는 사용자의 명시적 지시가 있을 때만 생성. `git checkout -b`/`git switch -c`/`git branch <name>` 임의 실행 금지 (commit Reinforced Rules Log 2026-04-23).
- 모든 작업 착수 전 `작업일지.md` 에 작업 내용·목표·완료 결과·변경 파일·특이사항을 기록 (Reinforced Rules Log 2026-04-23).
