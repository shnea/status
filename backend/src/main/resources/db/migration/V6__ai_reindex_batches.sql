CREATE TABLE ai_reindex_batches (
    id uuid PRIMARY KEY,
    targets integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_index_jobs ADD COLUMN batch_id uuid REFERENCES ai_reindex_batches(id);
