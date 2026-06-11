#!/bin/bash
# 개발서버 CI/CD 배포 스크립트 — GitLab CI에서 SSH로 호출
set -e

PROJECT_DIR="/home/workspace/agent002"
cd "$PROJECT_DIR"

echo "===== AgentStudio Dev Deploy ====="
echo "Commit: $(git rev-parse --short HEAD)"

echo ""
echo "[1/7] Node.js 의존성 설치"
pnpm install --frozen-lockfile

echo ""
echo "[2/7] Python 의존성 설치"
UV_PYTHON_INSTALL_DIR=/home/workspace/uv-python \
  uv --directory "$PROJECT_DIR/apps/agent-runner-py" sync --frozen
chown -R dweax:dweax "$PROJECT_DIR/apps/agent-runner-py/.venv"
chmod -R a+rx /home/workspace/uv-python


echo ""
echo "[3/7] Sandbox 이미지 준비 (per-thread Docker sandbox)"
SANDBOX_TAG="agentstudio-sandbox:0.1"
SANDBOX_CTX="$PROJECT_DIR/apps/agent-runner-py/docker/sandbox"
if git diff --quiet HEAD~1 HEAD -- "$SANDBOX_CTX" 2>/dev/null \
   && docker image inspect "$SANDBOX_TAG" > /dev/null 2>&1; then
  echo "  -> sandbox 이미지 변경 없음, 빌드 스킵"
else
  docker build -t "$SANDBOX_TAG" "$SANDBOX_CTX"
fi
docker volume create agentstudio-npm-cache > /dev/null
docker volume create agentstudio-uv-cache  > /dev/null
docker ps -a --filter "name=agentstudio-sandbox-" --format "{{.ID}}" \
  | xargs -r docker rm -f > /dev/null || true

echo ""
echo "[4/7] Docker 인프라 재시작 (PostgreSQL + Redis)"
docker compose down
docker compose up -d
TIMEOUT=60
ELAPSED=0
echo "DB 준비 대기 중..."
until docker compose exec -T postgres pg_isready -U agentstudio > /dev/null 2>&1; do
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "DB 시작 타임아웃 (${TIMEOUT}초)" >&2
    exit 1
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done
echo "DB 준비 완료"

echo ""
echo "[5/7] DB 마이그레이션"
pnpm db:deploy

echo ""
echo "[6/7] 빌드"
export NEXT_PUBLIC_API_URL="http://dweax.iptime.org:28001"
export NEXT_PUBLIC_RUNNER_URL="http://dweax.iptime.org:28003"
export NEXT_PUBLIC_API_SERVICE_URL="http://dweax.iptime.org:28003"
pnpm build

echo ""
echo "[6.5/7] standalone 정적 파일 복사 (next output: standalone 필수)"
WEB_OUT="$PROJECT_DIR/apps/agent-web/.next/standalone/apps/agent-web"
rm -rf "$WEB_OUT/.next/static" "$WEB_OUT/public"
cp -r "$PROJECT_DIR/apps/agent-web/.next/static" "$WEB_OUT/.next/static"
[ -d "$PROJECT_DIR/apps/agent-web/public" ] && cp -r "$PROJECT_DIR/apps/agent-web/public" "$WEB_OUT/public"

echo ""
echo "[7/7] 서비스 재시작 (PM2) — dweax 유저로 실행"
sudo -u dweax pm2 describe api > /dev/null 2>&1 \
  && sudo -u dweax pm2 reload "$PROJECT_DIR/ecosystem.config.js" --update-env \
  || sudo -u dweax pm2 start "$PROJECT_DIR/ecosystem.config.js"
sudo -u dweax pm2 save

echo ""
echo "===== 배포 완료 ====="
sudo -u dweax pm2 list
