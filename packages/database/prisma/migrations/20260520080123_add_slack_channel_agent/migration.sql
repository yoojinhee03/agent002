-- CreateEnum
CREATE TYPE "SlackRoutingMode" AS ENUM ('channel', 'dm', 'both');

-- CreateTable
CREATE TABLE "slack_channel_agents" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workspace_team_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "channel_name" TEXT,
    "agent_id" TEXT NOT NULL,
    "mode" "SlackRoutingMode" NOT NULL DEFAULT 'channel',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_channel_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_channel_agents_workspace_team_id_channel_id_mode_key" ON "slack_channel_agents"("workspace_team_id", "channel_id", "mode");

-- CreateIndex
CREATE INDEX "slack_channel_agents_project_id_idx" ON "slack_channel_agents"("project_id");

-- CreateIndex
CREATE INDEX "slack_channel_agents_agent_id_idx" ON "slack_channel_agents"("agent_id");

-- AddForeignKey
ALTER TABLE "slack_channel_agents" ADD CONSTRAINT "slack_channel_agents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_channel_agents" ADD CONSTRAINT "slack_channel_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
