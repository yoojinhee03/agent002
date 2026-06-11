"""Thread attachments — 사용자 업로드 파일을 thread 단위로 디스크에 영구 보관.

저장 구조: `{ATTACHMENT_STORAGE_DIR}/{thread_id}/{attachment_id}-{original_name}`
DB row(thread_attachments)에 metadata 기록 후 `deepagent_bridge` 가 invoke 직전에
sandbox `/workspace/` 로 sync 한다.
"""
