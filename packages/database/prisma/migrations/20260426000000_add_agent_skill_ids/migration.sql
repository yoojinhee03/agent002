-- AlterTable
ALTER TABLE "agents" ADD COLUMN "skill_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
