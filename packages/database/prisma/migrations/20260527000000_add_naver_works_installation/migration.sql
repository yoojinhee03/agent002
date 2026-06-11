-- CreateTable
CREATE TABLE "naver_works_installations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "installed_by_user_id" TEXT,
    "agent_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "bot_name" TEXT,
    "client_id" TEXT NOT NULL,
    "client_secret_enc" TEXT NOT NULL,
    "service_account" TEXT NOT NULL,
    "private_key_enc" TEXT NOT NULL,
    "bot_secret_enc" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'bot bot.message',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "naver_works_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "naver_works_installations_bot_id_key" ON "naver_works_installations"("bot_id");

-- CreateIndex
CREATE INDEX "naver_works_installations_project_id_idx" ON "naver_works_installations"("project_id");

-- CreateIndex
CREATE INDEX "naver_works_installations_agent_id_idx" ON "naver_works_installations"("agent_id");

-- AddForeignKey
ALTER TABLE "naver_works_installations" ADD CONSTRAINT "naver_works_installations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "naver_works_installations" ADD CONSTRAINT "naver_works_installations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
