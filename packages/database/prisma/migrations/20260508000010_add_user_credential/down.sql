-- Rollback for 20260508000010_add_user_credential
--
-- 주의: user_credentials 테이블의 모든 자격증명이 영구 삭제됩니다.
-- 운영 환경에서 적용 전 valueEnc 백업을 권장합니다.

DROP TABLE IF EXISTS "user_credentials";
DROP TYPE IF EXISTS "CredentialStatus";
DROP TYPE IF EXISTS "CredentialKind";
