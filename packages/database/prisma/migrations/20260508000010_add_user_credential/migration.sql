-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('provider', 'tool', 'mcp');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('active', 'invalid', 'expired');

-- CreateTable
CREATE TABLE "user_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "target_id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "value_enc" TEXT NOT NULL,
    "metadata" JSONB,
    "status" "CredentialStatus" NOT NULL DEFAULT 'active',
    "last_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_credentials_user_id_kind_target_id_label_key" ON "user_credentials"("user_id", "kind", "target_id", "label");
CREATE INDEX "user_credentials_user_id_kind_idx" ON "user_credentials"("user_id", "kind");

ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
