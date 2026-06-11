# FAQ — DeepAgents

> AgentStudio 가 사용하는 공식 `deepagents` 패키지 관련 자주 묻는 질문 정리.
> 코드 위치: `apps/agent-runner-py/src/modules/agents/deepagent_bridge.py`,
> `apps/agent-runner-py/src/modules/deep/*`
> 공식 문서: https://docs.langchain.com/oss/python/deepagents/

---

## Q1. "langchain → deepagents native 마이그레이션" 은 됐나?

**됐다. 단, 범위가 "자체 SDK 제거 + 실행 하네스 일원화" 였다.**

- `c57df2d` — 자체 `packages/deepagent-sdk/`(22파일) 삭제, 공식 `deepagents` 패키지 도입,
  `deepagent_bridge` 를 `create_deep_agent()` 기반으로 전면 rewrite
- `a9c659d` — 공식 `subagents` 파라미터로 서브에이전트 위임 전환
- `23ff748` — 공식 `skills` / `backend` 인자 와이어링

`langchain` / `langgraph` 의존성이 남아 있는 건 정상이다 — deepagents 자체가 그 위에서
도는 패키지다. 목표는 "langchain 제거" 가 아니라 "자체 deepagent-sdk 제거" 였다.

다만 주변 커스텀 로직(메모리·가드레일·도구권한)은 deepagents-native 로 **전환된 게
아니라** `src/modules/deep/*` 로 **이관(relocate)** 되어 deepagents 를 감싸는 커스텀
래퍼로 남아 있다. 그래서 일부 Core capability 가 아직 미구현/자체구현 상태다.
(상세: `plan.md` Phase 7)

---

## Q2. deepagents Core capabilities 중 아직 구현 안 된 것은?

| 항목 | 상태 |
|------|------|
| Models / Subagents / Human-in-the-loop / Skills / Harness / Event streaming | ✅ 구현 |
| Context engineering / Backends / Memory / Streaming(`stream_mode`) / Profiles | ⚠️ 부분 또는 자체구현 |
| Async subagents / Permissions / Sandboxes / Interpreters | ❌ 미구현 |

- **Async subagents** — `AsyncSubAgent` 사용처 전무. 원격 위임 경로 없음
- **Permissions** — `create_deep_agent(..., permissions=[])` 명시적 비활성화
  (VFS 자체를 끔 — "STATE 탭 UI 구현 후 재활성화" 의도적 보류)
- **Sandboxes** — Modal/Daytona/Deno 샌드박스 backend 미사용
- **Interpreters** — 코드 실행(`execute` 도구) 경로 없음
- **Memory** — deepagents native `memory=` 미전달. 자체 `MemoryManager` 가 있으나
  write 경로(`add_messages`/`store_episodic`)가 어디서도 호출되지 않아 **사실상 비활성**.
  실제 멀티턴 지속은 LangGraph checkpointer 가 담당 (상세: `plan.md` Phase 7)
- **Profiles** — 모델 runtime profile override 미설정 → 모델 기본값 사용 (Q6 참고)
- **Harness** — 별도 구현 대상이 아니라 `create_deep_agent()` 내장 capability 묶음의
  총칭. agent002 는 이 하네스 위에서 동작 중 (Q6 참고)
- **Event streaming** — 메인 경로(`deepagent_bridge`)가 `astream_events(v2)` 사용 → API
  자체는 ✅. 단 native 이벤트를 2단 자체 어댑터로 `chat.*` 포맷 변환 (Q13 참고)
- **Streaming(`stream_mode`)** — Event streaming 과 택일 관계. 메인 경로 미사용,
  레거시 워크플로우 v1(`langgraph_service`)만 `stream_mode` 사용 (Q13 참고)

상세 점검표는 `plan.md` Phase 7 참고.

---

## Q3. Permissions 와 HITL(Human-in-the-loop) 의 차이는?

**대체 관계가 아니라 보완 관계.** 통제 대상도 결정 주체도 다르다.

| 축 | **Permissions** (`FilesystemPermission`) | **HITL** (`interrupt_on`) |
|----|------------------------------------------|---------------------------|
| 무엇을 통제 | VFS 파일시스템 작업만 (read/write) | 모든 도구 호출 |
| 누가 결정 | 사전 정의 규칙 (자동) | 사람 (런타임에 개입) |
| 동작 방식 | `allow`/`deny` — 조용히 허용/차단 | 실행 일시정지 → 사람이 approve/edit/reject |
| 실행 흐름 | 멈추지 않음 | 멈춤 — `checkpointer` 필수 |
| 설정 단위 | path glob + operations + mode | 도구 이름별 (`True`/`False`/`{allowed_decisions}`) |
| 비유 | 파일시스템 ACL / `chmod` | 코드리뷰 승인 게이트 |

```python
# Permissions — /policies/** 에는 절대 못 쓴다 (사람에게 묻지 않고 거부)
permissions=[FilesystemPermission(operations=["write"], paths=["/policies/**"], mode="deny")]

# HITL — send_email 호출 시 멈추고 사람에게 승인 요청
interrupt_on={"send_email": {"allowed_decisions": ["approve", "edit", "reject"]}}
```

보통 같이 쓴다: "민감 경로는 Permissions 로 아예 차단 + 위험 도구는 HITL 로 사람 승인".

> 주의: 코드베이스의 자체 `toolPermissions`(`disabled`/`restricted`/`requires_approval`/
> `auto`)는 deepagents `permissions` 와 **별개의 제3의 커스텀 도구권한 레이어**다.
> 이름이 비슷해 혼동하기 쉽다. (`requires_approval` → `interrupt_on` 으로 매핑됨)

---

## Q4. VFS 와 Sandbox 의 차이는? 다른 개념인가?

**층위가 다른 개념 — 대등 비교 대상이 아니라 포함 관계.**

```
VFS (개념/추상화 — "에이전트가 쓰는 가상 파일시스템 인터페이스")
 └─ backend (구현체)
     ├─ StateBackend      ← VFS 구현 (in-memory, ephemeral)
     ├─ StoreBackend      ← VFS 구현 (LangGraph Store, 영속)
     ├─ FilesystemBackend ← VFS 구현 (실제 로컬 디스크)
     └─ Sandbox           ← VFS 구현 + 셸 실행(execute) + 컨테이너 격리
```

- **VFS** = read_file/write_file/ls 같은 도구로 다루는 가상 파일시스템 **추상화/인터페이스**
- **Sandbox** = 그 VFS 를 구현하는 **backend 의 한 종류**. 단, 다른 backend 와 달리
  **`execute` 셸 도구 + 격리 컨테이너** 를 추가로 제공

**결정적 차이 — `execute` 도구(셸 실행):**

| | 일반 VFS backend (State/Store/Filesystem) | **Sandbox** backend |
|--|-------------------------------------------|---------------------|
| 파일 도구 (read/write/ls/glob/grep/edit) | ✅ | ✅ 동일 |
| `execute` 도구 (셸 명령 실행) | ❌ | ✅ |
| 코드 실행 (pytest, pip install 등) | 불가 | 가능 (격리됨) |
| 격리 | State/Store: 호스트 미접근 / Filesystem: 호스트 디스크 직접 접근(위험) | 컨테이너 격리 |
| 인프라 | 추가 인프라 불필요 | Modal/Daytona 등 외부 서비스 / Deno 런타임 필요 |

정리: **"Sandbox 는 VFS 의 한 구현체이면서, VFS 추상화를 넘어서는 실행 환경까지 겸한다."**
그래서 deepagents 문서도 `Backends`("VFS 를 어디에 저장하나")와 `Sandboxes`("거기서
코드까지 돌릴 수 있나")를 별도 항목으로 나눠놓았다.

---

## Q5. 현재 agent002 의 backend 구성은?

```python
# _make_thread_sandbox_backend (deepagent_bridge.py:719)
CompositeBackend(
    default=DockerSandbox(thread_id),                 # 실행/첨부/일반 파일
    routes={
        "/state/":  StateBackend(),                   # 서브에이전트 간 공유 (휘발)
        "/skills/": StoreBackend(store=PostgresStore) # SKILL.md 영속 (store 있을 때만)
    },
)
```

- **default = DockerSandbox** — thread 별 Docker 컨테이너. `execute`(셸) + 파일 도구 제공
- `/state/` → `StateBackend` — supervisor↔subagent 공유 데이터 (LangGraph state, run 단위 휘발)
- `/skills/` → `StoreBackend` — Postgres Store, SKILL.md 영속
- 단 `permissions=[]` 로 **VFS 파일 도구(read_file/write_file/ls/glob/grep/edit) 자체는 꺼져 있음**
  → execute(셸) 와 첨부 sync 만 sandbox 를 활용, file 도구 노출은 안 함 (Q14 참고)

→ "Sandboxes(VFS backend 로서)" 는 ✅ 들어왔으나 file 도구가 꺼져 있어 효과가 부분적이고,
"Interpreters"(`execute` 도구) 는 sandbox 가 자동 노출하므로 사실상 ✅ 가용 상태다.

---

## Q6. Harness 와 Profiles 는 무엇인가?

deepagents 문서 nav 에 추가된 두 항목. 성격이 서로 다르다.

### Harness — "구현 대상" 이 아니라 내장 capability 묶음의 총칭

`/deepagents/harness` 문서는 별도 기능이 아니라, **`create_deep_agent()` 가 한 번에
제공하는 capability 묶음을 가리키는 우산 개념** 이다. 포함 요소:

> planning(`write_todos`) · 가상 파일시스템 · filesystem permissions · 작업 위임(subagents)
> · 컨텍스트/토큰 관리(auto-summarization) · 코드 실행 · human-in-the-loop · Skills · Memory

agent002 는 이미 `create_deep_agent()` 경로로 동작하므로 **하네스 위에서 돌고 있는
상태**다. "구현/미구현" 으로 따질 항목이 아니라, 그 안의 개별 capability(위 Q2 표)가
얼마나 켜져 있냐의 문제다.

### Profiles — 모델 runtime profile override

**모델의 capability 메타데이터**(특히 `max_input_tokens`)를 가리킨다. deepagents 는
이 profile 을 읽어:

- 컨텍스트 한도 표시
- **auto-summarization 발동 시점** (오래된 메시지를 언제 압축할지)

을 결정한다. profile override 로 이 값을 바꿔 더 일찍/늦게 요약이 돌게 조정할 수 있다.
주로 deepagents **CLI** 의 TOML 설정 기능이다:

```toml
[models.providers.anthropic.profile]
max_input_tokens = 4096

[models.providers.anthropic.profile."claude-sonnet-4-5"]
max_input_tokens = 8192   # 모델별 override 가 우선
```

**agent002 현황** — profile override 미설정 → 각 모델의 기본 profile 사용.
auto-summarization 자체는 하네스 기본 동작으로 켜져 있고, 그 임계값만 모델 기본값을
따른다. 임베디드 SDK 사용 맥락에서는 우선순위 낮은 advanced 옵션.

---

## Q7. VFS 를 쓰면 어떤 점이 좋은가?

deepagents 의 VFS 는 단순 "파일 저장소" 가 아니라 **에이전트의 컨텍스트 관리 도구**다.
핵심 이점 5가지:

### 1. 자동 context offloading — 가장 큰 이점
도구 호출의 입력/결과가 토큰 임계값(**기본 20,000 토큰**)을 넘으면, deepagents 가
**자동으로** 그 내용을 VFS 에 파일로 내보내고 본문은 `파일 경로 참조 + 첫 10줄 미리보기`
로 대체한다. 세션이 모델 컨텍스트 한도에 가까워지면 오래된 도구 호출을 truncate 하고
file pointer 로 바꾼다.
→ **context window overflow 방지.** 에이전트는 필요할 때 그 파일을 다시
`read_file`/`grep` 으로 꺼내볼 수 있어 정보 손실도 없다.

### 2. 의도적으로 컨텍스트를 깔끔하게 유지
"대량 데이터는 `/data/raw.txt` 에 저장하고 분석 요약만 반환하라" 같이 시스템 프롬프트로
지시 가능. 특히 **서브에이전트가 대량 데이터를 다룰 때** raw 는 파일에 두고 메인에는
요약만 올려 메인 컨텍스트를 보호한다.

### 3. 긴 작업의 작업 공간(scratchpad)
`ls/read_file/write_file/edit_file/glob/grep` 으로 중간 산출물·메모·계획을 파일로 관리.
long-running 에이전트가 여러 턴에 걸쳐 작업할 때 "기억" 역할을 한다.

### 4. 영속성 + 서브에이전트 간 공유
- backend 를 `StoreBackend`(Postgres 등)로 하면 **세션이 끝나도 파일이 보존**된다.
- `CompositeBackend` 로 경로별 라우팅하면 메인↔서브에이전트가 같은 파일을 공유.

### 5. Skills 의 동작 기반
Skills 자체가 `SKILL.md` 파일로 VFS 에 저장된다. 즉 **VFS 가 있어야 Skills 가 동작**한다
— agent002 가 지금 VFS 를 거의 안 쓰면서도 `/skills/` 경로만 `StoreBackend` 로 둔 이유가
이것이다.

### agent002 맥락
현재 `permissions=[]` + `filter_vfs_tools()` 로 **VFS 도구를 꺼둔 상태** — 위 1~4번 이점을
못 누리고 5번(Skills)만 최소 사용 중. 끄둔 이유는 VFS 를 켜면 LLM 이 만든 파일 상태를
사용자에게 보여줄 UI("STATE 탭")가 없기 때문이며, STATE 탭 UI 구현 후 재활성화 예정.
특히 **1번(자동 offloading)을 못 쓰는 건 실질적 손해** — 긴 대화·큰 도구 결과에서
컨텍스트가 빨리 차는데 막아줄 안전망이 없는 셈이다. (auto-summarization 은 offloading 과
보완 관계지 대체재가 아니다.)

---

## Q8. Context engineering 이란?

에이전트가 **토큰 한도 안에서 효과적으로 동작하도록 컨텍스트를 관리하는 모든 전략의
우산 개념**. 독립 기능이 아니라 VFS·Subagents·Memory·Profiles 를 "토큰 한도 관리" 라는
목적으로 엮은 상위 개념이라 앞선 Q 들과 내용이 겹친다. 공식 문서는 **5가지 컨텍스트
유형**으로 정리한다:

### 1. Input context — 시작 시점에 들어가는 정보
system prompt + memory + skills. "에이전트가 처음 받는 정보를 어떻게 구성(shaping)하느냐".

### 2. Runtime context — invoke 시점에 넘기는 정적 설정
`context_schema` 로 스키마를 정의하고 `context=` 로 호출 시 주입. 이 값이 **서브에이전트와
도구까지 자동 전파**되어 도구가 `runtime.context.user_id` 식으로 접근한다.

### 3. Context compression — 자동 압축 (2단계, 순서 있음)
- **Offloading (1차)** — 도구 입력/결과가 **20,000 토큰** 초과 시 VFS 파일로 내보내고
  `참조 + 첫 10줄 미리보기` 로 대체 (Q7 의 1번과 동일)
- **Summarization (최후 수단)** — 컨텍스트가 모델 `max_input_tokens` 의 **85%** 에 도달하고
  **더 offload 할 게 없을 때** 발동. LLM 이 in-context 요약을 만들어 working memory 의
  전체 히스토리를 대체하고, **원본 전체 메시지는 VFS 에 보존**(세부사항 복구 가능)

### 4. Context isolation — 서브에이전트로 격리
복잡한 작업을 서브에이전트에 위임하면 수많은 도구 출력이 메인 컨텍스트를 채우는 대신
서브에이전트가 처리하고 **최종 요약만 반환** → 메인 컨텍스트를 깨끗하게 유지.

### 5. Long-term memory — VFS 영속 저장
세션을 넘어 유지되는 지식을 VFS(StoreBackend)에 보관.

> 주의: `write_todos`(planning)는 공식 context-engineering 페이지의 5-유형 taxonomy 에
> **포함되지 않는다** — planning 은 별도 harness capability 다.

### agent002 현황

| 유형 | deepagents | agent002 |
|------|-----------|----------|
| Input context | system_prompt + memory + skills | ✅ system_prompt 적극 구성 / ✅ skills / ⚠️ memory 비활성(Q2) |
| Runtime context | `context_schema` + `context=` | ❌ `context_schema` 미사용 |
| Compression — Offloading | 도구결과 >20K → 파일 | ❌ VFS 꺼져 있어 불가 |
| Compression — Summarization | 85% 도달 시 LLM 요약 + 원본 파일 보존 | ⚠️ 하네스 기본 동작 의존 / 원본 파일 보존 부분은 VFS 꺼져 약화 |
| Isolation — subagents | ✅ | ✅ `build_subagents` |
| Long-term memory | VFS StoreBackend | ⚠️ 자체 MemoryManager (비활성) |

핵심: agent002 는 **isolation(subagents) 만 제대로 동작**하고, compression 의 두 축
(offloading/summarization)은 VFS 가 꺼져 있어 거의 무력화 — 긴 대화에서 컨텍스트 관리
안전망이 약한 상태다.

---

## Q9. Sandbox 는 Docker container 처럼 생긴다고 보면 되나?

**대체로 맞다.** 격리된 컨테이너이고, deepagents 배포 설정에서 실제로 **base Docker
image 를 지정**한다 (`image` 필드, `template` 으로 환경 템플릿 지정). 다만 뉘앙스가 있다.

### 맞는 부분
- **격리된 컨테이너** — 호스트와 분리된 환경에서 `execute`(셸 명령)·파일 작업이 돌아감
- **Docker image 기반** — `image`/`template` 필드로 base 이미지·환경 지정
- **라이프사이클이 docker 와 유사** — `create()` → 사용 → `stop()`/`terminate()`.
  코드에서 `finally` 블록으로 꼭 정리 (`docker run` ... `docker stop` 느낌)

### 다른/주의할 부분
1. **직접 `docker run` 하는 게 아니다** — Modal / Daytona / Runloop / LangSmith 같은
   **호스팅 서비스가 원격에 컨테이너를 대신 띄워준다**. 그 서비스 SDK 의 `create()` 를
   호출하면 클라우드에 컨테이너가 뜨고, deepagents 는 그걸 backend 로 감쌀 뿐.
   로컬 Docker 데몬을 쓰는 구조가 아니다.
2. **`scope` 로 컨테이너 수명 제어** — `thread`(기본): 대화마다 새 컨테이너 /
   `assistant`: 어시스턴트 전체가 컨테이너 하나를 공유
3. **`provider` 값** — `none` / `daytona` / `modal` / `runloop` / `langsmith`
4. **Deno 만 예외** — Deno provider 는 풀 컨테이너가 아니라 Deno 런타임의 경량
   isolate(V8 기반). 코드 실행 격리는 되지만 "컨테이너" 라기보단 샌드박스된 런타임에 가깝다

### 한 줄 요약
격리된 컨테이너 맞다 — 실제 Docker image 기반. 단 보통 내가 직접 관리하는 게 아니라
Modal/Daytona 같은 클라우드 서비스가 띄워주고, deepagents 는 그 컨테이너에 `execute` +
파일 도구를 연결해주는 어댑터 역할. Deno provider 만 컨테이너 아닌 경량 런타임.

---

## Q10. 대화를 history 로 관리하면 sandbox 컨테이너도 계속 실행돼 있어야 하나?

**아니다.** 핵심은 **"대화 history" 와 "sandbox 상태" 가 별개 레이어**라는 점이다.

| | 무엇 | 어디에 저장 | 컨테이너와의 관계 |
|--|------|-------------|-------------------|
| **대화 history** | 메시지 기록 | LangGraph checkpointer (agent002: Postgres) | **무관** — 컨테이너 죽어도 살아남음 |
| **Sandbox 상태** | 파일·설치 패키지·clone 한 repo | sandbox 컨테이너 안 | 종속 — 컨테이너 사라지면 같이 사라짐 |

→ history 를 관리한다고 해서 컨테이너를 계속 띄워둘 필요는 없다. 둘은 다른 곳에 산다.

### 권장 패턴 — "계속 실행" 이 아니라 "get-or-create by thread_id"

```python
async def agent(config):
    thread_id = config["configurable"]["thread_id"]
    try:
        sandbox = await client.find_one(labels={"thread_id": thread_id})  # 있으면 재연결
    except Exception:
        sandbox = await client.create(                                    # 없으면 새로 생성
            CreateSandboxFromSnapshotParams(
                labels={"thread_id": thread_id},
                auto_delete_interval=3600,   # TTL: idle 1시간이면 자동 정리
            )
        )
    return create_deep_agent(..., backend=DaytonaSandbox(sandbox=sandbox))
```

- 내 서버가 핸들을 붙들고 있지 않음 — 매 턴 `thread_id` 라벨로 sandbox 를 다시 찾을 뿐
- 같은 대화 후속 메시지 → 기존 sandbox 재사용 (provider 가 컨테이너 유지)
- **TTL**(`auto_delete_interval`) → idle 일정 시간 지나면 provider 가 컨테이너 삭제/아카이브
- TTL 만료 후 다시 말 걸면 → 새 sandbox 가 깨끗하게 생성. **파일 상태는 잃지만 대화
  history 는 checkpointer 에 남아 있음**

즉 "계속 실행" 이 아니라 **"thread_id 로 식별되는 sandbox 를 idle TTL 까지만 provider 가
살려두고 그 안에서는 재사용"** 하는 모델.

### scope 로 정책이 갈림
- **`thread`-scoped (기본/권장)** — thread_id 마다 sandbox. 후속 메시지엔 재사용, TTL
  만료 시 정리. "대화마다 깨끗한 환경"
- **`assistant`-scoped** — 모든 대화가 sandbox 하나 공유. clone 한 repo·설치 의존성을
  대화 간 유지 — 사실상 계속 떠 있는 워크스페이스 (코딩 어시스턴트 등 장기 작업용)

### 비용 관점
컨테이너를 살려두면 비용이 든다. 그래서 TTL 이 존재 — "재사용 편의" vs "idle 비용"
트레이드오프를 TTL 값으로 조절. assistant-scoped 는 편하지만 항상 떠 있어 비용이 더 크다.

### agent002 맥락
현재 sandbox 미사용(Q5). 도입한다면 agent002 가 이미 thread + Postgres checkpointer
구조라 위 "get-or-create by thread_id" 팩토리 패턴을 그대로 얹으면 된다 — history 는
지금처럼 checkpointer 가, 파일 상태는 sandbox 가 담당하도록 분리.

---

## Q11. History 에서 옛 대화를 다시 시작하면 sandbox 는 어떻게 되나? 이전 정보가 없어지나?

**"이전 sandbox 가 아직 살아있느냐(TTL 안 지났느냐)" 에 따라 갈린다.**

### Case A — 이전 sandbox 가 아직 살아있음 (TTL 안 지남)
`find_one(labels={"thread_id": thread_id})` 가 그 sandbox 를 찾아 **재연결**.
→ 이전에 만든 파일·설치 패키지·clone 한 repo **다 그대로**. 정보 안 없어짐. ✅

### Case B — 이전 sandbox 가 TTL 만료로 삭제됨
`find_one` 실패 → `create()` 로 **새 (빈) sandbox 생성**.
→ 이전 sandbox 의 파일/상태는 **없어짐**. ❌
→ 단, 대화 history(메시지)는 checkpointer 에 그대로 남아 복원됨.

### ⚠️ 여기서 생기는 불일치 문제
Case B 가 위험한 이유 — 에이전트는 **메시지 히스토리를 보고** "아까 `/data/results.txt`
만들었지" 라고 **기억**하는데, 새 sandbox 엔 **그 파일이 실제로 없다.** 존재하지 않는
파일을 참조하다 에러·혼란이 생길 수 있다. 즉 **"history(영속)" 와 "sandbox 파일(휘발)"
의 수명이 달라서 생기는 불일치**다.

### 완화 방법 (설계 선택지)
| 방법 | 효과 | 트레이드오프 |
|------|------|--------------|
| TTL 늘리기 | Case B 발생 확률 ↓ | idle 비용 증가 |
| assistant-scoped | sandbox 안 없어짐 (대화 간 공유) | 격리 약화, 항상 떠 있어 비용 ↑ |
| Snapshot (`CreateSandboxFromSnapshotParams`) | TTL 만료돼도 스냅샷에서 복원 | 스냅샷 관리 필요 |
| **중요 파일은 StoreBackend 로** ✅ 권장 | sandbox 죽어도 파일은 Postgres 에 생존 | 동기화 미들웨어 필요 |

가장 견고한 건 마지막 방법 — `CompositeBackend` 로 `/persistent/` 같은 경로는
`StoreBackend`(Postgres)로 라우팅하고, `SandboxSyncMiddleware` 로 매 run 전후에
store↔sandbox 를 동기화(run 전 store→sandbox 업로드, run 후 sandbox→store 다운로드).
deepagents going-to-production 문서의 권장 패턴이다.

### 한 줄 정리
잃으면 안 되는 파일을 sandbox 에만 두면 안 된다. sandbox 는 휘발성 작업 공간으로
취급하고, 영속이 필요한 건 checkpointer(대화) / StoreBackend(파일) 로 명시적으로 분리.

### agent002 맥락
현재 sandbox 미사용(Q5)이지만 도입 시 이 불일치 문제를 **설계 초반에** 잡아야 한다.
agent002 는 이미 `get_store()` 로 PostgresStore 를 skills 용으로 쓰고 있어
`CompositeBackend` 영속 경로 라우팅 + sync middleware 패턴을 얹기 좋은 구조다.

---

## Q12. Async subagents 로 바꾸면 얻는 이점은?

현재 agent002 가 쓰는 **sync subagents** 와의 핵심 차이:

| | Sync subagents (현재) | Async subagents |
|--|----------------------|-----------------|
| 호출 방식 | `task` 도구 → supervisor **블로킹** | `start_async_task` → **job ID 즉시 반환**, supervisor 계속 진행 |
| 동시성 | 사실상 순차 (하나 끝나야 다음) | **non-blocking 병렬** |
| 실행 중 제어 | 불가 — 시작하면 끝까지 손 못 댐 | `update_async_task`(지시 수정) / `cancel_async_task`(취소) |
| 상태 | run 단위, 끝나면 요약만 | 각자 thread/run 보유, **상호작용 간 state 유지** |
| 관리 도구 | 없음 | `start`/`check`/`update`/`cancel`/`list_async_tasks` 5종 + `AsyncSubAgentMiddleware` 자동 관리 |

### 구체적 이점
1. **진짜 병렬 실행 → latency 단축** — researcher 여러 개를 동시에 띄우고 supervisor 는
   다른 일 하다가 다 모이면 종합. sync 는 하나씩 기다려야 함
2. **Non-blocking — supervisor 가 살아있음** — 긴 작업 동안 사용자와 계속 대화 가능
   ("백그라운드로 돌리고 있어요, 그동안 다른 거 물어보세요")
3. **Mid-task 제어** — 작업 도중 방향 수정·취소 가능. sync 는 한 번 시작하면 개입 불가
4. **진행 상황 가시성** — `list_async_tasks`/`check_async_task` 로 "3개 중 2개 완료" 폴링·표시
5. **원격 배포 / 독립 스케일링** — `url` 필드로 HTTP transport → 서브에이전트를 별도
   deployment 로 분리, 리소스 프로파일 분리 (`url` 생략 시 ASGI in-process)

### agent002 맥락에서 특히 의미 있는 점
현재 `build_subagents()` 로 sync dict subagent 만 만들고, 프롬프트로 **"task 도구를
정확히 N번 순서대로 호출하세요"** 를 강제 중(`deepagent_bridge.py` 멀티 에이전트 실행
규칙). 이건 sync 의 한계를 드러내는 신호 — 멀티 에이전트가 사실상 순차 블로킹이고 그걸
LLM 프롬프트로 억지 오케스트레이션하는 중. Async 로 가면:
- coordinator → researcher·writer 계층의 leaf 들을 **진짜 병렬로** → latency 대폭 단축
- "N번 호출 강제" 프롬프트 해킹 대신 `AsyncSubAgentMiddleware` 가 오케스트레이션
- 이미 가진 **WebSocket 이벤트** 와 `check_async_task` 폴링을 연결하면 진행률 표시 자연스러움

### ⚠️ 트레이드오프 (공짜 아님)
- **복잡도 증가** — thread/run 관리·상태 영속·관리 도구 5종을 supervisor LLM 이 제대로
  다루도록 프롬프트 설계 필요
- HTTP transport 쓰면 **별도 Agent Protocol server 인프라** 필요
- agent002 의 현재 이벤트 어댑터·HITL·가드레일/메모리 래퍼가 async subagent 경로에서도
  동작하는지 **검증 필요** — 리팩터링 범위가 작지 않음

---

## Q13. Event streaming 이란? 우리 프로젝트는 쓰고 있나?

deepagents 의 스트리밍 수신 API 는 **두 가지이고 택일 관계**다:

| | **Event streaming** (`.astream_events()`) | **Streaming** (`.stream()` + `stream_mode`) |
|--|-------------------------------------------|---------------------------------------------|
| 방식 | 그래프 전 구성요소의 **lifecycle 이벤트 firehose** | mode 별 chunk (`updates`/`messages`/`custom`) |
| 이벤트 단위 | `on_chain_start`·`on_chat_model_stream`·`on_tool_start`·`on_tool_end`·`on_chain_end` … 이름 붙은 이벤트 | "state 업데이트 / 토큰 / 커스텀" 세 모드 |
| 이벤트 메타 | `event`+`name`+`run_id`+`parent_ids`+`tags`+`metadata`+`data` | `type`+`ns`+`data` (v2) |
| 성격 | 고수준, 세밀한 observability (어떤 도구·서브에이전트가 언제 시작/종료) | 저수준, mode 지향 |

### 우리 프로젝트는 쓰고 있나? — **예 ✅ (단 자체 어댑터 경유)**

| 실행 경로 | 사용 API | 분류 |
|-----------|---------|------|
| `deepagent_bridge.py` — 모든 deepagents 에이전트 실행 (메인 경로) | `astream_events(version="v2")` | **Event streaming** ✅ |
| `langgraph_service.py` — 워크플로우 v1 runs 전용 (레거시) | `astream(stream_mode=["updates","messages"])` | Streaming (`stream_mode`) |

`AGENTS.md` 대로 모든 에이전트 실행은 `deepagent_bridge` 로 일원화 → **현재 주력 경로(에이전트
채팅)는 Event streaming(`astream_events`)을 쓴다.**

### 단, 한 가지 뉘앙스
"Event streaming **API 를 쓴다**" 는 맞지만, **deepagents native 이벤트를 그대로 프론트에
노출하지는 않는다.** 2단 자체 어댑터를 거친다:

```
astream_events (raw) → _pump_astream_events (표준 이벤트로 1차 변환)
  → hitl_gateway emit → external_event_adapter (chat.* 로 2차 변환) → 프론트
```

정리:
- "Event streaming API(`astream_events`)를 메커니즘으로 쓰나?" → **예** ✅
- "deepagents 가 의도한 native 이벤트 포맷을 그대로 활용하나?" → 아니오, 자체 `chat.*` 포맷으로 변환
- `stream_mode="custom"` / `get_stream_writer` 등 "Streaming" 페이지 API 는 메인 경로 미사용

> 정정 이력: 이전 Q2/`plan.md` 에서 Streaming 을 ✅, Event streaming 을 ⚠️ 로 적었으나
> 둘 다 `astream_events` 를 근거로 들어 conflate 되어 있었음 — Event streaming ✅(자체
> 어댑터 경유), Streaming(`stream_mode`)은 메인 경로 미사용으로 정정함.

---

## Q14. 사용자가 채팅에 파일을 올리면 어디에 저장되고, sandbox 는 언제 쓰이나?

**호스트 디스크 + DB 두 군데에 영속화되고, sandbox 컨테이너로의 sync 는 "에이전트 turn
시작 시점" 에 일어난다.** Anthropic API 나 외부 스토리지에는 안 올라간다.

### 업로드 파이프라인

```
agent-web (FormData)
  → apps/api  POST /threads/:threadId/attachments
      (multer 받음 + multipart filename latin-1 → utf-8 보정)
    → apps/agent-runner-py  POST /api/v1/threads/{thread_id}/attachments
      ├─ 호스트 디스크에 저장
      │   path: ./data/attachments/{threadId}/{attachmentId}-{safeName}
      └─ DB INSERT: thread_attachments
          (id, threadId, uploaderId, originalName, mimeType, size, storage_path)
```

- 외부 스토리지(S3/GCS) 미사용. **runner 호스트 로컬 디스크에만 쌓임** → 멀티 인스턴스
  배포 시 인스턴스별로 파일이 흩어진다 (현재는 단일 인스턴스 전제)
- 제약: `ATTACHMENT_MAX_BYTES=50MB`, path traversal 차단(`_safe_name` — basename + `..`
  거부 + null byte 제거 + 200자 컷)
- 다운로드/삭제는 같은 라우터에서 디스크 + DB 동기 처리. thread 삭제 시
  `delete_all_for_thread` 가 `data/attachments/{threadId}/` 디렉터리 통째로 `shutil.rmtree`

### Sandbox 가 사용되는 시점 — "업로드 시" 가 아니라 "에이전트 turn 시작 시"

업로드 자체는 sandbox 와 무관 — 호스트 디스크 + DB 만 건드린다. **컨테이너는 에이전트가
실행될 때 lazy 로 생성**된다.

```
[업로드 순간]        호스트 디스크 + DB 만 ─── sandbox 안 만듦
[에이전트 turn 진입] SandboxManager.get_or_create(thread_id)
                     → 없으면 docker run agentstudio-sandbox:0.1 (sleep infinity)
                     → AttachmentSyncMiddleware 가 매 turn 직전:
                         attachments_service.list_for_thread(thread_id)
                         → 호스트 파일 read_bytes
                         → sandbox.aupload_files(...) (docker put_archive)
                         → /workspace/<originalName> 으로 적재
                     → system_prompt 에 build_attachment_hint() 로 안내 추가
                     → step_limit ≥ 60 으로 상향 (파싱 재시도 여유)
[에이전트가 read_file/execute 호출] docker exec sh -c <cmd> (workdir=/workspace)
```

### Sandbox 컨테이너 스펙 (`docker_sandbox.py`)

| 항목 | 값 |
|------|----|
| 이미지 | `agentstudio-sandbox:0.1` (pypdf/pymupdf/python-docx/openpyxl/pandas/matplotlib/pillow 사전 설치) |
| 단위 | **thread 1개 = 컨테이너 1개** (`labels={"agentstudio.sandbox.thread_id": ...}`) |
| 격리 | `cap_drop=ALL`, `no-new-privileges`, `network_mode=bridge` (MVP — 운영 시 모니터링 필요) |
| 리소스 | mem 512MB, 1 CPU (`cpu_period=100000, cpu_quota=100000`) |
| 라이프사이클 | lazy 생성 / **idle 30분 시 자동 stop+remove** (`_sweep_loop`, 60초 간격 sweep) / thread archive 시 명시적 `release()` |
| workdir | `/workspace` (= deepagents 가 파일을 보는 경로, attachments sync 타겟) |
| 실행 timeout | `execute` 도구 기본 120s — 초과 시 exit_code=124, 컨테이너 자체는 살아남음 |

### Q9-Q11 과의 차이 — 우리는 로컬 Docker 를 직접 쓴다

Q9-Q11 은 Modal/Daytona/Runloop 같은 **원격 호스팅 sandbox provider** 를 전제로 설명했지만,
agent002 는 **로컬 docker 데몬을 `docker.from_env()` 로 직접 제어**한다.

| | 공식 문서 권장 (Q9-Q11) | agent002 현재 |
|--|------------------------|----------------|
| 컨테이너 호스팅 | Modal/Daytona/Runloop/LangSmith 원격 | **로컬 docker 데몬** |
| Backend 구현 | provider SDK 어댑터 | 자체 `DockerSandbox(BaseSandbox)` |
| 식별/재사용 | `labels={"thread_id": ...}` 로 find_one | 동일 패턴 (`SANDBOX_LABEL_KEY`) ✅ |
| idle 정리 | provider `auto_delete_interval` TTL | 자체 `_sweep_loop` (30분) |
| 첨부 영속화 | StoreBackend + SandboxSyncMiddleware 권장 | **DB(`thread_attachments`) + 호스트 디스크 + 매 turn upload** |

**Q11 의 불일치 위험 (history 살아있는데 sandbox 파일 사라짐) 은 우리에게 해당 없음** —
첨부 원본은 DB + 호스트 디스크에 영속, sandbox 는 매 turn 새로 sync 되므로 idle 정리로
컨테이너가 사라져도 다음 turn 에 다시 복원된다. 단 **에이전트가 sandbox 안에서 생성한
중간 산출물**(예: `/workspace/results.csv` 같이 LLM 이 직접 만든 파일)은 컨테이너 정리 시
사라진다는 점은 동일하게 적용된다.

### OpenAI 경로 보조 — PDF text 변환 미들웨어

OpenAI Chat Completions 는 `type:"file"` content block 미지원이라 PDF 첨부가 400 으로 깨진다.
`FileBlockToTextMiddleware` 가 provider=openai 일 때만 동작하여:
- PDF: `extract_pdf_text()`(pymupdf → pypdf 폴백) 로 평문 추출 (메시지당 50K 자 컷)
- 비-PDF 바이너리: "`/workspace/<filename>` 를 `read_file`/`execute` 로 파싱하세요" 안내 텍스트로 치환

Anthropic/Gemini 는 PDF document 블록 네이티브 지원이라 변환 미동작 (회귀 방지).

### 한 줄 요약

업로드 → **호스트 디스크 + DB 영속** (외부 스토리지/Anthropic API 미전송).
에이전트 turn 시작 → **thread 별 Docker 컨테이너 lazy 생성** + `/workspace/<원본명>` 으로
자동 sync. idle 30분 후 컨테이너만 정리되고 첨부 원본은 그대로 보존되어 다음 turn 에
다시 복원된다.

---

## Q15. Slack·MCP·서비스 간 통신 방식은 각각 무엇인가?

**"Slack 은 WebSocket, MCP 는 HTTP" 가 큰 그림으로는 맞지만, MCP 는 transport 가 3종
이라 엄밀히는 transport 에 따라 갈린다.** 전체 통신 맵:

| 구간 | 주체 | 방식 |
|------|------|------|
| **Slack ↔ API** | Bolt App (`@slack/bolt`) | **WebSocket** (Socket Mode) — 공개 webhook URL 불필요 |
| **API ↔ Runner** | NestJS → FastAPI | HTTP REST (`POST /api/v1/threads/{id}/invoke`, `X-API-Key`) |
| **Web ↔ Runner** | 채팅 스트리밍 | WebSocket (socket.io, `hitl_gateway`) |
| **Runner ↔ MCP 서버** | `mcp_client_service` | **transport별로 다름** (아래) |

### Slack — Socket Mode (WebSocket)

코드: `apps/api/src/modules/slack/slack-runtime.service.ts`

- 서버 기동 시 `onModuleInit` 에서 `enabled` 설치 정보(`SlackInstallation`)를 DB 조회 →
  복호화한 `botToken`+`appToken` 으로 Bolt `App` 을 `socketMode: true` 로 시작
  (`slack-runtime.service.ts:108`). Slack 과 양방향 WebSocket 연결, **공개 엔드포인트 불필요**
- 수신 이벤트: `app_mention`(채널 멘션) / `message`(channel_type==='im' DM만).
  `event_ts` 기준 in-memory `DedupeSet`(TTL 5분)으로 중복 제거
- 라우팅: `(workspaceTeamId, channelId, mode)` 로 응답할 Agent 매핑 조회
  (정확 매칭 우선, 없으면 `both` fallback). 매핑 없으면 무시
- 실행: Slack `thread_ts` ↔ AgentStudio `Thread` 를 metadata 로 매핑(같은 스레드면 재사용) →
  설치 admin 자격증명 복호화 → **runner 로 내부 HTTP 호출** → 응답을
  `client.chat.postMessage` 로 채널/스레드에 게시
- 인증 모델: 사용자별 실행이 아니라 **설치한 admin(`installedByUserId`) 자격증명으로 실행**,
  단일 워크스페이스 MVP. dedupe 는 in-memory(서버 재시작 시 초기화·다중 인스턴스 미공유)

### MCP — transport 3종 (stdio / sse / streamable_http)

코드: `apps/agent-runner-py/src/modules/mcp/mcp_client_service.py` (`:18-72`)

| transport | 통신 | 설명 |
|-----------|------|------|
| **`stdio`** (기본값) | 표준입출력 (HTTP 아님) | 로컬 MCP 서버 프로세스를 `spawn`(`npx` 등)해 stdin/stdout 으로 통신 |
| **`sse`** | HTTP | Server-Sent Events |
| **`streamable_http`** | HTTP | 현재 코드상 `sse_client` 로 함께 처리 (`:55-60`) |

`server.get("transport", "stdio")` — **기본값이 `stdio`**. 즉 MCP 는 "원격 서버일 때만
HTTP(sse/streamable_http)이고, 로컬 MCP 서버는 stdio 로 프로세스를 띄워 표준입출력으로
통신" 한다.

### 한 줄 요약

Slack 은 Socket Mode **WebSocket** 으로 API 와, API→Runner 는 **내부 HTTP REST** 로,
MCP 는 **transport 에 따라 stdio(프로세스 spawn) 또는 HTTP(sse/streamable_http)** 로 통신한다.
"MCP=HTTP, Slack=WebSocket" 은 맞지만 MCP 기본값은 stdio 라는 점이 포인트.
