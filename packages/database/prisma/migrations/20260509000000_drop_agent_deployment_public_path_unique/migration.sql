-- AgentDeployment.publicPath 는 (agent.slug, env.slug) 로 결정적이라
-- 동일 (agent, env) 의 v1 inactive + v2 active 처럼 history 가 누적되면
-- 같은 publicPath 를 여러 row 가 갖게 되어 UNIQUE 충돌이 발생함.
-- application 레벨에서 (agentId, environmentId, status='active') 1건 보장으로
-- 라우팅 충돌은 없으므로 UNIQUE 를 INDEX 로 전환한다.

DROP INDEX IF EXISTS "agent_deployments_public_path_key";
CREATE INDEX IF NOT EXISTS "agent_deployments_public_path_idx" ON "agent_deployments"("public_path");
