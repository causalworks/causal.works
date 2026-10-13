-- Default account for pledges: the receivable a new pledge in Funding starts with.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS default_pledge_receivable_account_id integer REFERENCES org_accounts(id) ON DELETE SET NULL;
UPDATE org_settings s SET default_pledge_receivable_account_id = a.id
  FROM org_accounts a
 WHERE a.org_id = s.org_id AND a.name = 'Pledges Receivable' AND a.is_posting AND a.archived_at IS NULL
   AND s.default_pledge_receivable_account_id IS NULL;
