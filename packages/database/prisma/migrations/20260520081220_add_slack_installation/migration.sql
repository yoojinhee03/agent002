-- CreateTable
CREATE TABLE "slack_installations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workspace_team_id" TEXT NOT NULL,
    "workspace_name" TEXT,
    "bot_user_id" TEXT,
    "bot_token_enc" TEXT NOT NULL,
    "app_token_enc" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_installations_workspace_team_id_key" ON "slack_installations"("workspace_team_id");

-- CreateIndex
CREATE INDEX "slack_installations_project_id_idx" ON "slack_installations"("project_id");

-- AddForeignKey
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
