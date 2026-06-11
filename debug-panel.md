# 디버그 패널 항목 가이드

> 에이전트 실행 화면 오른쪽의 **디버그 패널 → 채팅 탭**에 한 줄씩 흘러나오는 항목들을 사용자가 해석할 수 있도록 정리한 문서.
> 작성: 2026-05-14

---

## 1. 패널이 보여주는 것

에이전트가 사용자의 한 메시지를 처리하는 동안 내부에서 일어난 모든 단계가 **시간 순서대로** 한 줄씩 카드로 표시됩니다. 각 카드는 다음을 보여줍니다.

```
[상태]  [▶ 종류 아이콘]  [이름]  [완료/실행중/실패]  [소요 시간]
```

- **상태 동그라미** — 초록 ✓ 완료 / 노란 회전 실행 중 / 빨간 ✗ 실패
- **이름** — 어떤 단계가 실행됐는지 (예: `model`, `tools`, `TodoListMiddleware`, `gmail_search`)
- **시간(ms)** — 이 한 단계가 걸린 시간

카드를 클릭하면 그 단계의 **입력/출력 raw 데이터**를 펼쳐서 볼 수 있습니다 (도구 호출 인자, LLM이 받은 메시지 등).

---

## 2. 항목 종류 (stepType) — 5가지

내부적으로 모든 카드는 다음 중 하나로 분류됩니다.

| stepType | 의미 | 어디서 생기나 |
|----------|------|------------|
| `llm` | LLM(모델) 호출 한 번 | OpenAI / Anthropic / Google / Bedrock / Cohere 모델 추론 |
| `middleware` | deepagents 내부의 미들웨어 단계 | 이름에 `Middleware` 가 포함된 항목들 (아래 §3-2 참조) |
| `tool` | 도구 실행 한 번 | `tools` 노드 또는 개별 도구 이름 (`gmail_search`, `read_file` 등) |
| `agent` | 서브에이전트 위임 한 번 | `task` 도구를 통해 메인이 서브에이전트를 호출할 때 |
| `skill` | 스킬 라우팅/적용 | SkillsMiddleware 가 SKILL.md 메타를 시스템 프롬프트에 주입 |

> 외부 클라이언트(`/v1/chat`) 가 받는 정규화 객체에서는 `kind` 필드로 `tool | agent | skill | thinking | llm` 5종으로 다시 분류됩니다. 다만 화면에서 보이는 디버그 패널은 위 5종을 그대로 사용.

---

## 3. 항목 이름 — 흔히 보이는 것들

### 3-1. 큰 노드 (LangGraph 그래프의 메인 노드)

| 이름 | 의미 | stepType |
|------|------|---------|
| `model` | LLM 한 번 호출 (응답이 본문이 되거나 도구 호출이 결정됨) | `llm` |
| `tools` | 모델이 결정한 도구들을 묶어서 실행하는 노드 | `tool` |

`model` ↔ `tools` 가 번갈아 나오면 ReAct (생각→도구→생각→…) 사이클이 도는 중입니다. 답변을 만들기 전 마지막은 항상 `model`.

### 3-2. 미들웨어 (`*Middleware`)

deepagents 가 모델 호출 전후로 끼워넣는 처리 단계입니다. 시간은 보통 1~5ms 정도로 짧고 사용자 입장에서 신경 쓸 필요 없지만, 무엇이 어디서 끼어드는지 알아두면 디버깅에 도움이 됩니다.

| 미들웨어 | 하는 일 |
|---------|--------|
| `PatchToolCallsMiddleware` | LLM 응답의 `tool_calls` 형식을 보정 (모델별 호환성) |
| `TodoListMiddleware` | `write_todos` 도구 호출을 잡아 `state["todos"]` 에 반영 — 계획/할 일 패널이 갱신되는 단계 |
| `SkillsMiddleware` | 에이전트에 연결된 SKILL.md 메타데이터를 시스템 프롬프트에 자동 주입 (progressive disclosure) |
| `HumanInTheLoopMiddleware` | `requires_approval` 도구 호출 직전 interrupt 발생 — HITL 승인 카드가 뜨는 지점 |
| `SystemPromptMiddleware` | 사용자 시스템 프롬프트를 deepagents 표준 프롬프트에 append |
| `ModelCallLimitMiddleware` | 모델 호출 횟수 상한 강제 — `stepLimit`/`recursion_limit` 관련 |

### 3-3. 도구 (Tools)

`tools` 노드 안에서 개별 도구가 호출되면 각각 별도 카드로 표시됩니다. 아이콘은 도구 종류에 따라 자동 매핑됩니다.

#### 가상 파일시스템 (VFS) — 현재 비활성

> 아래 도구들은 deepagents 내장이지만 현 버전에서 비활성 (혼동 방지). 화면에 등장하면 사용자 정의 도구입니다.

| 도구 | 라벨 | 아이콘 |
|------|------|------|
| `ls` | 디렉토리 조회 | 📁 |
| `read_file` | 파일 읽기 | 📄 |
| `write_file` | 파일 쓰기 | ✍️ |
| `edit_file` | 파일 편집 | ✏️ |
| `grep` | 파일 검색 | 🔎 |

#### 검색 / 외부 정보

| 도구 | 라벨 | 아이콘 |
|------|------|------|
| `web_search` | 웹 검색 | 🔍 |
| `tavily_search` | 웹 검색 (Tavily) | 🔍 |
| `current_time` | 현재 시각 | 🕐 |

#### 코드 실행

| 도구 | 라벨 | 아이콘 |
|------|------|------|
| `python` | Python 코드 실행 | 🐍 |
| `code_interpreter` | 코드 인터프리터 | 🐍 |

#### Gmail / 문서

| 도구 | 라벨 | 아이콘 |
|------|------|------|
| `gmail_search` | Gmail 검색 | 📧 |
| `gmail_send` | Gmail 전송 | 📧 |
| `gmail_fetch_attachment` | Gmail 첨부 다운로드 | 📎 |
| `gmail_parse_pdf_attachment` | Gmail PDF 분석 | 📑 |
| `pdf_parse` | PDF 분석 | 📑 |
| `document_preprocess` | 문서 전처리 | 📝 |

#### 계획·위임 (특수 도구)

| 도구 | 라벨 | 아이콘 | 비고 |
|------|------|------|-----|
| `write_todos` | 계획 수립 | 📝 | TO-DO List 패널을 갱신 |
| `task` | 서브에이전트 호출 | 🤖 | 메인이 서브 에이전트에게 작업 위임 (입력의 `subagent_type` 이 실제 서브에이전트 이름) |

#### 매핑에 없는 도구

라벨이 없는 사용자 정의 도구는 `🔧 {도구이름}` 으로 표시됩니다.

### 3-4. 서브에이전트 (Sub-agent)

`task` 도구를 호출하면 그 안에서 서브에이전트가 실행되고, 서브에이전트의 모든 단계가 **들여쓰기 형태로 중첩** 표시됩니다.

```
🤖 task (subagent_type=검색)        — 메인이 서브에이전트에 위임
   └ model                          — 서브에이전트의 LLM 호출
   └ tools                          
        └ 🔍 web_search             — 서브에이전트가 사용한 도구
   └ model                          — 서브에이전트 최종 답변
🤖 task 완료                          — 서브에이전트 결과를 메인이 회수
```

서브에이전트 안에서 또 다른 `task` 가 일어나면 한 단계 더 들여쓰기 (depth 2 이상).

---

## 4. 시간(ms) 해석

- **0~5ms** — 미들웨어, 짧은 도구 (예: `current_time`)
- **수십~수백 ms** — `tools` 묶음, 단순 도구
- **1,000~10,000ms 이상** — `model` (LLM 호출, 응답 길이/모델에 따라 다름), 외부 API 도구 (`web_search`, `gmail_*`)
- **유난히 긴 항목** — LLM 응답이 오래 걸리거나 외부 API 가 느림. 이 경우 그 항목을 클릭해 입력/출력을 살펴 원인 파악

---

## 5. 상태 색상

| 색 | 뜻 |
|----|---|
| 🟢 초록 ✓ | 완료 — 정상 종료, 결과가 다음 단계로 전달됨 |
| 🟡 노랑 ○ (회전) | 실행 중 — 응답을 기다리는 중 |
| 🔴 빨강 ✗ | 실패 — 예외 발생. 카드를 펼쳐 stack trace / error message 확인 |

실패한 단계가 생기면 그 다음 단계는 보통 발생하지 않고 에이전트 전체 실행이 중단됩니다.

---

## 6. 자주 보는 패턴

### 6-1. 한 turn 의 정상 흐름 (단순)

```
PatchToolCallsMiddleware  완료  0ms
model                     완료  1,800ms     ← 첫 응답 (도구 호출 결정)
TodoListMiddleware        완료  2ms
tools                     완료  8ms         ← 도구들 묶음
  └ write_todos           완료  1ms
model                     완료  1,500ms     ← 두 번째 응답 (본문)
TodoListMiddleware        완료  2ms
```

### 6-2. 도구 다중 호출

```
model                     완료  2,200ms
tools                     완료  150ms
  └ gmail_search          완료  140ms
  └ pdf_parse             완료  85ms
model                     완료  3,900ms     ← 도구 결과 받아 답변
```

### 6-3. 서브에이전트 위임

```
model                     완료  1,200ms
tools                     완료  4,500ms
  └ task                  완료  4,490ms     ← 서브에이전트 호출
     └ model              완료  2,100ms
     └ tools              완료  600ms
        └ web_search      완료  580ms
     └ model              완료  1,750ms
model                     완료  1,400ms     ← 서브 결과 받아 정리
```

### 6-4. HITL 승인 발생

```
model                     완료  1,800ms
HumanInTheLoopMiddleware  완료  3ms
                                    ← 여기서 실행 일시중지, 승인 카드 표시
```

승인/거부/수정 후 흐름이 재개되면 새 카드가 이어서 추가됩니다.

---

## 7. 활용 팁

- **답변 품질이 이상할 때** — 마지막 `model` 카드를 펼쳐 LLM 이 받은 컨텍스트와 응답 raw 를 확인. 도구 결과가 잘못 들어가지 않았는지 점검.
- **응답이 느릴 때** — 가장 긴 시간을 차지한 카드가 병목. `model` 이 길면 모델 자체 / 컨텍스트 크기, 도구가 길면 외부 API 문제.
- **계획 패널이 갱신 안 될 때** — `TodoListMiddleware` 카드가 안 나오면 `write_todos` 가 호출 안 된 것. 시스템 프롬프트나 모드(`plan_execute`) 확인.
- **HITL 이 안 걸릴 때** — `HumanInTheLoopMiddleware` 카드가 모델 후에 안 보이면 그 도구의 권한이 `requires_approval` 이 아닌 것. 도구 권한 패널에서 설정.

---

## 8. 참고 — 화면에 잘 안 보이는 것

다음 LangGraph 내부 구조는 노이즈가 심해 디버그 패널에서 **숨겨집니다** (`_SKIP_CHAIN_NAMES`).

```
LangGraph, RunnableLambda, RunnableSequence, RunnableParallel,
ChannelRead, ChannelWrite, __start__, __end__,
RunnableAssign, RunnablePick, RouterRunnable,
CompiledStateGraph, CompiledGraph
```

이름이 위 목록에 있거나 depth=0(루트) 이면 카드로 표시되지 않습니다. 보이지 않는다고 실행이 안 되는 건 아니에요.

---

## 9. 관련 코드

- 이벤트 발행: `apps/agent-runner-py/src/modules/agents/deepagent_bridge.py::_pump_astream_events`
- step 분류: 같은 파일 `_get_step_type`, `_should_show_chain`
- 라벨/아이콘: `apps/agent-runner-py/src/modules/streaming/activity_labels.py`
- WebSocket 발행: `apps/agent-runner-py/src/modules/hitl/hitl_gateway.py::emit_step_started/completed/failed`
- 프론트 표시: `apps/agent-web/src/components/agents/flow/AgentFlowDebugPanel.tsx`
