-- AlterTable: tool_groups에 내부 서비스 연동 필드 추가
ALTER TABLE "tool_groups" ADD COLUMN IF NOT EXISTS "spec_url" TEXT;
ALTER TABLE "tool_groups" ADD COLUMN IF NOT EXISTS "auth_config" JSONB;
