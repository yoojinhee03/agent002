-- Phase 1: CardDefinition.category 컬럼 도입.
-- 'response' 가 기본값 — 기존 카드는 모두 response 로 자동 분류, hitl- 접두 카드만 hitl 로 마킹.
ALTER TABLE "card_definitions" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'response';
UPDATE "card_definitions" SET "category" = 'hitl' WHERE "card_id" LIKE 'hitl-%';
