-- AlterTable
ALTER TABLE "agents"
ADD COLUMN "tool_group_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "agents"
ADD COLUMN "mcp_server_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "agents"
ADD COLUMN "builtin_tool_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
