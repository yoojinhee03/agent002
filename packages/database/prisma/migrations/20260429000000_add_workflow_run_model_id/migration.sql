-- Add model_id column to workflow_runs
ALTER TABLE "workflow_runs" ADD COLUMN "model_id" TEXT;

-- Index for provider/model breakdown queries
CREATE INDEX "workflow_runs_model_id_started_at_idx" ON "workflow_runs"("model_id", "started_at" DESC);
