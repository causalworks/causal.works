-- 168: Server-side page view logging.
--
-- GA4 (client-side gtag) undercounts real usage whenever a browser extension blocks
-- googletagmanager.com (uBlock, Brave shields, Firefox ETP) -- confirmed happening for at least
-- one admin's own browser. This table is a first-party fallback recorded directly by the server
-- in requireAuthPage (server/auth.js), so it can't be blocked client-side. It only covers real
-- page loads (every organizational route + the individual app shell), not in-SPA hash navigation
-- within the individual app -- that's a smaller gap than "was this user on the platform at all".

CREATE TABLE page_views (
    id SERIAL PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_page_views_user_created ON page_views (user_id, created_at DESC);
CREATE INDEX idx_page_views_created ON page_views (created_at DESC);

GRANT SELECT, INSERT ON TABLE page_views TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE page_views_id_seq TO causal_app;
