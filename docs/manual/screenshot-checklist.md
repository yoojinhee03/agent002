# 매뉴얼용 스크린샷 캡쳐 체크리스트

> 워드 매뉴얼(`Manual.docx`) 작성을 위한 스크린샷 가이드입니다.
> 각 항목의 **상태 준비** → **캡쳐 영역** 지시대로 캡쳐하여 `docs/manual/screenshots/` 폴더에 **지정된 파일명** 으로 저장해 주세요.
> 모두 PNG 권장. 해상도는 macOS 기본 캡쳐(`Cmd+Shift+4` 후 영역 드래그) 그대로 OK.

---

## 사전 준비

- 데모용 에이전트 1개 이상 (이름: `deep-agent` 권장)
- 그 에이전트에 Sub Agent 1개(이름: `Mail Reader Sub Agent` 같은 식) 미리 추가해서 main 과 연결된 상태
- Brain Model 은 OpenAI/Anthropic 어느 것이든 1개 이상 등록되어 있어야 모델 셀렉터가 비어 있지 않음
- 도구(Tools) 탭 캡쳐를 위해 프로젝트에 Custom Tool / MCP / Built-in Tool 중 최소 1개 등록 권장
- 디버그 패널 캡쳐를 위해 한 번 실행해 본 thread 이력이 있는 게 자연스러움

캡쳐 시 다음 정보가 화면에 안 보이도록 주의:
- 실제 사용자 이메일/이름 (필요 시 더미 계정 사용)
- 실제 API 키 / OAuth 토큰
- 실제 메일 본문, 개인정보

---

## A. 툴바 (AgentFlowToolbar)

### A-1. `01-toolbar-clean.png`
- **상태**: 에이전트 페이지 로드 직후, 미저장 변경 없음
- **캡쳐 영역**: 페이지 상단 툴바 한 줄 (← Agents | 에이전트명 | Main Agent | 실행 | 저장)
- **목적**: 툴바 전체 모습

### A-2. `02-toolbar-dirty.png`
- **상태**: 어떤 설정값(예: 이름) 을 변경해서 `미저장` 뱃지가 표시된 상태
- **캡쳐 영역**: 동일하게 툴바 한 줄. 우측 `저장` 버튼이 파랑색 강조(glow)로 활성화된 모습이 같이 잡혀야 함

### A-3. `03-toolbar-saving.png` (선택)
- **상태**: 저장 클릭 직후 저장 아이콘이 스피너로 바뀐 짧은 순간
- 잡기 어려우면 생략 가능

---

## B. 그래프 캔버스 (FlowCanvas)

### B-1. `04-canvas-overview.png`
- **상태**: Main + Sub 1개가 연결된 기본 화면. 우측 패널 닫힌 상태(전체 캔버스 보이게).
  - 우측 X 버튼으로 settings/debug 패널을 닫고, 그래프 빈 곳을 클릭해서 모든 선택 해제
- **캡쳐 영역**: 캔버스 전체 (좌측 사이드바 제외, 툴바 아래부터)
- **포함되어야 할 요소**: Main Agent 노드, Sub Agent 노드, 둘을 잇는 엣지, 좌측 하단 + Sub Agent 추가 버튼, 좌측 하단 줌 컨트롤

### B-2. `05-canvas-main-selected.png`
- **상태**: Main Agent 노드를 클릭한 직후 — 노드 테두리에 파란 글로우, 우측에 settings 패널 등장
- **캡쳐 영역**: 캔버스 + 우측 패널 헤더(`deep-agent` 와 X 버튼) 까지 같이 보이게

### B-3. `06-canvas-sub-selected.png`
- **상태**: Sub Agent 노드를 클릭한 상태
- **캡쳐 영역**: 캔버스 + 우측 패널 헤더(서브 에이전트 이름) 까지

### B-4. `07-canvas-running.png`
- **상태**: 실행 버튼을 눌러서 디버그 패널이 열리고 그래프에 `isRunning` 가드가 적용된 상태(엣지가 점선/dim 처리되거나 노드 점등). 메시지 한 번 보내서 step 진행 중인 순간
- **캡쳐 영역**: 캔버스 전체 — 진행에 따라 엣지가 강조되는 모습이 가장 좋음

### B-5. `08-canvas-add-button.png` (선택)
- **상태**: 마우스를 + Sub Agent 추가 버튼 위에 올려서 hover 효과가 들어간 상태
- 잡기 까다로우면 B-1 으로 대체

---

## C. Settings Panel — Main Agent (탭별 7장)

> Main Agent 노드를 선택한 상태에서 우측 settings 패널의 각 탭을 차례로 클릭하며 캡쳐.
> **캡쳐 영역**: 우측 settings 패널 전체 세로 (헤더 + 탭 바 + 본문). 너무 길면 본문이 잘리지 않도록 스크롤 포함 캡쳐(`Cmd+Shift+5` → 창 캡쳐) 권장.

### C-1. `10-settings-main-basic.png`
- 탭: **기본 (Basic)**
- **포함 필드**: Agent Name, Working Method (Architecture) 4개 카드, Brain Model, Purpose (Description)

### C-2. `11-settings-main-prompt.png`
- 탭: **프롬프트**
- 가능하면 프롬프트 변수/블록이 1개 이상 추가된 상태로 캡쳐

### C-3. `12-settings-main-tools.png`
- 탭: **도구**
- DeepAgents Built-in / Teammates / Custom Tools / MCP Servers 4개 섹션이 모두 보이게 스크롤 길게 캡쳐

### C-4. `13-settings-main-model.png`
- 탭: **모델**
- Brain Model 셀렉터 + Temperature 슬라이더 + Max Tokens 슬라이더

### C-5. `14-settings-main-io.png`
- 탭: **I/O** (Output Schema)
- `자유 텍스트` / `JSON Schema` 토글이 보이는 기본 상태. 가능하면 Plain Text 선택 모습

### C-6. `15-settings-main-guardrails.png`
- 탭: **가드레일**
- Safety Level (Med 선택), 금지 주제 입력, 출력 필터 규칙(Keyword/Regex/LLM Check), JSON Validation, PII Masking, Max Output Tokens 슬라이더가 모두 보이게

### C-7. `16-settings-main-handoff.png`
- 탭: **HANDOFF**
- 핸드오프 조건 textarea + 대상 에이전트 셀렉터

---

## D. Settings Panel — Sub Agent (탭별 7장)

> Sub Agent 노드를 선택한 상태에서 같은 탭들을 캡쳐. Main 과 일부 항목이 다를 수 있음.

### D-1. `20-settings-sub-basic.png` — 기본
### D-2. `21-settings-sub-prompt.png` — 프롬프트
### D-3. `22-settings-sub-tools.png` — 도구
### D-4. `23-settings-sub-model.png` — 모델
### D-5. `24-settings-sub-io.png` — I/O
### D-6. `25-settings-sub-guardrails.png` — 가드레일
### D-7. `26-settings-sub-handoff.png` — HANDOFF

---

## E. Main Agent Modal

### E-1. `30-main-modal.png`
- **상태**: 툴바의 `Main Agent` 버튼 클릭으로 모달이 떠 있는 상태
- **캡쳐 영역**: 모달 전체 (Agent Name / Description / Architecture 4개 카드 / Brain Model / 확인 버튼) + 뒤 어둡게 처리된 배경 일부

### E-2. `31-main-modal-arch-selected.png` (선택)
- **상태**: Architecture 4개 카드 중 하나(Deep Autonomous) 가 파랑 테두리로 선택된 모습이 명확히 보이게

---

## F. Debug Panel

> 실행 버튼을 누른 뒤 우측에 표시되는 `디버그 패널`. 각 탭마다 실제 데이터가 1건 이상 있는 상태로 캡쳐.

### F-1. `40-debug-empty.png`
- **상태**: 실행 직후, 메시지 보내기 전. 채팅 탭 + "에이전트와 대화를 시작하세요" 빈 상태 일러스트가 보임
- **캡쳐 영역**: 디버그 패널 전체 세로

### F-2. `41-debug-chat-streaming.png`
- **상태**: 메시지를 보내고 AI 응답이 스트리밍 되는 도중. 사고 중 카드 / 도구 카드 / 부분 스트리밍된 ai 메시지가 같이 잡히는 게 좋음

### F-3. `42-debug-chat-completed.png`
- **상태**: 한 턴이 완료된 상태. user → AI 메시지 1쌍 완성 + 도구 카드 완료(완료 뱃지) 표시

### F-4. `43-debug-chat-hitl-request.png`
- **상태**: HITL이 트리거되어 승인 카드가 뜬 상태. 도구명/실행 인자(검색어/최대 결과 등)가 풀어쓰기 형태로 보이는 카드 + `거부 / 수정 / 허용` 3개 버튼

### F-5. `44-debug-chat-hitl-edit.png`
- **상태**: HITL 카드에서 `수정` 버튼을 눌러 인라인 입력 폼이 펼쳐진 상태. `수정하고 실행 / 취소` 버튼이 같이 보이게

### F-6. `45-debug-log.png`
- 탭: **실행 로그**
- 시간 / 레벨(INFO/DONE 등) / nodeName / 메시지 칼럼이 보이는 모습

### F-7. `46-debug-metrics.png`
- 탭: **메트릭**
- 입력 토큰 / 출력 토큰 / 응답 시간 / 비용 4개 카드

### F-8. `47-debug-raw.png`
- 탭: **RAW**
- 노드별 출력 JSON 카드 1~2개

### F-9. `48-debug-warnings.png`
- 탭: **경고**
- 경고가 1개 이상 있을 때 (없으면 "경고 없음" 빈 상태로 캡쳐 — `48-debug-warnings-empty.png` 로 저장)

### F-10. `49-debug-input.png` (선택)
- **상태**: 채팅 탭의 입력창 영역만 클로즈업
- **캡쳐 영역**: 디버그 패널 하단 입력창 부분. 우측 전송 버튼 (▶) 이 같이 보이게. 메시지를 입력 중인 상태(`Ctrl+Enter` 안내 placeholder 사라진 상태)

---

## 정리: 파일명 인덱스

| # | 파일명 | 영역 |
|---|---|---|
| 1 | `01-toolbar-clean.png` | A |
| 2 | `02-toolbar-dirty.png` | A |
| 3 | `03-toolbar-saving.png` | A |
| 4 | `04-canvas-overview.png` | B |
| 5 | `05-canvas-main-selected.png` | B |
| 6 | `06-canvas-sub-selected.png` | B |
| 7 | `07-canvas-running.png` | B |
| 8 | `08-canvas-add-button.png` | B |
| 9 | `10-settings-main-basic.png` | C |
| 10 | `11-settings-main-prompt.png` | C |
| 11 | `12-settings-main-tools.png` | C |
| 12 | `13-settings-main-model.png` | C |
| 13 | `14-settings-main-io.png` | C |
| 14 | `15-settings-main-guardrails.png` | C |
| 15 | `16-settings-main-handoff.png` | C |
| 16 | `20-settings-sub-basic.png` | D |
| 17 | `21-settings-sub-prompt.png` | D |
| 18 | `22-settings-sub-tools.png` | D |
| 19 | `23-settings-sub-model.png` | D |
| 20 | `24-settings-sub-io.png` | D |
| 21 | `25-settings-sub-guardrails.png` | D |
| 22 | `26-settings-sub-handoff.png` | D |
| 23 | `30-main-modal.png` | E |
| 24 | `31-main-modal-arch-selected.png` | E |
| 25 | `40-debug-empty.png` | F |
| 26 | `41-debug-chat-streaming.png` | F |
| 27 | `42-debug-chat-completed.png` | F |
| 28 | `43-debug-chat-hitl-request.png` | F |
| 29 | `44-debug-chat-hitl-edit.png` | F |
| 30 | `45-debug-log.png` | F |
| 31 | `46-debug-metrics.png` | F |
| 32 | `47-debug-raw.png` | F |
| 33 | `48-debug-warnings.png` | F |
| 34 | `49-debug-input.png` | F |

총 약 30~34장. 선택(✱) 표시는 안 찍어도 매뉴얼 작성에는 지장 없음.

---

## 다음 단계

1. 위 목록을 따라 캡쳐해서 `docs/manual/screenshots/` 폴더에 저장
2. 캡쳐 완료되면 알려주세요 — `Manual.md` 본문 작성 + `pandoc` 변환으로 `Manual.docx` 생성으로 진행합니다
3. 누락/추가가 필요한 항목이 있으면 그 파일명만 알려주시면 됩니다
