INSERT INTO system_settings VALUES ('ai_enabled', 'true');
ALTER TABLE ai_requests ADD COLUMN input_hash varchar(64), ADD COLUMN published_revision bigint,
    ADD COLUMN platform_job_id uuid, ADD COLUMN error_code varchar(60);
ALTER TABLE ai_index_jobs ADD COLUMN remote_job_id uuid, ADD COLUMN next_batch integer NOT NULL DEFAULT 0,
    ADD COLUMN started_at timestamptz, ADD COLUMN lease_until timestamptz;
UPDATE ai_index_jobs SET status='superseded', finished_at=now() WHERE status='queued';
CREATE UNIQUE INDEX ai_one_index_in_progress ON ai_index_jobs(portfolio_id) WHERE status IN ('queued','running','waiting');
CREATE INDEX ai_requests_scope ON ai_requests(visitor_hash, portfolio_id, requested_at);
CREATE INDEX ai_requests_ip ON ai_requests(ip_hash, requested_at);
CREATE INDEX ai_index_generation ON ai_index_jobs(portfolio_id, published_revision, finished_at DESC);
ALTER TABLE ai_requests ADD COLUMN source_ids jsonb NOT NULL DEFAULT '[]';
