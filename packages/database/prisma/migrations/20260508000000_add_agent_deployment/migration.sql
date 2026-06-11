-- CreateTable: agent_deployments
CREATE TABLE "agent_deployments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'active',
    "public_path" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "description" TEXT,
    "deployed_by" TEXT NOT NULL,
    "deployed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undeployed_at" TIMESTAMP(3),

    CONSTRAINT "agent_deployments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_deployments_public_path_key" ON "agent_deployments"("public_path");
CREATE UNIQUE INDEX "agent_deployments_agent_id_environment_id_version_key" ON "agent_deployments"("agent_id", "environment_id", "version");
CREATE INDEX "agent_deployments_project_id_idx" ON "agent_deployments"("project_id");
CREATE INDEX "agent_deployments_agent_id_status_idx" ON "agent_deployments"("agent_id", "status");

ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "deployment_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_deployed_by_fkey" FOREIGN KEY ("deployed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AlterTable: api_keys.agent_deployment_id
ALTER TABLE "api_keys" ADD COLUMN "agent_deployment_id" TEXT;
CREATE INDEX "api_keys_agent_deployment_id_idx" ON "api_keys"("agent_deployment_id");
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_agent_deployment_id_fkey" FOREIGN KEY ("agent_deployment_id") REFERENCES "agent_deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: threads.agent_deployment_id
ALTER TABLE "threads" ADD COLUMN "agent_deployment_id" TEXT;
CREATE INDEX "threads_agent_deployment_id_idx" ON "threads"("agent_deployment_id");
ALTER TABLE "threads" ADD CONSTRAINT "threads_agent_deployment_id_fkey" FOREIGN KEY ("agent_deployment_id") REFERENCES "agent_deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
