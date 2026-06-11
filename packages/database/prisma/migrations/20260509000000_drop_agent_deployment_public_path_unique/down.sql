-- 롤백: 동일 publicPath 행이 1개 이하인 경우에만 가능 (운영 중 history 누적되어 있으면 실패).

DROP INDEX IF EXISTS "agent_deployments_public_path_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "agent_deployments_public_path_key" ON "agent_deployments"("public_path");
