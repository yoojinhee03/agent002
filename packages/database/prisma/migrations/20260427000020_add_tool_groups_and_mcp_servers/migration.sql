DO $$ BEGIN
  CREATE TYPE "ToolGroupType" AS ENUM ('rest', 'code');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "McpTransport" AS ENUM ('stdio', 'sse', 'streamable_http');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "McpStatus" AS ENUM ('disconnected', 'connecting', 'connected', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tool_groups" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "ToolGroupType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tool_groups_project_id_idx" ON "tool_groups"("project_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tool_groups" ADD CONSTRAINT "tool_groups_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "group_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tools_group_id_idx" ON "tools"("group_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tools" ADD CONSTRAINT "tools_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "tool_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "mcp_servers" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "transport" "McpTransport" NOT NULL,
    "config" JSONB NOT NULL,
    "status" "McpStatus" NOT NULL DEFAULT 'disconnected',
    "tool_count" INTEGER,
    "tools" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_servers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mcp_servers_project_id_idx" ON "mcp_servers"("project_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
