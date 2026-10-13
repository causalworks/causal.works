-- 157: move the invite allowlist from the ALLOWED_EMAILS env var into the DB.
--
-- Previously ALLOWED_EMAILS in .env was the sole gate for signup/login
-- (auth.js isEmailOnAllowList) with no relationship to the users table --
-- deleting a user via /admin never removed them from it, and admins had no
-- way to invite a new email without editing .env + restarting the process.
--
-- Seeded from the current .env ALLOWED_EMAILS value (2026-08-21) so existing
-- invited-but-not-yet-signed-up emails keep working after cutover.

CREATE TABLE allowed_emails (
  email TEXT PRIMARY KEY,
  invited_by TEXT,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

INSERT INTO allowed_emails (email, note) VALUES
  ('loopy@causal.works', 'seeded from .env ALLOWED_EMAILS'),
  ('guy_yarden@protonmail.com', 'seeded from .env ALLOWED_EMAILS'),
  ('gyacc@pm.me', 'seeded from .env ALLOWED_EMAILS'),
  ('seth@sugarmonger.org', 'seeded from .env ALLOWED_EMAILS'),
  ('tal.yarden@gmail.com', 'seeded from .env ALLOWED_EMAILS'),
  ('jim@argotpictures.com', 'seeded from .env ALLOWED_EMAILS'),
  ('mstreet430@gmail.com', 'seeded from .env ALLOWED_EMAILS'),
  ('swanly@gmail.com', 'seeded from .env ALLOWED_EMAILS'),
  ('freedom.baird@protonmail.com', 'seeded from .env ALLOWED_EMAILS'),
  ('andres@redmage.cc', 'seeded from .env ALLOWED_EMAILS'),
  ('abby@ashevillecreativearts.org', 'seeded from .env ALLOWED_EMAILS'),
  ('megan@artsfms.com', 'seeded from .env ALLOWED_EMAILS'),
  ('guyyarden@proton.mail', 'seeded from .env ALLOWED_EMAILS')
ON CONFLICT (email) DO NOTHING;
