# AgentStudio 설치 및 운영 가이드

## 목차

1. [사전 요구사항](#1-사전-요구사항)
2. [프로젝트 클론](#2-프로젝트-클론)
3. [개발 환경](#3-개발-환경)
4. [프로덕션 환경](#4-프로덕션-환경)
5. [구동 / 중지 / 재시작](#5-구동--중지--재시작)
6. [초기화 및 재설치](#6-초기화-및-재설치)
7. [서비스 구성](#7-서비스-구성)
8. [자주 묻는 문제](#8-자주-묻는-문제)

---

## 1. 사전 요구사항

| 도구 | 버전 | 확인 명령 |
|------|------|-----------|
| Node.js | 22+ | `node -v` |
| pnpm | 10+ | `pnpm -v` |
| Python | 3.11+ | `python3 --version` |
| uv | 0.5+ | `uv --version` |
| Docker | 24+ | `docker -v` |
| Docker Compose | 2.20+ | `docker compose version` |

**pnpm 설치 (미설치 시)**
```bash
npm install -g pnpm
```

**uv 설치 (미설치 시)** — Python 패키지 매니저 (agent-runner-py, deepagent-sdk용)
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

---

## 2. 프로젝트 클론

```bash
git clone <repository-url> agent-studio
cd agent-studio
```

---

## 3. 개발 환경

개발 환경은 **PostgreSQL + Redis만 Docker로 실행**하고, 앱(agent-web/api/agent-runner-py)은 로컬에서 직접 실행합니다.

### 3-1. 의존성 설치

```bash
pnpm install
```

### 3-2. 환경 변수 설정

각 앱 및 packages/database 디렉토리에 `.env` 파일을 생성합니다.

**`packages/database/.env`**
```bash
DATABASE_URL=postgresql://agentstudio:eldnlrtm!23@localhost:5433/agentstudio
```

**`apps/api/.env`**
```bash
DATABASE_URL=postgresql://agentstudio:eldnlrtm!23@localhost:5433/agentstudio
REDIS_URL=redis://:agentstudio@localhost:6380
JWT_SECRET=dev-jwt-secret-min-32-chars-long!!
JWT_REFRESH_SECRET=dev-refresh-secret-min-32-chars!!
PORT=4200
```

**`apps/agent-runner-py/.env`** (FastAPI, 기본 실행 엔진)
```bash
DATABASE_URL=postgresql://agentstudio:eldnlrtm!23@localhost:5433/agentstudio
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=eldnlrtm!23
PORT=4300
```

**`apps/agent-web/.env.local`**
```bash
NEXT_PUBLIC_API_URL=http://localhost:4200
NEXT_PUBLIC_RUNNER_URL=http://localhost:4300
```

### 3-3. 인프라 실행 (DB + Redis)

```bash
docker compose up -d
```

실행 확인:
```bash
docker compose ps
# postgres (5433), redis (6380) 모두 healthy 상태여야 함
```

### 3-4. DB 마이그레이션 및 시드 데이터

```bash
# 루트에서 실행 (packages/database에서 Prisma 스키마 관리)
pnpm db:push           # 테이블 생성
pnpm db:seed           # 초기 데이터 (관리자 계정, AI 프로바이더 등)
```

시드 데이터로 생성되는 기본 계정:

| 이메일 | 비밀번호 | 역할 |
|--------|----------|------|
| `admin@example.com` | `password` | 관리자 |
| `member@example.com` | `password` | 일반 멤버 |

### 3-5. Python 실행 엔진 의존성 설치 (agent-runner-py)

```bash
cd apps/agent-runner-py
uv sync          # pyproject.toml 의존성 설치 (deepagent-sdk 포함, editable)
cd ../..
```

### 3-6. 앱 실행

```bash
# Node.js 앱 동시 실행 (API + Web)
pnpm dev
```

개별 실행:
```bash
pnpm --filter @agent-studio/api dev      # API: http://localhost:4200
pnpm --filter @agent-studio/web dev      # Web: http://localhost:3001

# Python 실행 엔진 (별도 터미널)
cd apps/agent-runner-py
uv run uvicorn src.main:app --port 4300 --reload
```

---

## 4. 프로덕션 환경

프로덕션은 **모든 서비스를 Docker 컨테이너**로 실행합니다.

### 4-1. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 필수 값을 입력합니다:

```bash
# ── Database ──────────────────────────────────────────
POSTGRES_DB=agentstudio
POSTGRES_USER=agentstudio
POSTGRES_PASSWORD=agentstudio          # 필수 변경 권장

# ── Redis ─────────────────────────────────────────────
REDIS_PASSWORD=eldnlrtm!23             # 필수 변경 권장

# ── Auth (최소 32자 랜덤 문자열) ───────────────────────
JWT_SECRET=랜덤_32자_이상_문자열              # 필수 변경
JWT_REFRESH_SECRET=랜덤_32자_이상_문자열      # 필수 변경

# ── Encryption ────────────────────────────────────────
ENCRYPTION_KEY=랜덤_32바이트_16진수           # 필수 변경

# ── CORS ──────────────────────────────────────────────
CORS_ORIGINS=https://your-domain.com         # 필수 변경
```

### 4-2. 최초 배포

```bash
./scripts/deploy.sh --build --seed
```

---

## 5. 구동 / 중지 / 재시작

### 프로덕션 환경 (전체 Docker)

```bash
# 전체 시작
docker compose -f docker-compose.prod.yml up -d

# 전체 중지 (데이터 보존)
docker compose -f docker-compose.prod.yml stop

# 특정 서비스만 재시작
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml restart agent-web

# 상태 확인
docker compose -f docker-compose.prod.yml ps

# 로그 확인
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f agent-web
```

---

## 6. 초기화 및 재설치

### 완전 초기화 (데이터 모두 삭제)

> **주의: DB 데이터가 전부 삭제됩니다.**

```bash
# 개발 환경
docker compose down -v
docker compose up -d
pnpm db:push && pnpm db:seed

# 프로덕션
docker compose -f docker-compose.prod.yml down -v --rmi all --remove-orphans
docker system prune -af --volumes
./scripts/deploy.sh --build --seed
```

---

## 7. 서비스 구성

```
┌─────────────────────────────────────────┐
│              Nginx :80                  │
│                                         │
│  /agents/*   →  agent-runner-py :4300   │
│  /api/*      →  api :4200               │
│  /           →  agent-web :3001         │
└─────────────────────────────────────────┘
         │              │              │
   ┌─────┴──────┐  ┌────┴────┐  ┌─────┴──────────┐
   │ agent-web  │  │   api   │  │agent-runner-py │
   │   :3001    │  │  :4200  │  │    :4300       │
   │  Next.js   │  │ NestJS  │  │   FastAPI      │
   └────────────┘  └────┬────┘  └──────┬─────────┘
                        │             │
                 ┌───────┴─────────────┘
                 │
     ┌──────────────────┐    ┌──────────┐
     │   PostgreSQL     │    │  Redis   │
     │   :5433          │    │  :6380   │
     └──────────────────┘    └──────────┘
```

| 서비스 | 역할 | 포트 | 인증 방식 |
|--------|------|------|-----------|
| agent-web | Next.js 프론트엔드 (워크플로우 빌더) | 3001 | — |
| api | NestJS 관리 API (워크플로우/도구/실행 기록 관리) | 4200 | JWT Bearer |
| agent-runner-py | FastAPI 실행 엔진 (Python, 기본) | 4300 | X-API-Key |
| postgres | 데이터베이스 | 5433 | — |
| redis | 캐시 + arq 큐 | 6380 | password |
| nginx | 리버스 프록시 | 80, 443 | — |

---

## 8. 자주 묻는 문제

### DB 연결 실패

`DATABASE_URL` 포트가 `5433`인지 확인합니다 (기본 5432와 다름).
사용자 아이디와 패스워드가 `agentstudio`로 설정되어 있는지 확인합니다.

### Redis 연결 실패

`REDIS_URL`에 비밀번호가 포함되어 있는지 확인합니다:
```bash
redis://:agentstudio@localhost:6380
```
