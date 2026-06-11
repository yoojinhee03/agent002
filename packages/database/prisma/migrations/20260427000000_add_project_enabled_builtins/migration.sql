-- AlterTable
ALTER TABLE "projects"
ADD COLUMN "enabled_builtins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "projects"
ADD COLUMN "builtin_configs" JSONB NOT NULL DEFAULT '{}'::JSONB;
