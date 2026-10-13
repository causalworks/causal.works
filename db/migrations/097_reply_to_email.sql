-- 097: Org-level reply-to address for donor acknowledgment emails
-- Exposed in Settings > Organization as "Donation reply-to email."
-- Used as Reply-To header on sendGiftAcknowledgment sends; omitted if null.

ALTER TABLE coop_orgs
  ADD COLUMN IF NOT EXISTS reply_to_email TEXT;

COMMENT ON COLUMN coop_orgs.reply_to_email IS
  'Reply-To address for donor acknowledgment emails. Shown in Settings > Organization.';
