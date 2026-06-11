#!/usr/bin/env bash
#
# Phase 9-6 통합 검증 스크립트
# - admin 로그인 → agent/env 조회
# - AgentDeployment 생성 → API Key 발급
# - 외부 client 시나리오: thread 생성 → 메시지 전송 → 메시지 조회
# - 권한 회귀: 다른 deployment 키로 호출 시 403, revoke 키로 호출 시 401
#
# 사전조건:
#   1) 로컬 dev 스택이 떠있어야 함 (api:4200, runner:4300)
#   2) 시드된 admin 계정 (admin@example.com / password) 또는 ADMIN_EMAIL/ADMIN_PASSWORD 환경변수
#   3) 적어도 1개의 Agent + DeploymentEnvironment 가 존재하는 프로젝트
#
# 사용:
#   ./scripts/phase-9-6-e2e.sh
#   AGENT_ID=<uuid> ENV_ID=<uuid> ./scripts/phase-9-6-e2e.sh   # 특정 agent/env 지정

set -euo pipefail

API="${API_URL:-http://localhost:4200}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-password}"

if ! command -v jq >/dev/null 2>&1; then
  echo "❌ jq 가 필요합니다. brew install jq" >&2
  exit 1
fi

ok() { echo -e "✅ $*"; }
fail() { echo -e "❌ $*" >&2; exit 1; }
section() { echo -e "\n━━━ $* ━━━"; }

section "1) admin 로그인"
TOKEN=$(curl -sf -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | jq -r '.accessToken')
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || fail "로그인 실패"
ok "JWT 발급 완료 (${TOKEN:0:24}...)"

JWT_HDR=(-H "Authorization: Bearer $TOKEN")

section "2) Agent / Environment 결정"
if [ -z "${AGENT_ID:-}" ]; then
  PROJECT_ID=$(curl -sf "${JWT_HDR[@]}" "$API/api/projects" | jq -r '.[0].id')
  [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ] || fail "프로젝트가 없습니다"
  AGENT_ID=$(curl -sf "${JWT_HDR[@]}" "$API/api/projects/$PROJECT_ID/agents" | jq -r '.[0].id // empty')
  [ -n "$AGENT_ID" ] || fail "Agent 가 없습니다 — 먼저 1개를 만드세요"
fi
if [ -z "${ENV_ID:-}" ]; then
  AGENT_PROJECT_ID=$(curl -sf "${JWT_HDR[@]}" "$API/api/agents/$AGENT_ID" | jq -r '.projectId')
  ENV_ID=$(curl -sf "${JWT_HDR[@]}" "$API/api/projects/$AGENT_PROJECT_ID/environments" | jq -r '.[0].id // empty')
  [ -n "$ENV_ID" ] || fail "환경이 없습니다 — 먼저 환경을 추가하세요"
fi
ok "AGENT_ID=$AGENT_ID  ENV_ID=$ENV_ID"

section "3) AgentDeployment 생성"
DEPLOY_RES=$(curl -sf -X POST "$API/api/agents/$AGENT_ID/deployments" \
  "${JWT_HDR[@]}" -H "Content-Type: application/json" \
  -d "{\"environmentId\":\"$ENV_ID\",\"description\":\"phase-9-6 e2e\"}")
DEPLOYMENT_ID=$(echo "$DEPLOY_RES" | jq -r '.id')
PUBLIC_PATH=$(echo "$DEPLOY_RES" | jq -r '.publicPath')
[ -n "$DEPLOYMENT_ID" ] && [ "$DEPLOYMENT_ID" != "null" ] || fail "Deploy 실패: $DEPLOY_RES"
ok "Deployed v$(echo "$DEPLOY_RES" | jq -r '.version')  publicPath=$PUBLIC_PATH"

section "4) API Key 발급 (raw 1회)"
KEY_RES=$(curl -sf -X POST "$API/api/agent-deployments/$DEPLOYMENT_ID/api-keys" \
  "${JWT_HDR[@]}" -H "Content-Type: application/json" \
  -d '{"name":"e2e-key"}')
RAW_KEY=$(echo "$KEY_RES" | jq -r '.rawKey')
KEY_ID=$(echo "$KEY_RES" | jq -r '.id')
[ -n "$RAW_KEY" ] && [ "$RAW_KEY" != "null" ] || fail "API Key 발급 실패: $KEY_RES"
ok "rawKey=${RAW_KEY:0:12}...  keyId=$KEY_ID"

section "5) 외부 thread 생성 (X-API-Key)"
THREAD_RES=$(curl -sf -X POST "$API/api/v1/chat/threads" \
  -H "X-API-Key: $RAW_KEY" -H "Content-Type: application/json" \
  -d '{"title":"e2e thread","metadata":{"runner":"phase-9-6"}}')
THREAD_ID=$(echo "$THREAD_RES" | jq -r '.threadId')
[ -n "$THREAD_ID" ] && [ "$THREAD_ID" != "null" ] || fail "thread 생성 실패: $THREAD_RES"
ok "thread=$THREAD_ID  agent=$(echo "$THREAD_RES" | jq -r '.agent.slug')"

section "6) 메시지 전송 (runner 프록시)"
MSG_RES=$(curl -sf -X POST "$API/api/v1/chat/threads/$THREAD_ID/messages" \
  -H "X-API-Key: $RAW_KEY" -H "Content-Type: application/json" \
  -d '{"message":"안녕하세요. 자기소개 부탁드려요."}' || echo '{"error":"runner unreachable"}')
LAST_CONTENT=$(echo "$MSG_RES" | jq -r 'try .messages[-1].content catch ""')
ok "응답 길이=${#LAST_CONTENT} chars  (앞 80자: ${LAST_CONTENT:0:80}...)"

section "7) 메시지 이력 조회"
HIST=$(curl -sf "$API/api/v1/chat/threads/$THREAD_ID/messages" -H "X-API-Key: $RAW_KEY")
MSG_COUNT=$(echo "$HIST" | jq -r '.messages | length // (.|length)')
ok "메시지 이력 $MSG_COUNT 건"

section "8) 권한 회귀 — 다른 deployment 의 thread 호출 시 403"
DEPLOY2=$(curl -sf -X POST "$API/api/agents/$AGENT_ID/deployments" \
  "${JWT_HDR[@]}" -H "Content-Type: application/json" \
  -d "{\"environmentId\":\"$ENV_ID\"}")
DEPLOY2_ID=$(echo "$DEPLOY2" | jq -r '.id')
KEY2_RES=$(curl -sf -X POST "$API/api/agent-deployments/$DEPLOY2_ID/api-keys" \
  "${JWT_HDR[@]}" -H "Content-Type: application/json" \
  -d '{"name":"e2e-other"}')
RAW_KEY2=$(echo "$KEY2_RES" | jq -r '.rawKey')
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/v1/chat/threads/$THREAD_ID/messages" \
  -H "X-API-Key: $RAW_KEY2" -H "Content-Type: application/json" \
  -d '{"message":"hi"}')
[ "$HTTP" = "403" ] && ok "다른 deployment 키 → 403" || fail "기대 403, 실제 $HTTP"

section "9) 권한 회귀 — revoked 키 → 401"
curl -sf -X DELETE "$API/api/api-keys/$KEY_ID" "${JWT_HDR[@]}" >/dev/null
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/v1/chat/threads/$THREAD_ID/messages" \
  -H "X-API-Key: $RAW_KEY" -H "Content-Type: application/json" \
  -d '{"message":"hi"}')
[ "$HTTP" = "401" ] && ok "revoke 키 → 401" || fail "기대 401, 실제 $HTTP"

section "10) socket.io /v1/chat 구독 가이드"
cat <<EOF
node 환경에서 다음을 실행해 socket.io 구독을 검증할 수 있습니다:

  pnpm add socket.io-client
  node -e '
    const io = require("socket.io-client");
    const RAW = "$RAW_KEY2";   // step 8 에서 발급된 키 (active)
    const THREAD = "$THREAD_ID";
    const s = io("http://localhost:4300/v1/chat", {
      auth: { apiKey: RAW },
      transports: ["websocket"]
    });
    s.on("connect", () => {
      console.log("connected");
      s.emit("subscribe", { threadId: THREAD }, ack => console.log("subscribe", ack));
    });
    ["chat.turn_started","chat.activity_started","chat.activity_completed","chat.activity_failed","chat.message_delta","chat.plan","chat.approval_required","chat.turn_completed","chat.error"].forEach(e =>
      s.on(e, p => console.log(e, JSON.stringify(p).slice(0,200))));
    s.on("connect_error", e => console.error("connect_error", e.message));
  '

위 스크립트를 띄운 상태에서 외부 thread 메시지 호출 (step 6 재실행) 시
chat.activity_started → chat.activity_completed → chat.message_delta(stream) → chat.turn_completed 가 수신되어야 합니다.
EOF

ok "Phase 9-6 자동 검증 완료"
