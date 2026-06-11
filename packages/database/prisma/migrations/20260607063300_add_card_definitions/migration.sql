-- CreateTable: card_definitions (누락된 CREATE 보강)
-- schema.prisma 의 CardDefinition 모델에 대응. category 컬럼은
-- 직후 마이그레이션(20260607063337_add_card_definition_category) 에서 추가됨.
CREATE TABLE "card_definitions" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'sky-standard',
    "target_tools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "arg_schema" JSONB,
    "payload" JSONB NOT NULL,
    "sample_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_definitions_card_id_version_key" ON "card_definitions"("card_id", "version");
CREATE INDEX "card_definitions_card_id_idx" ON "card_definitions"("card_id");
CREATE INDEX "card_definitions_tenant_id_idx" ON "card_definitions"("tenant_id");
