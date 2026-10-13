-- 301: Contact on ledger entries (2026-10-07).
-- org_ledger_transactions.constituent_id is the matched party (a contact, org_constituents). The payee text stays as
-- typed or as the bank wrote it; the contact is set when a contact is known: bills, invoices, credit notes and their
-- payments, and gifts. Entries with no party (depreciation, accretion, indirect cost recovery, recodes, transfers) stay null.
-- The backfill also fills entries whose payee text equals exactly one contact's display name in the same org.
-- The fiscal-year lock trigger fires on any update, so the backfill disables it for this transaction only (it changes
-- one column on locked years and nothing else) and turns it back on before COMMIT.

BEGIN;

ALTER TABLE org_ledger_transactions
  ADD COLUMN constituent_id integer REFERENCES org_constituents(id) ON DELETE SET NULL;
CREATE INDEX idx_org_ledger_transactions_constituent
  ON org_ledger_transactions (org_id, constituent_id) WHERE constituent_id IS NOT NULL;
COMMENT ON COLUMN org_ledger_transactions.constituent_id IS 'The contact this entry is with (vendor, customer, donor). Null when no party applies or none is matched. payee stays as the text typed or imported.';

-- The contact must belong to the entry's org.
CREATE FUNCTION org_enforce_ledger_transaction_contact_same_org() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.constituent_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_ledger_transactions.constituent_id % must reference an org_constituents row in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_org_ledger_transactions_contact_same_org
  BEFORE INSERT OR UPDATE OF constituent_id, org_id ON org_ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION org_enforce_ledger_transaction_contact_same_org();

-- ---- backfill
ALTER TABLE org_ledger_transactions DISABLE TRIGGER trg_fy_lock_ledger_transactions;

DO $backfill$
DECLARE n integer;
BEGIN
  UPDATE org_ledger_transactions t SET constituent_id = b.constituent_id
    FROM org_bills b WHERE b.ledger_transaction_id = t.id AND t.constituent_id IS NULL AND b.org_id = t.org_id;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'bills: %', n;

  UPDATE org_ledger_transactions t SET constituent_id = b.constituent_id
    FROM org_bill_payments p JOIN org_bills b ON b.id = p.bill_id
    WHERE p.ledger_transaction_id = t.id AND t.constituent_id IS NULL AND b.org_id = t.org_id;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'bill payments: %', n;

  UPDATE org_ledger_transactions t SET constituent_id = cn.constituent_id
    FROM org_bill_credit_notes cn WHERE cn.ledger_transaction_id = t.id AND t.constituent_id IS NULL AND cn.org_id = t.org_id;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'bill credit notes: %', n;

  UPDATE org_ledger_transactions t SET constituent_id = i.constituent_id
    FROM org_invoices i WHERE i.ledger_transaction_id = t.id AND t.constituent_id IS NULL AND i.org_id = t.org_id;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'invoices: %', n;

  UPDATE org_ledger_transactions t SET constituent_id = i.constituent_id
    FROM org_invoice_payments p JOIN org_invoices i ON i.id = p.invoice_id
    WHERE p.ledger_transaction_id = t.id AND t.constituent_id IS NULL AND i.org_id = t.org_id;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'invoice payments: %', n;

  UPDATE org_ledger_transactions t SET constituent_id = cn.constituent_id
    FROM org_invoice_credit_notes cn WHERE cn.ledger_transaction_id = t.id AND t.constituent_id IS NULL AND cn.org_id = t.org_id;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'invoice credit notes: %', n;

  UPDATE org_ledger_transactions t SET constituent_id = g.constituent_id
    FROM org_gifts g WHERE g.ledger_transaction_id = t.id AND t.constituent_id IS NULL AND g.constituent_id IS NOT NULL AND g.org_id = t.org_id;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'gifts: %', n;

  -- A reversing entry takes the contact of the entry it reverses.
  UPDATE org_ledger_transactions t SET constituent_id = o.constituent_id
    FROM org_ledger_transactions o WHERE t.reverses_transaction_id = o.id AND t.constituent_id IS NULL AND o.constituent_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'reversals: %', n;

  -- Remaining entries: the payee text equals exactly one contact name (case and edge spaces ignored).
  UPDATE org_ledger_transactions t SET constituent_id = m.id
    FROM (SELECT t2.id AS txn_id, (array_agg(c.id))[1] AS id
            FROM org_ledger_transactions t2
            JOIN org_constituents c ON c.org_id = t2.org_id AND lower(btrim(c.display_name)) = lower(btrim(t2.payee))
           WHERE t2.constituent_id IS NULL AND t2.payee IS NOT NULL AND btrim(t2.payee) <> ''
           GROUP BY t2.id HAVING count(*) = 1) m
    WHERE t.id = m.txn_id;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'payee name matches: %', n;

  SELECT count(*) INTO n FROM org_ledger_transactions WHERE constituent_id IS NULL AND payee IS NOT NULL AND btrim(payee) <> '';
  RAISE NOTICE 'payee text with no single matching contact: %', n;
  SELECT count(*) INTO n FROM org_ledger_transactions WHERE constituent_id IS NOT NULL;
  RAISE NOTICE 'entries with a contact: %', n;
END
$backfill$;

ALTER TABLE org_ledger_transactions ENABLE TRIGGER trg_fy_lock_ledger_transactions;

COMMIT;
