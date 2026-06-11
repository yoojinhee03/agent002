# ---- Base ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ---- Install dependencies ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/agent-web/package.json ./apps/agent-web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/agent-web/node_modules ./apps/agent-web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .

# NEXT_PUBLIC_ 변수는 빌드 타임에 번들에 포함되므로 ARG로 주입
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_API_SERVICE_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_SERVICE_URL=$NEXT_PUBLIC_API_SERVICE_URL

RUN pnpm --filter @agent-studio/shared build
RUN pnpm --filter @agent-studio/web build

# ---- Production ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=build /app/apps/agent-web/.next/standalone ./
COPY --from=build /app/apps/agent-web/.next/static ./apps/agent-web/.next/static
RUN mkdir -p ./apps/agent-web/public
COPY --from=build /app/apps/agent-web/public/ ./apps/agent-web/public/

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/agent-web/server.js"]
