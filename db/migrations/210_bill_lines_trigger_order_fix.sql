-- 210: real bug caught during Fix 2 verification, not a hypothetical. Postgres fires multiple
-- BEFORE triggers on the same table in alphabetical order of trigger name. org_ledger_lines
-- already handles this deliberately -- its triggers are named trg_ledger_lines_1_same_org and
-- trg_ledger_lines_2_posting_account specifically so the cross-org check (CA004) fires before
-- the posting-account check (CA003). Missed that convention when naming org_bill_lines'
-- triggers (trg_bill_lines_posting_account sorts before trg_bill_lines_same_org
-- alphabetically), so a cross-org account_id was being rejected with the wrong error --
-- CA003 "must reference a posting account" instead of CA004 "does not belong to org %" --
-- because the posting-account check's own RLS-scoped SELECT silently sees zero rows for a
-- row belonging to a different org (same class of false-pass this codebase has hit before,
-- documented in bankReconciliation.js). Not a security gap either way -- the write was
-- correctly rejected in both orderings -- but the wrong error code/message. Renaming to match
-- the same numbered convention already established.

ALTER TRIGGER trg_bill_lines_same_org ON org_bill_lines RENAME TO trg_bill_lines_1_same_org;
ALTER TRIGGER trg_bill_lines_posting_account ON org_bill_lines RENAME TO trg_bill_lines_2_posting_account;
