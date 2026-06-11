-- DropForeignKey
ALTER TABLE "workflow_runs" DROP CONSTRAINT IF EXISTS "workflow_runs_workflow_id_fkey";

-- AlterTable
ALTER TABLE "workflow_runs" ALTER COLUMN "workflow_id" DROP NOT NULL;
ALTER TABLE "workflow_runs" ADD COLUMN "agent_id" TEXT;
ALTER TABLE "workflow_runs" ADD COLUMN "project_id" TEXT;
ALTER TABLE "workflow_runs" ADD COLUMN "latency_ms" INTEGER;

-- CreateIndex
CREATE INDEX "workflow_runs_agent_id_started_at_idx" ON "workflow_runs"("agent_id", "started_at" DESC);
CREATE INDEX "workflow_runs_project_id_started_at_idx" ON "workflow_runs"("project_id", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
