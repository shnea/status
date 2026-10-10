CREATE TABLE portfolio_publications (
    portfolio_id uuid NOT NULL REFERENCES portfolios(id),
    revision bigint NOT NULL,
    published_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (portfolio_id, revision)
);
INSERT INTO portfolio_publications(portfolio_id,revision,published_at)
SELECT id,published_revision,published_at FROM portfolios
WHERE published_revision IS NOT NULL AND published_at IS NOT NULL;
CREATE INDEX publications_date ON portfolio_publications(published_at);
CREATE INDEX visits_date ON visits(visited_at);
CREATE INDEX members_joined_at ON members(joined_at);
