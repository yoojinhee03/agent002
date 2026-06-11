-- WorkflowRun: thread_id 추가 + index
ALTER TABLE "workflow_runs" ADD COLUMN "thread_id" TEXT;
CREATE INDEX "workflow_runs_thread_id_started_at_idx" ON "workflow_runs"("thread_id", "started_at" DESC);

-- StepTrace: stepId/parentStepId/depth 추가 (중첩 구조 복원용)
ALTER TABLE "step_traces" ADD COLUMN "step_id" TEXT;
ALTER TABLE "step_traces" ADD COLUMN "parent_step_id" TEXT;
ALTER TABLE "step_traces" ADD COLUMN "depth" INTEGER NOT NULL DEFAULT 0;
