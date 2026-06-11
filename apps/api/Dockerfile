# ---- Base ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ---- Install dependencies ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .

# Build shared package first
RUN pnpm --filter @agent-studio/shared build

# Generate Prisma client
RUN cd apps/api && node_modules/.bin/prisma generate --schema=../../packages/database/prisma/schema.prisma

# Build API
RUN pnpm --filter @agent-studio/api build

# pnpm deploy: 심볼릭 링크 없이 평탄화된 node_modules 생성
RUN pnpm deploy --filter @agent-studio/api --prod /prod/api --legacy

# production node_modules에 Prisma 클라이언트 생성
RUN mkdir -p /prod/api/prisma && cp packages/database/prisma/schema.prisma /prod/api/prisma/schema.prisma
RUN cd /prod/api && node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

# ---- Production ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache su-exec netcat-openbsd
RUN addgroup --system --gid 1001 nestjs
RUN adduser --system --uid 1001 nestjs

# pnpm deploy로 생성된 평탄화된 node_modules
COPY --from=build /prod/api/node_modules ./node_modules
# 앱 빌드 결과물
COPY --from=build /app/apps/api/dist ./dist
# Prisma 스키마 + 마이그레이션
COPY --from=build /app/packages/database/prisma /app/prisma
# COPY --from=build /app/apps/api/prisma ./prisma # apps/api/prisma doesn't exist

COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 4000
ENV PORT=4000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
