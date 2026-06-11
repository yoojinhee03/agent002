#!/bin/bash
set -euo pipefail

# ============================================================
# AgentStudio Production Deploy Script
# Usage: ./scripts/deploy.sh [--build] [--seed]
#
# 참고: DB 마이그레이션은 api 컨테이너 시작 시 자동 실행됩니다.
#       --seed: 최초 배포 시 초기 데이터 삽입
# ============================================================

COMPOSE_FILE="docker-compose.prod.yml"
BUILD=false
SEED=false

for arg in "$@"; do
  case $arg in
    --build)   BUILD=true ;;
    --seed)    SEED=true ;;
    --migrate) echo "참고: 마이그레이션은 컨테이너 시작 시 자동 실행됩니다." ;;
    *)         echo "Unknown option: $arg"; exit 1 ;;
  esac
done

echo "=== AgentStudio Deploy ==="

# .env 파일 확인
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example and fill in values."
  exit 1
fi

# 이미지 빌드
if [ "$BUILD" = true ]; then
  echo ""
  echo "[1] Building images..."
  docker compose -f "$COMPOSE_FILE" build
fi


# 인프라 먼저 기동
echo ""
echo "[2] Starting infrastructure (postgres, redis)..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis

echo "Waiting for postgres to be healthy..."
until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "${POSTGRES_USER:-agentstudio}" > /dev/null 2>&1; do
  echo "  -> waiting..."
  sleep 2
done
echo "  -> postgres ready!"

# API 서버 기동 (entrypoint에서 마이그레이션 자동 실행)
echo ""
echo "[3] Starting api server (migrations will run automatically)..."
docker compose -f "$COMPOSE_FILE" up -d api

# api가 healthy 상태가 될 때까지 대기
echo "Waiting for api to be healthy..."
WAIT=0
until docker compose -f "$COMPOSE_FILE" ps api | grep -q "healthy" 2>/dev/null; do
  if [ $WAIT -ge 60 ]; then
    echo "ERROR: api container failed to become healthy after 60s."
    echo "Run: docker compose -f $COMPOSE_FILE logs api"
    exit 1
  fi
  sleep 3
  WAIT=$((WAIT + 3))
done
echo "  -> api ready!"

# 시드 데이터 삽입
if [ "$SEED" = true ]; then
  echo ""
  echo "[4] Seeding database..."
  docker compose -f "$COMPOSE_FILE" exec api \
    sh -c "cd /app && ./node_modules/.bin/tsx prisma/seed.ts" \
    || echo "  -> seed skipped (may already be seeded)"
fi

# 나머지 서비스 기동
echo ""
echo "[5] Starting remaining services..."
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo "[6] Checking service status..."
sleep 5
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "=== Deploy Complete ==="
echo ""
echo "Services:"
echo "  Frontend:    http://localhost"
echo "  API Docs:    http://localhost/api/docs"
echo "  API Service: http://localhost/api/v1/docs"
echo "  Health:      http://localhost/api/v1/health"
