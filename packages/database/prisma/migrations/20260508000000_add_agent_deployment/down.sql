-- Rollback for 20260508000000_add_agent_deployment
--
-- 주의: 이 SQL 은 agent_deployments 테이블 + api_keys/threads 의 agent_deployment_id 컬럼을 영구 삭제한다.
-- 외부 client 가 발급받은 API Key 와 외부 thread 가 모두 끊어지므로 운영 환경 적용 전 백업 필수.
--
-- 적용 방법 (수동):
--   docker exec agent002-postgres-1 psql -U agentstudio -d agentstudio \
--     -f /path/to/this/down.sql
-- 적용 후 _prisma_migrations 에서도 행을 제거해야 prisma 가 동일 마이그레이션을 다시 시도하지 않는다:
--   DELETE FROM _prisma_migrations
--   WHERE migration_name = '20260508000000_add_agent_deployment';

-- Drop foreign keys first
ALTER TABLE "threads" DROP CONSTRAINT IF EXISTS "threads_agent_deployment_id_fkey";
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_agent_deployment_id_fkey";

-- Drop indexes added on existing tables
DROP INDEX IF EXISTS "threads_agent_deployment_id_idx";
DROP INDEX IF EXISTS "api_keys_agent_deployment_id_idx";

-- Drop newly added columns
ALTER TABLE "threads" DROP COLUMN IF EXISTS "agent_deployment_id";
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "agent_deployment_id";

-- Drop the agent_deployments table (its FKs/indexes are auto-removed)
DROP TABLE IF EXISTS "agent_deployments";
