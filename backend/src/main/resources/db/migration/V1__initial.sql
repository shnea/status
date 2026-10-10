CREATE TABLE members (
    id uuid PRIMARY KEY,
    issuer text NOT NULL,
    subject text NOT NULL,
    display_name text NOT NULL,
    suspended boolean NOT NULL DEFAULT false,
    suspension_reason text,
    ai_allowed boolean NOT NULL DEFAULT false,
    joined_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (issuer, subject)
);
CREATE TABLE portfolios (
    id uuid PRIMARY KEY,
    member_id uuid NOT NULL UNIQUE REFERENCES members(id),
    slug varchar(30) NOT NULL UNIQUE,
    draft jsonb NOT NULL,
    draft_revision bigint NOT NULL DEFAULT 0,
    published jsonb,
    published_revision bigint,
    is_public boolean NOT NULL DEFAULT false,
    ai_consent boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE TABLE slug_aliases (
    slug varchar(30) PRIMARY KEY,
    portfolio_id uuid NOT NULL REFERENCES portfolios(id)
);
CREATE TABLE skill_dictionary (
    id uuid PRIMARY KEY,
    owner_id uuid REFERENCES members(id),
    name varchar(100) NOT NULL,
    normalized_name varchar(100) NOT NULL,
    category varchar(60) NOT NULL,
    aliases jsonb NOT NULL DEFAULT '[]',
    icon jsonb NOT NULL DEFAULT '{"provider":"initials","key":""}',
    active boolean NOT NULL DEFAULT true,
    UNIQUE NULLS NOT DISTINCT (owner_id, normalized_name)
);
CREATE TABLE icon_catalog (
    provider varchar(30) NOT NULL,
    key varchar(100) NOT NULL,
    title varchar(200) NOT NULL,
    hex varchar(6) NOT NULL DEFAULT '',
    monochrome_allowed boolean NOT NULL DEFAULT false,
    PRIMARY KEY (provider, key)
);
CREATE TABLE uploaded_files (
    id uuid PRIMARY KEY,
    member_id uuid NOT NULL REFERENCES members(id),
    original_name varchar(255) NOT NULL,
    media_type varchar(100) NOT NULL,
    size bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_audit (
    id uuid PRIMARY KEY,
    actor_id uuid NOT NULL REFERENCES members(id),
    target_id uuid REFERENCES members(id),
    action varchar(60) NOT NULL,
    detail varchar(500) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE visits (
    event_id uuid PRIMARY KEY,
    portfolio_id uuid NOT NULL REFERENCES portfolios(id),
    visitor_hash varchar(64) NOT NULL,
    visited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visits_portfolio_date ON visits(portfolio_id, visited_at);
CREATE TABLE template_settings (
    id varchar(60) PRIMARY KEY,
    title varchar(100) NOT NULL,
    enabled boolean NOT NULL,
    implemented boolean NOT NULL,
    is_default boolean NOT NULL DEFAULT false
);
INSERT INTO template_settings VALUES
('swiss', 'Swiss Editorial Portfolio', true, true, true),
('hud', 'Dark Futuristic HUD Portfolio', false, false, false),
('google-flat', 'Google-inspired Flat Portfolio', false, false, false),
('modern-flat', 'Modern Flat Minimal Portfolio', false, false, false),
('premium-dark', 'Premium Dark Minimal Portfolio', false, false, false);
CREATE UNIQUE INDEX one_default_template ON template_settings(is_default) WHERE is_default;
CREATE TABLE system_settings (
    key varchar(80) PRIMARY KEY,
    value jsonb NOT NULL
);
INSERT INTO system_settings VALUES ('ai_limits', '{"sessionDaily":10,"portfolioDaily":100,"globalDaily":1000,"sessionMinute":3}');
CREATE TABLE ai_requests (
    id uuid PRIMARY KEY,
    portfolio_id uuid NOT NULL REFERENCES portfolios(id),
    visitor_hash varchar(64) NOT NULL,
    ip_hash varchar(64) NOT NULL,
    status varchar(30) NOT NULL,
    latency_ms bigint,
    requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_requests_time ON ai_requests(requested_at);
CREATE TABLE ai_index_jobs (
    id uuid PRIMARY KEY,
    portfolio_id uuid NOT NULL REFERENCES portfolios(id),
    published_revision bigint NOT NULL,
    status varchar(30) NOT NULL,
    collection varchar(64),
    error_code varchar(100),
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);
CREATE TABLE SPRING_SESSION (
    PRIMARY_ID char(36) NOT NULL PRIMARY KEY,
    SESSION_ID char(36) NOT NULL,
    CREATION_TIME bigint NOT NULL,
    LAST_ACCESS_TIME bigint NOT NULL,
    MAX_INACTIVE_INTERVAL int NOT NULL,
    EXPIRY_TIME bigint NOT NULL,
    PRINCIPAL_NAME varchar(100)
);
CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);
CREATE TABLE SPRING_SESSION_ATTRIBUTES (
    SESSION_PRIMARY_ID char(36) NOT NULL REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE,
    ATTRIBUTE_NAME varchar(200) NOT NULL,
    ATTRIBUTE_BYTES bytea NOT NULL,
    PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME)
);
