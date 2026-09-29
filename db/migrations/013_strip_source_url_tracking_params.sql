-- 013_strip_source_url_tracking_params.sql
-- One-time cleanup: remove common tracking / donation-widget query params from actions.source_url.
-- Preview first (see commented SELECT below), then run this file.

-- Preview (run manually in psql; review cleaned_url before applying UPDATE):
--
-- SELECT id, source_url,
--   regexp_replace(
--     regexp_replace(source_url,
--       '[?&](akid|t|amount|currency|one_click|rd|recurring_default|source|utm_source|utm_medium|utm_campaign|utm_content|utm_term)=[^&]*',
--       '', 'g'),
--     '[?&]+$', '', 'g')
--   AS cleaned_url
-- FROM actions
-- WHERE source_url IS NOT NULL
-- LIMIT 10;

UPDATE actions
SET source_url = regexp_replace(
    regexp_replace(source_url,
      '[?&](akid|t|amount|currency|one_click|rd|recurring_default|source|utm_source|utm_medium|utm_campaign|utm_content|utm_term)=[^&]*',
      '', 'g'),
    '[?&]+$', '', 'g')
WHERE source_url IS NOT NULL;
