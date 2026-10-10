ALTER TABLE uploaded_files
    ADD COLUMN unreferenced_since timestamptz,
    ADD COLUMN cleanup_checked_at timestamptz,
    ADD COLUMN cleanup_started_at timestamptz,
    ADD COLUMN cleanup_completed_at timestamptz,
    ADD COLUMN cleanup_retry_at timestamptz,
    ADD COLUMN cleanup_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN cleanup_error varchar(80);

CREATE INDEX uploaded_files_cleanup_scan ON uploaded_files(cleanup_checked_at ASC NULLS FIRST, id)
    WHERE cleanup_started_at IS NULL;
CREATE INDEX uploaded_files_cleanup_retry ON uploaded_files(cleanup_retry_at, id)
    WHERE cleanup_started_at IS NOT NULL AND cleanup_completed_at IS NULL;
