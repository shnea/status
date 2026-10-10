CREATE TABLE file_upload_requests (
    request_id uuid PRIMARY KEY,
    member_id uuid NOT NULL REFERENCES members(id),
    original_name varchar(255) NOT NULL,
    sha256 char(64) NOT NULL,
    media_type varchar(100) NOT NULL,
    kind varchar(10) NOT NULL,
    size bigint NOT NULL,
    file_id uuid REFERENCES uploaded_files(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX file_upload_requests_owner ON file_upload_requests(member_id);
