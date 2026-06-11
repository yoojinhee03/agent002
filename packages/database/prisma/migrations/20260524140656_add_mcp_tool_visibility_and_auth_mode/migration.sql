/*
  Warnings:

  - You are about to drop the `ai_settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ai_templates` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "McpCredentialMode" AS ENUM ('shared', 'per_user');

-- DropForeignKey
ALTER TABLE "agent_deployments" DROP CONSTRAINT "agent_deployments_deployed_by_fkey";

-- DropIndex
DROP INDEX "team_agents_team_id_agent_id_key";

-- DropIndex
DROP INDEX "tools_group_id_idx";

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "mcp_tool_refs" JSONB,
ALTER COLUMN "mcp_server_ids" DROP DEFAULT;

-- AlterTable
ALTER TABLE "mcp_servers" ADD COLUMN     "credential_mode" "McpCredentialMode" NOT NULL DEFAULT 'shared',
ADD COLUMN     "exposed_tools" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "required_user_fields" JSONB;

-- AlterTable
ALTER TABLE "skill_files" ALTER COLUMN "content" DROP DEFAULT;

-- AlterTable
ALTER TABLE "team_agents" ADD COLUMN     "sub_team_id" TEXT,
ALTER COLUMN "agent_id" DROP NOT NULL;

-- DropTable
DROP TABLE "ai_settings";

-- DropTable
DROP TABLE "ai_templates";

-- CreateTable
CREATE TABLE "deep_agent_memory" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deep_agent_memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deep_agent_memory_agent_id_thread_id_idx" ON "deep_agent_memory"("agent_id", "thread_id");

-- AddForeignKey
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_deployed_by_fkey" FOREIGN KEY ("deployed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_agents" ADD CONSTRAINT "team_agents_sub_team_id_fkey" FOREIGN KEY ("sub_team_id") REFERENCES "agent_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
