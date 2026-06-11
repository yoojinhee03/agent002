# 카드 빌더 매뉴얼 (Adaptive Cards)

> AgentStudio 의 동적 카드는 **OSS [Adaptive Cards](https://adaptivecards.io/)** 로 정의·렌더된다.
> 위치: `/cards` (목록) · `/cards/builder/[cardId]` (편집기) — 사이드바 **Cards** 메뉴 (admin 전용)

---

## 1. 개념

### 1-1. 카드 정의 (CardDefinition)
동적 카드는 **Adaptive Card payload(JSON) + 샘플 데이터** 로 구성된다.

```jsonc
{
  "cardId":     "hitl-input-card",   // 사용자 정의 키 (immutable)
  "version":    1,                    // 발행할 때마다 +1, 같은 버전은 내용 고정
  "category":   "hitl",              // hitl | response — 발행 시점/맥락
  "payload":    { /* Adaptive Card (adaptivecards-templating 의 ${...} 바인딩 가능) */ },
  "sampleData": { /* 미리보기 / 런타임 fallback 데이터 */ }
}
```

- **payload** — Adaptive Card 표준 JSON. `body`(요소 배열) + `actions`(버튼). `${expr}` 로 데이터 바인딩, `$when` 으로 조건부 표시.
- **sampleData** — 빌더 미리보기에 주입하고, 런타임에 누락 키의 fallback 으로 쓰인다.

### 1-2. immutable + version
- 같은 `(cardId, version)` 은 한 번 발행되면 내용 고정. 수정 시 빌더가 자동으로 `latest + 1` 로 발행.
- 프론트는 `(cardId, version)` 으로 메모리 캐싱하므로 무효화 부담 없음.

---

## 2. 빌더 화면

```
┌───────────────────────────────────────────────┐
│ ← Back   cardId · 이름 · category    [리셋][발행] │
├───────────────────────────────────────────────┤
│ Adaptive Card payload (JSON)  │  미리보기        │
│                               │ (sampleData 주입) │
│ ───────────────────────────── │                  │
│ 샘플 데이터 (JSON)             │                  │
└───────────────────────────────────────────────┘
```

- 왼쪽 위: **payload** Monaco 에디터 (Adaptive Card JSON).
- 왼쪽 아래: **샘플 데이터** Monaco 에디터.
- 오른쪽: **라이브 미리보기** — payload 를 sampleData 로 템플릿 확장해 실시간 AC 렌더.
- payload JSON 파싱 오류 시 상단 노란 배너 + 미리보기 비활성.

---

## 3. 데이터 바인딩 (adaptivecards-templating)

payload 안에서 `${...}` 로 data 를 바인딩한다. data 의 루트는 `$root`.

| 문법 | 의미 |
|------|------|
| `${fieldName}` | data 의 필드 값 |
| `${if(a, b, c)}` | 조건 표현식 |
| `${contains(list, x)}` | 배열 포함 여부 |
| `"$when": "${expr}"` | 요소/액션 조건부 표시 (false 면 렌더 안 함) |

예:
```jsonc
{ "type": "TextBlock", "text": "현재 점수: ${score}점" }
{ "type": "TextBlock", "text": "${prompt}", "$when": "${prompt != null && prompt != ''}" }
```

> 전체 함수 목록: [Adaptive Cards Templating 문서](https://learn.microsoft.com/en-us/adaptive-cards/templating/).

---

## 4. 액션 → 핸들러 브리지

카드 버튼은 `Action.Submit` 으로 만들고, `data.__handler` 에 동작 의도를 담는다.
`Action.Submit` 제출 시 카드의 모든 `Input.*` 값이 data 에 머지되므로 사용자 입력도 함께 전달된다.

```jsonc
{
  "type": "Action.Submit",
  "title": "허용",
  "style": "positive",
  "data": { "__handler": "hitl_respond", "decision": "approve", "interactionId": "${interactionId}" }
}
```

### 4-1. 지원 핸들러 (`__handler`)
| `__handler` | 동작 | 필요 data 키 |
|-------------|------|-------------|
| `dismiss` | 카드 닫기 | — |
| `send_message` | LLM 에게 사용자 발화 전송 | `message` |
| `tool_call` | TOOL_REGISTRY 도구 호출 | `tool`, `args` |
| `navigate` | 내부 라우터 이동 | `href` |
| `external_link` | 새 탭으로 URL 열기 (Action.OpenUrl 도 가능) | `url` |
| `hitl_respond` | runner HITL interaction 응답 | `interactionId`, `decision`, (`value`/`toolName`+`editedArgsJson`) |

### 4-2. hitl_respond decision
`approve` / `reject` / `edit` / `respond` / `cancel`
- `respond`: `value` 또는 `Input.Text id="responseText"` 값을 응답으로 전송.
- `edit`: `toolName` + `Input.Text id="editedArgsJson"`(JSON 문자열) 로 수정 실행.

### 4-3. 외부 링크
`Action.OpenUrl` 은 별도 `__handler` 없이 브리지가 직접 새 탭으로 연다.

---

## 5. 시드 카드 (참고 템플릿)

| cardId | 용도 | 핵심 요소 |
|--------|------|----------|
| `hitl-input-card` | HITL 도구 실행 승인 | TextBlock, ActionSet(허용/거부), ShowCard(Input.Text 인자 수정) |

> recursion limit 확인은 별도 카드 정의를 사용하지 않는다. `HitlAcCard` 가 `recursionLimitReached` 플래그를 받으면 인라인 amber variant(`HitlRecursionVariant`)로 직접 렌더한다.

`/cards` 목록에서 "복제" 로 출발점으로 쓸 수 있다.

---

## 6. 발행 → 사용 흐름

```
[빌더] 발행 → POST /api/cards (cardId, version=latest+1, category, payload, sampleData)

[Agent 빌더] OutputSchema 탭
  └─ outputSchema.x-agent-studio.cardMappings 에 cardId/version/dataPath 매핑

[runner] LLM 응답 → cardMappings 조회 → emit WS agent.dynamic_card

[프론트] WS 수신 → DynamicCardRenderer → useCardDefinitionsStore.get(cardId, version)
         → AdaptiveCardHost (템플릿 확장 → AC 렌더 → 액션 dispatch)
```

HITL 은 interaction 의 `agentContext.cardDefinitionId` 로 카드(예: `hitl-input-card`)를 지정해 인라인 렌더된다. recursion limit 흐름은 카드 정의를 사용하지 않고 클라이언트의 amber variant 가 직접 렌더한다.

---

## 7. 관련 파일

| 역할 | 경로 |
|------|------|
| AC 렌더 호스트 | `apps/agent-web/src/components/dynamic-cards/AdaptiveCardHost.tsx` |
| 액션 브리지 | `apps/agent-web/src/components/dynamic-cards/adaptive/actionBridge.ts` |
| 다크 테마 HostConfig | `apps/agent-web/src/components/dynamic-cards/adaptive/hostConfig.ts` |
| 핸들러 dispatch | `apps/agent-web/src/components/dynamic-cards/handlers.ts` |
| 빌더 페이지 | `apps/agent-web/src/app/(dashboard)/cards/builder/[cardId]/page.tsx` |
| 카드 목록 | `apps/agent-web/src/app/(dashboard)/cards/page.tsx` |
| 캐시 store | `apps/agent-web/src/stores/use-card-definitions-store.ts` |
| 관리 API | `apps/api/src/modules/cards/` |
| 시드 카드 | `apps/api/src/system-seeds/cards/*.json` |
| DB 모델 | `packages/database/prisma/schema.prisma` (CardDefinition: payload + sampleData) |
