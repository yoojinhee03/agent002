# 핵심 기능 (Core Features)

> AgentStudio가 제공하는 6대 핵심 기능을 정의한다.
> 각 항목은 **사용자가 UI에서 접하는 기능**과 **Runner(apps/agent-runner-py) 내부 동작**의 두 관점에서 기술한다.

| # | 기능 | UI 노출 | 책임 레이어 |
|---|------|---------|-------------|
| 1 | 에이전트 모드 (ReAct / Plan-and-Execute) | 간접 (ArchitectureTab) | Runner |
| 2 | SubAgent | O | Runner + Web |
| 3 | Skills | O | Web + API + Runner |
| 4 | Tools | O | Web + API + Runner |
| 5 | Human-in-the-loop (HITL) | O | Web + Runner |
| 6 | Todo list | O | Runner → Web (이벤트 스트림) |

---

## 1. 에이전트 모드 (Agent Mode)

에이전트가 과제를 풀어나가는 **실행 전략**. 현재 두 가지 모드를 공식 지원한다.

> 출처: LangChain 공식 블로그 "Plan-and-Execute Agents" (2024-02-13), LangGraph 공식 문서 (`docs.langchain.com/oss/python/langgraph/`)

### 1-1. ReAct (Reasoning + Action)

**정의.** "생각(Thought) → 행동(Action) → 관찰(Observation)" 루프를 LLM이 **매 스텝마다** 반복하며 단일 LLM이 모든 결정을 즉흥적으로 내리는 패턴. Yao et al. (2022) 논문에서 제안, LangGraph `create_react_agent` prebuilt로 표준화되어 있다.

**흐름.**
```
Thought: 주가를 찾으려면 검색이 필요
  → Action: Search("AAPL price")
  → Observation: $189.50
Thought: 이제 답변 가능
  → 최종 답변
```

**장점.**
- 관찰 결과에 기반한 **즉시 경로 조정** 가능 → 탐색·에러 복구에 강함
- 그래프 구조가 단순 (`agent` ↔ `tools` 2-node 루프)

**한계.**
- 툴 호출마다 LLM 호출 필요 → **지연·비용 높음**
- 한 번에 한 하위문제만 보기 때문에 **전역 최적화 어려움**

**프로젝트 매핑.** `Agent.architecture = "react"` (Deep Autonomous). 현재 Runner에서 유일하게 완전 동작하는 경로. deepagents 패키지의 기본 에이전트 루프도 본질적으로 ReAct.

### 1-2. Plan-and-Execute

**정의.** 계획 단계와 실행 단계를 분리하여, 무거운 Planner LLM이 다단계 계획을 한 번에 세우고 가벼운 Executor가 단계별로 실행하는 패턴. Wang et al. (2023). LangChain 공식 블로그가 "ReAct의 개선형"으로 제시.

**구성.**
- **Planner** — "prompts an LLM to generate a multi-step plan to complete a large task"
- **Executor(s)** — "accept the user query and a step in the plan and invoke 1 or more tools"
- **Replanner** — 실행 결과를 보고 종료·재계획 판단

**흐름.**
```
Planner:  [1. 검색 → 2. 정리 → 3. 요약]
Executor: (1 실행) → (2 실행) → (3 실행)
Replanner: 완료? → 종료
```

**장점.**
- 툴 호출마다 무거운 Planner를 부르지 않아 **ReAct 대비 비용·지연 감소**
- Executor에 소형·저가 모델 투입 가능
- 복잡한 멀티스텝에서 **전역 계획 품질 향상**

**한계.**
- 초기 계획이 굳어져 **동적 적응 약함** (Replanner로 부분 완화)
- 여전히 **순차 실행**, 병렬화 여지 미사용

**프로젝트 매핑.** `Agent.architecture = "plan_execute"` (Planning). **현재 UI·DB 저장만 가능, Runner 분기 미구현** — `refactoring-deep-agent-plan.md:218` Phase 7.5에서 구현 대기.

### 1-3. 향후 확장 후보

> 공식 LangChain 블로그에서 Plan-and-Execute의 후속 개선형으로 제시됨. 필요 시 `architecture` 필드 확장으로 도입 가능.

- **ReWOO (Reasoning WithOut Observations)** — 변수 치환(`#E1`, `#E2`)으로 재계획을 제거, Planner 호출 추가 감소.
- **LLMCompiler** — 계획을 DAG로 스트리밍하고 **병렬 실행**, 원저 논문 기준 3.6x 스피드업.

---

## 2. SubAgent (UI)

**정의.** 메인 에이전트가 특정 하위 작업을 **전담 에이전트(subagent)에게 위임**하여 독립된 컨텍스트·도구·모델로 수행하게 하는 기능. 오케스트레이터-워커 패턴의 공식 구현.

**기반.** deepagents 공식 패키지의 `SubAgentMiddleware` + `task` 도구 (`docs.langchain.com/oss/python/deepagents/subagents`).

### UI
- **AgentSettingsDrawer → SubAgents 탭**
- 서브에이전트 목록 편집 (name / description / system_prompt / tools / model / interrupt_on)
- 메인 에이전트는 자동 제공되는 `task` 툴로 서브에이전트를 호출
- 실행 중 이벤트 스트림에 `subagent.started` / `subagent.completed` 표시

### 런타임 동작
- `apps/agent-runner-py/src/modules/agents/deepagent_bridge.py` 가 DB의 `subagents` JSON을 읽어 `create_deep_agent(..., subagents=[...])` 에 넘김
- 각 subagent는 **독립된 메시지 히스토리**로 격리 실행 → 메인 컨텍스트 오염 방지
- subagent별 모델·도구·HITL 정책 독립 설정 가능 (`Subagent Model Selection by Task` 패턴)

### 활용 시나리오
- 리서치 과제: `data-collector` / `data-analyzer` / `report-writer` 분리
- 장문·수치·코드 등 **특성이 다른 과제**에 맞춤 모델 할당 (예: 긴 컨텍스트용 Sonnet, 수치용 GPT-5)

---

## 3. Skills (UI)

**정의.** 에이전트에게 **재사용 가능한 행동 지침 묶음**을 장착하는 기능. 프롬프트 조각 + (선택적) 예제 + 전용 도구를 하나의 "Skill"로 패키징해 여러 에이전트에서 공유한다.

### UI
- **Skills 관리 페이지** — Skill CRUD, 버전 관리
- **AgentSettingsDrawer → Skills 탭** — 에이전트별 활성 Skill 선택
- Skill은 system_prompt에 **합성 주입**되며, 포함된 도구는 자동으로 `tools` 배열에 병합됨

### 런타임 동작
- API 계층(`apps/api`)에서 Skill 메타데이터 관리
- Runner가 에이전트 로딩 시 활성 Skill 목록을 조회 → instructions와 tools를 병합해 `create_deep_agent(instructions=..., tools=[...])` 로 전달
- Skill 단위로 on/off 가능 → 에이전트 변경 없이 능력 추가·제거

### 특징
- **재사용성** — 동일 Skill을 여러 에이전트·팀에 장착
- **버전 관리** — Skill 변경이 버전업되며 기존 에이전트는 핀된 버전을 유지
- **조합성** — 여러 Skill을 동시 장착, 지침 충돌은 우선순위로 해결

---

## 4. Tools (UI)

**정의.** 에이전트가 외부 세계와 상호작용하기 위해 호출하는 **함수 단위 능력**. HTTP API 호출, 코드 실행, 검색, 내부 데이터 조회 등.

### UI
- **Tools 관리 페이지** — Tool CRUD (HTTP / Code / Search / MCP / Built-in)
- **AgentSettingsDrawer → Tools 탭** — 에이전트별 활성 Tool 선택, **도구별 권한 정책**(자동 승인 / HITL 필요 / 차단) 설정
- 실행 중 이벤트 스트림에 `tool.called` / `tool.completed` / `tool.failed` 표시

### 유형
| 유형 | 설명 | 구현 위치 |
|------|------|-----------|
| **HTTP** | REST API 호출 (인증·헤더·쿼리 설정) | API 메타데이터 + Runner 실행 |
| **Code** | 샌드박스 코드 실행 (Python) | Runner `builtin_tools/code` |
| **Search** | 웹 검색 (Tavily 등) | Runner `builtin_tools/search` |
| **MCP** | Model Context Protocol 서버 연동 | Runner `mcp` 모듈 |
| **Built-in** | 내장 툴 (파일시스템, `write_todos` 등) | deepagents 패키지 기본 제공 |

### 런타임 동작
- API가 Tool 메타를 관리, Runner가 실행 시점에 도구 함수를 **동적 구성**
- `src/modules/deep/tool_wrapping.py` 가 권한 정책·HITL 트리거를 감싸는 래퍼 적용
- 서브에이전트에게는 **허용된 도구 부분집합**만 전달 가능

---

## 5. Human-in-the-loop (HITL) (UI)

**정의.** 에이전트 실행 중 특정 행동(도구 호출·응답 등) **직전에 사용자 승인을 요구**하거나 사용자 수정을 받는 기능. 자율성과 안전성의 균형점.

**기반.** deepagents `interrupt_on` 파라미터 (`docs.langchain.com/oss/python/deepagents/human-in-the-loop`) + LangGraph `interrupt` 메커니즘.

### UI
- **AgentSettingsDrawer → HITL 탭** — 도구별 interrupt 정책 편집
- 실행 화면 **HITL 카드** — 중단 이벤트 발생 시 사용자에게 다음 옵션 제시:
  - **Approve (승인)** — 그대로 실행
  - **Edit (수정)** — 인자 편집 후 실행
  - **Reject + feedback (거부)** — 사유를 LLM에 되돌려 보내 다른 경로 유도
- 이벤트: `hitl.requested` → `hitl.resolved`

### 런타임 동작
- `src/modules/hitl/hitl_gateway.py` 가 interrupt 이벤트를 WebSocket으로 emit
- 사용자 응답을 받으면 Runner가 `Command(resume=...)` 로 그래프 재개
- **서브에이전트별 독립 정책** 지원 — 메인은 자동 승인이어도 서브에이전트는 확인 요구 가능 (deepagents 공식 패턴)

### 활용 시나리오
- 파일 삭제·결제·외부 전송 등 **되돌릴 수 없는 작업**
- 초기 프롬프트 품질 검증을 위한 **런타임 감독**
- 에이전트 출력 **최종 검수 게이트**

---

## 6. Todo list (UI)

**정의.** 에이전트가 복잡한 과제를 **여러 단계로 분해**하고 각 단계의 진행 상태(대기 / 진행중 / 완료)를 실시간으로 추적·표시하는 기능. 사용자는 에이전트의 **계획과 진척**을 투명하게 확인한다.

**기반.** deepagents `TodoListMiddleware` + `write_todos` 도구 (`docs.langchain.com/oss/python/deepagents/middleware`). 공식 문서 인용:

> "Deep agents include a built-in `write_todos` tool that enables agents to break down complex tasks into discrete steps, track progress, and adapt plans as new information emerges."

### UI
- **채팅 화면 Todo 패널** — 현재 계획(step 목록)과 각 step 상태 배지 표시
- 실행 중 에이전트가 `write_todos` 호출 → UI가 즉시 갱신
- 완료 항목은 체크 표시, 실패 항목은 사유와 함께 노출

### 런타임 동작
- Runner가 `write_todos` 호출을 가로채 **TodoStep 포맷**으로 변환 후 `plan.created` / `step.progress` 이벤트 emit
- `apps/agent-web`의 Zustand run 스토어가 이벤트를 받아 Todo 패널 상태 업데이트
- `refactoring-deep-agent-plan.md` 참조 — `plan.created` 이벤트가 TodoStep 포맷으로 통일됨

### 특징
- **투명성** — 에이전트의 추론 과정이 사용자에게 노출
- **적응성** — 새 정보가 들어오면 에이전트가 Todo를 재작성 (`adapt plans as new information emerges`)
- **Plan-and-Execute 아키텍처와 자연스러운 결합** — Planner가 만드는 다단계 계획을 Todo로 시각화

---

## 기능 간 상호작용

```
                        [Agent Mode: ReAct / Plan-and-Execute]
                                      │
                                      ▼
                     ┌──────────────────────────────────┐
                     │       메인 에이전트 루프          │
                     └──────────────────────────────────┘
                       │            │              │
         ┌─────────────┘            │              └──────────────┐
         ▼                          ▼                             ▼
   [Skills 주입]           [Tools 호출]                   [SubAgent 위임]
   instructions+tools        │  │  │                            │
                             │  │  └──── [HITL 게이트] ─────────┘
                             │  │                               (모든 호출 지점에서 발동 가능)
                             │  └──────────── [Todo 갱신] ◀──── (에이전트가 write_todos로 계획 표시)
                             ▼
                       외부/내부 실행
```

## 기능별 현재 구현 상태

| 기능 | UI | Runner | 비고 |
|------|----|----|------|
| ReAct | O | O (동작중) | `architecture=react` |
| Plan-and-Execute | O (선택만 가능) | **X (미구현)** | Phase 7.5 대기 |
| SubAgent | O | O | deepagents `SubAgentMiddleware` 기반 |
| Skills | O | O | API에서 메타 관리 |
| Tools | O | O | HTTP/Code/Search/MCP/Built-in |
| HITL | O | O | 서브에이전트별 독립 정책 지원 |
| Todo list | O | O | `write_todos` → `plan.created` 변환 |

## 참조 문서
- `refactoring-deep-agent.md` — 전체 리팩터링 배경
- `refactoring-deep-agent-plan.md` — 구현 계획 (Phase 7·8)
- `refactoring-deep-agent-ui-gaps.md` — UI ↔ Runner 갭 현황
- `AGENTS.md` — 개발 규칙 및 deepagents 공식 문서 참조 정책
