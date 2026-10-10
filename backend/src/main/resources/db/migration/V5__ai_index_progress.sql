ALTER TABLE ai_index_jobs ADD COLUMN total_documents integer NOT NULL DEFAULT 0;
ALTER TABLE ai_index_jobs ADD COLUMN cleanup_state varchar(30), ADD COLUMN cleanup_job_id uuid;
