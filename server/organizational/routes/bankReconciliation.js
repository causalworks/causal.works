'use strict';

const crypto = require('crypto');
const multer = require('multer');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { parseCsvRecords } = require('../lib/csvParse');
const {
  postLedgerTransaction, voidLedgerTransaction, isFiscalYearLocked, buildReversingLines, RESTRICTION_CLASSES,
} = require('../lib/ledgerPosting');
const { recordGrantGiftPayment } = require('../lib/grantGiftPayment');
const { recordMembershipDuesPayment } = require('../lib/membershipDuesPayment');
const { recordSponsoredProjectDisbursementPayment } = require('../lib/sponsoredProjectDisbursementPayment');
const {
  recordBillPayment, recordInvoicePayment, voidBillPayment, voidInvoicePayment,
  billRemainingBalanceCents, invoiceRemainingBalanceCents,
} = require('../lib/billInvoicePayments');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pick(row, names) {
  for (const n of names) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === n) return row[key];
    }
  }
  return undefined;
}

function normalizeDescription(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Accepts "42.50", "$42.50", "-42.50", "(42.50)" (parens = negative), with optional commas. */
function parseAmountToCents(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  else if (s.startsWith('+')) { s = s.slice(1); }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

function parseDateToIso(raw) {
  const s = String(raw || '').trim();
  if (DATE_RE.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Deterministic fingerprint per spec Section 2.3. Bank-native id (fitid) preferred when the
 * source file has one; otherwise SHA256 of the row's identifying fields. `occurrence` (the Nth
 * time this exact base fingerprint has appeared so far in THIS file) is appended so legitimate
 * same-day/same-amount duplicates (three distinct $50 donations) don't collapse into one row --
 * re-uploading the same file recomputes the same occurrence-indexed fingerprints, so re-uploads
 * are still correctly detected as duplicates against what's already imported.
 */
function computeFingerprint({ bankAccountId, statementDate, amountCents, creditDebitIndicator, descriptionRaw, fitid, occurrence }) {
  if (fitid) {
    return 'fitid:' + bankAccountId + ':' + String(fitid).trim();
  }
  // credit_debit_indicator is part of the fingerprint (migration 218): amount_cents alone is no
  // longer signed, so a $50 debit and a $50 credit on the same account/date/description would
  // otherwise collide.
  const base = crypto
    .createHash('sha256')
    .update(bankAccountId + '|' + statementDate + '|' + amountCents + '|' + creditDebitIndicator + '|' + normalizeDescription(descriptionRaw))
    .digest('hex');
  return base + ':' + occurrence;
}

function parseAndFingerprintRows(rows, bankAccountId) {
  const occurrenceCounts = new Map();
  const parsed = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const dateRaw = pick(row, ['date', 'transaction date', 'statement date']);
    const amountRaw = pick(row, ['amount']);
    const descriptionRaw = pick(row, ['description', 'memo']) || '';
    const payeeRaw = pick(row, ['payee', 'name']) || '';
    const fitid = pick(row, ['fitid', 'transaction id', 'reference']);

    const statementDate = parseDateToIso(dateRaw);
    if (!statementDate) { errors.push({ row: rowNum, message: 'Missing or unparseable date' }); return; }
    const signedAmountCents = parseAmountToCents(amountRaw);
    if (signedAmountCents == null) { errors.push({ row: rowNum, message: 'Missing or unparseable amount' }); return; }
    // A deposit into the account is 'credit', money leaving is 'debit', from the org's own
    // perspective (spec Section 2.1) -- amount_cents itself is stored unsigned; this indicator
    // carries the direction instead of the sign.
    const creditDebitIndicator = signedAmountCents < 0 ? 'debit' : 'credit';
    const amountCents = Math.abs(signedAmountCents);

    const fitidKey = fitid ? String(fitid).trim() : null;
    let occurrence = 1;
    if (!fitidKey) {
      const baseKey = bankAccountId + '|' + statementDate + '|' + amountCents + '|' + creditDebitIndicator + '|' + normalizeDescription(descriptionRaw);
      occurrence = (occurrenceCounts.get(baseKey) || 0) + 1;
      occurrenceCounts.set(baseKey, occurrence);
    }

    parsed.push({
      row: rowNum,
      statement_date: statementDate,
      amount_cents: amountCents,
      credit_debit_indicator: creditDebitIndicator,
      payee_raw: payeeRaw || null,
      description_raw: descriptionRaw || null,
      fingerprint: computeFingerprint({
        bankAccountId, statementDate, amountCents, creditDebitIndicator, descriptionRaw, fitid: fitidKey, occurrence,
      }),
    });
  });

  return { parsed, errors };
}

function registerBankReconciliationRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];

  app.post(
    '/api/organizational/orgs/:slug/bank-statement-lines/import',
    ...orgAuth,
    upload.single('file'),
    async (req, res) => {
      const orgId = req.orgId;
      const bankAccountId = Number.parseInt(String(req.body.bank_account_id), 10);
      const mode = req.body.mode === 'commit' ? 'commit' : 'preview';
      const includeDuplicates = req.body.include_duplicates === 'true' || req.body.include_duplicates === true;

      if (!Number.isInteger(bankAccountId) || bankAccountId < 1) {
        return res.status(400).json({ error: 'bank_account_id is required' });
      }
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'Missing file field (CSV)' });
      }

      try {
        const acctR = await pool.query(
          `SELECT 1 FROM org_accounts WHERE id = $1 AND org_id = $2 AND is_cash_account IS TRUE`,
          [bankAccountId, orgId]
        );
        if (acctR.rows.length === 0) {
          return res.status(400).json({ error: 'bank_account_id must be a cash account belonging to this organization' });
        }

        let csv;
        try {
          csv = parseCsvRecords(req.file.buffer);
        } catch (e) {
          return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
        }
        if (!csv.rows.length) {
          return res.json({ total: 0, new: 0, duplicates: 0, errors: [], rows: [] });
        }

        const { parsed, errors } = parseAndFingerprintRows(csv.rows, bankAccountId);

        const fingerprints = parsed.map((r) => r.fingerprint);
        const existingR = await pool.query(
          `SELECT import_fingerprint FROM org_bank_statement_lines WHERE org_id = $1 AND import_fingerprint = ANY($2::text[])`,
          [orgId, fingerprints]
        );
        const existingSet = new Set(existingR.rows.map((r) => r.import_fingerprint));

        const rowsOut = parsed.map((r) => ({ ...r, is_duplicate: existingSet.has(r.fingerprint) }));
        const dupCount = rowsOut.filter((r) => r.is_duplicate).length;

        if (mode === 'preview') {
          return res.json({
            total: parsed.length,
            new: parsed.length - dupCount,
            duplicates: dupCount,
            errors,
            rows: rowsOut,
          });
        }

        // commit
        const toInsert = rowsOut.filter((r) => !r.is_duplicate || includeDuplicates);
        let inserted = 0;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const r of toInsert) {
            // A forced duplicate (include_duplicates=true) MUST NOT be inserted under the same
            // fingerprint as the row it duplicates -- the fingerprint scheme is deterministic
            // specifically so identical (account, date, amount, description) combinations
            // collide, and the unique constraint enforces that at the DB level regardless of
            // this route's own flag. Found by testing: the first version of this endpoint tried
            // to re-insert under the unchanged fingerprint, ON CONFLICT DO NOTHING silently
            // absorbed it, and "import duplicates anyway" did nothing at all. A forced duplicate
            // is a deliberate second, distinct row, so it gets its own fingerprint (suffixed,
            // traceable back to the original) -- it can never collide with a future real
            // re-upload of the same file, since that re-upload recomputes the original,
            // unsuffixed fingerprint, not this one.
            const fingerprint = r.is_duplicate
              ? r.fingerprint + ':forced:' + crypto.randomBytes(4).toString('hex')
              : r.fingerprint;
            // ON CONFLICT DO NOTHING is still a safety net against a race with a concurrent
            // import between preview and commit -- rowCount, not a blind increment, is what
            // actually happened.
            const insertR = await client.query(
              `INSERT INTO org_bank_statement_lines
                 (org_id, bank_account_id, statement_date, amount_cents, credit_debit_indicator, payee_raw, description_raw, import_fingerprint)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (org_id, import_fingerprint) DO NOTHING`,
              [orgId, bankAccountId, r.statement_date, r.amount_cents, r.credit_debit_indicator, r.payee_raw, r.description_raw, fingerprint]
            );
            inserted += insertR.rowCount;
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }

        const skipped = parsed.length - inserted;
        await pool.query(
          `INSERT INTO org_import_history (org_id, import_kind, inserted, updated, skipped, error_summary)
           VALUES ($1, 'bank_statement', $2, 0, $3, $4)`,
          [orgId, inserted, skipped, errors.length ? JSON.stringify(errors) : null]
        );

        return res.json({ total: parsed.length, inserted, skipped, errors });
      } catch (e) {
        console.error('POST /bank-statement-lines/import:', e.message);
        return res.status(500).json({ error: 'Could not import bank statement' });
      }
    }
  );

  function rowToStatementLine(row) {
    return {
      id: row.id,
      bank_account_id: row.bank_account_id,
      bank_account_code: row.bank_account_code,
      bank_account_name: row.bank_account_name,
      statement_date: row.statement_date,
      amount_cents: row.amount_cents != null ? String(row.amount_cents) : '0',
      credit_debit_indicator: row.credit_debit_indicator,
      payee_raw: row.payee_raw,
      description_raw: row.description_raw,
      status: row.status,
      is_internal_transfer: !!row.is_internal_transfer,
      transfer_pair_line_id: row.transfer_pair_line_id,
      discuss_note: row.discuss_note,
      discuss_resolved_at: row.discuss_resolved_at,
      coding_source: row.coding_source,
      applied_rule_id: row.applied_rule_id,
      ledger_transaction_id: row.ledger_transaction_id,
      created_at: row.created_at,
    };
  }

  /** The Reconcile queue (and Cash Coding's row source, Step 4) -- one row per statement line. */
  /** Per-account unconfirmed counts, one query -- feeds the account-strip UI's badge per card without an N+1 fetch per account. */
  app.get('/api/organizational/orgs/:slug/bank-statement-lines/unconfirmed-counts', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    try {
      const r = await pool.query(
        `SELECT bank_account_id, COUNT(*)::int AS count FROM org_bank_statement_lines
         WHERE org_id = $1 AND status = 'unconfirmed' GROUP BY bank_account_id`,
        [orgId]
      );
      const counts = {};
      for (const row of r.rows) counts[row.bank_account_id] = row.count;
      return res.json({ counts });
    } catch (e) {
      console.error('GET bank-statement-lines/unconfirmed-counts:', e.message);
      return res.status(500).json({ error: 'Could not load counts' });
    }
  });

  app.get('/api/organizational/orgs/:slug/bank-statement-lines', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const status = req.query.status != null ? String(req.query.status) : null;
    const bankAccountId = req.query.bank_account_id != null ? Number.parseInt(String(req.query.bank_account_id), 10) : null;
    const limit = Math.min(1000, Math.max(1, Number.parseInt(String(req.query.limit || '200'), 10) || 200));

    if (status != null && !['unconfirmed', 'confirmed', 'transfer_pending'].includes(status)) {
      return res.status(400).json({ error: 'status must be unconfirmed, confirmed, or transfer_pending' });
    }

    try {
      const conds = ['l.org_id = $1'];
      const params = [orgId];
      let p = 2;
      if (status) { conds.push(`l.status = $${p}`); params.push(status); p += 1; }
      if (Number.isInteger(bankAccountId) && bankAccountId > 0) {
        conds.push(`l.bank_account_id = $${p}`); params.push(bankAccountId); p += 1;
      }
      params.push(limit);

      const r = await pool.query(
        `SELECT l.*, acc.code AS bank_account_code, acc.name AS bank_account_name
         FROM org_bank_statement_lines l
         JOIN org_accounts acc ON acc.id = l.bank_account_id
         WHERE ${conds.join(' AND ')}
         ORDER BY l.statement_date ASC, l.id ASC
         LIMIT $${p}`,
        params
      );
      return res.json({ lines: r.rows.map(rowToStatementLine) });
    } catch (e) {
      console.error('GET /bank-statement-lines:', e.message);
      return res.status(500).json({ error: 'Could not load bank statement lines' });
    }
  });

  /**
   * Builds the two-sided line pair for coding a statement line's amount against a chosen
   * account: an inflow (amount_cents >= 0) debits the bank account and credits the coded
   * account (Dr Bank / Cr Income); an outflow debits the coded account and credits the bank
   * account (Dr Expense / Cr Bank) -- ordinary double-entry, not bank-reconciliation-specific.
   *
   * The bank-side leg has no natural program of its own (cash isn't program-specific) --
   * org_ledger_lines.program_id is NOT NULL by schema design and there's no "unassigned
   * program" convention anywhere else in this codebase, so the bank leg inherits the same
   * program_id as the coded leg. Simplest option that doesn't invent new schema/concepts.
   */
  /**
   * Builds the bank-side leg + N coded legs for a statement line, optionally split across
   * multiple account/program/grant combinations (Cash Coding's split sub-rows, Step 4). A plain
   * single-account Create (Reconcile view, Step 3) is just the one-split case -- same function,
   * same code path, matching the spec's "no backend split logic to invent." Each split's
   * `amountCents` is a positive portion of the line's total; sum must equal the full amount
   * (postLedgerTransaction's balance trigger enforces this regardless, but validating the sum
   * here gives a clearer error than a generic "does not balance").
   *
   * The bank leg's program is ambiguous when splits touch different programs -- there's no
   * "unassigned program" concept anywhere in this schema (program_id is NOT NULL on
   * org_ledger_lines by design), so it inherits the FIRST split's program. Arbitrary but
   * deterministic, same reasoning as the single-split case.
   */
  // org_bank_statement_lines.amount_cents is unsigned (migration 218); credit_debit_indicator
  // carries the direction. buildSplitLines still works in signed terms internally (positive =
  // inflow/credit, matching the GL sign convention), so every caller reconstructs the signed
  // value from the two columns rather than assuming amount_cents' sign encodes it.
  function signedAmountCents(line) {
    const magnitude = Number(line.amount_cents);
    return line.credit_debit_indicator === 'debit' ? -magnitude : magnitude;
  }

  function buildSplitLines({ bankAccountId, splits, totalAmountCents }) {
    const inflow = totalAmountCents >= 0;
    const magnitude = Math.abs(totalAmountCents);
    const bankLine = {
      account_id: bankAccountId,
      program_id: splits[0].programId,
      debit_cents: inflow ? magnitude : 0,
      credit_cents: inflow ? 0 : magnitude,
    };
    const codedLines = splits.map((s) => ({
      account_id: s.accountId,
      program_id: s.programId,
      grant_id: s.grantId,
      donor_restriction_class: s.restrictionClass,
      debit_cents: inflow ? 0 : s.amountCents,
      credit_cents: inflow ? s.amountCents : 0,
    }));
    return [bankLine, ...codedLines];
  }

  function parseSplits(body) {
    // Cash Coding sends an explicit `splits` array; Reconcile's plain Create sends a single
    // account_id/program_id/grant_id/donor_restriction_class at the top level -- normalized to
    // the same one-split shape here so both callers share buildSplitLines().
    const rawSplits = Array.isArray(body.splits) && body.splits.length > 0
      ? body.splits
      : [{ account_id: body.account_id, program_id: body.program_id, grant_id: body.grant_id, donor_restriction_class: body.donor_restriction_class, amount_cents: body.amount_cents }];

    const splits = [];
    for (let i = 0; i < rawSplits.length; i++) {
      const s = rawSplits[i] || {};
      const accountId = Number.parseInt(String(s.account_id), 10);
      const programId = Number.parseInt(String(s.program_id), 10);
      if (!Number.isInteger(accountId) || accountId < 1) return { error: `split ${i + 1}: account_id is required` };
      if (!Number.isInteger(programId) || programId < 1) return { error: `split ${i + 1}: program_id is required` };
      let grantId = null;
      if (s.grant_id != null && s.grant_id !== '') {
        grantId = Number.parseInt(String(s.grant_id), 10);
        if (!Number.isInteger(grantId) || grantId < 1) return { error: `split ${i + 1}: grant_id must be a positive integer if provided` };
      }
      let restrictionClass = null;
      if (s.donor_restriction_class != null && s.donor_restriction_class !== '') {
        restrictionClass = String(s.donor_restriction_class);
        if (!RESTRICTION_CLASSES.has(restrictionClass)) {
          return { error: `split ${i + 1}: donor_restriction_class must be one of unrestricted, temporarily_restricted, permanently_restricted` };
        }
      }
      splits.push({ accountId, programId, grantId, restrictionClass, amountCents: s.amount_cents });
    }
    return { splits };
  }

  async function loadOwnStatementLine(orgId, lineId) {
    const r = await pool.query(
      `SELECT * FROM org_bank_statement_lines WHERE id = $1 AND org_id = $2`,
      [lineId, orgId]
    );
    return r.rows[0] || null;
  }

  /**
   * Shared by the single-line Create endpoint (Reconcile) and the bulk endpoint (Cash Coding).
   * Loads the line, validates it's codeable, fills in each split's amount_cents when omitted
   * (the common single-split case just uses the line's full amount), builds the ledger lines,
   * posts, and updates the statement line's status. Returns { httpStatus, body } uniformly, same
   * convention as postLedgerTransaction, so callers never need their own try/catch shape.
   */
  async function codeStatementLineAsCreate(orgId, userId, lineId, { splits, memo, payee, referenceNumber, codingSource, appliedRuleId }) {
    const line = await loadOwnStatementLine(orgId, lineId);
    if (!line) return { httpStatus: 404, body: { error: 'Statement line not found' } };
    if (line.status !== 'unconfirmed') {
      return { httpStatus: 409, body: { error: `Line is already ${line.status}`, code: 'already_coded' } };
    }

    const totalAmountCents = signedAmountCents(line);
    const magnitude = Math.abs(totalAmountCents);
    // A single split with no explicit amount defaults to the line's full amount (Reconcile's
    // plain Create case); an explicit multi-split set must be given real amounts by the caller.
    const filledSplits = splits.map((s, i) => ({
      ...s,
      amountCents: s.amountCents != null ? Number.parseInt(String(s.amountCents), 10)
        : (splits.length === 1 ? magnitude : NaN),
    }));
    if (filledSplits.some((s) => !Number.isInteger(s.amountCents) || s.amountCents <= 0)) {
      return { httpStatus: 400, body: { error: 'Each split needs a positive amount_cents' } };
    }
    const splitSum = filledSplits.reduce((sum, s) => sum + s.amountCents, 0);
    if (splitSum !== magnitude) {
      return { httpStatus: 400, body: { error: `Split amounts (${splitSum}) must sum to the line's total (${magnitude})` } };
    }

    const lines = buildSplitLines({ bankAccountId: line.bank_account_id, splits: filledSplits, totalAmountCents });
    const result = await postLedgerTransaction(pool, {
      orgId, userId,
      transactionDate: String(line.statement_date).slice(0, 10),
      memo: memo != null ? memo : line.description_raw,
      payee: payee != null ? payee : line.payee_raw,
      referenceNumber: referenceNumber != null ? referenceNumber : null,
      lines, source: 'bank_reconciliation',
    });
    if (result.httpStatus >= 400) return result;

    await pool.query(
      `UPDATE org_bank_statement_lines
       SET status = 'confirmed', ledger_transaction_id = $1, coding_source = $4, applied_rule_id = $5,
           discuss_resolved_at = CASE WHEN discuss_note IS NOT NULL AND discuss_resolved_at IS NULL THEN NOW() ELSE discuss_resolved_at END
       WHERE id = $2 AND org_id = $3`,
      [result.body.id, lineId, orgId, codingSource === 'rule' ? 'rule' : 'manual', codingSource === 'rule' ? (appliedRuleId || null) : null]
    );
    return { httpStatus: 201, body: { id: lineId, status: 'confirmed', ledger_transaction_id: result.body.id, ledger_status: result.body.status } };
  }

  /** Create tab (Reconcile view): code the line to account + program + grant + restriction. */
  app.post('/api/organizational/orgs/:slug/bank-statement-lines/:id/create', ...orgAuth, async (req, res) => {
    const lineId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(lineId) || lineId < 1) return res.status(400).json({ error: 'invalid line id' });
    const body = req.body || {};
    const { error, splits } = parseSplits(body);
    if (error) return res.status(400).json({ error });

    try {
      const result = await codeStatementLineAsCreate(req.orgId, req.user.user_id ?? req.user.id, lineId, {
        splits,
        memo: body.memo != null ? String(body.memo) : null,
        payee: body.payee != null ? String(body.payee) : null,
        referenceNumber: body.reference_number != null ? String(body.reference_number) : null,
        codingSource: body.coding_source === 'rule' ? 'rule' : 'manual',
        appliedRuleId: body.applied_rule_id != null ? Number.parseInt(String(body.applied_rule_id), 10) : null,
      });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('POST /bank-statement-lines/:id/create:', e.message);
      return res.status(500).json({ error: 'Could not code this line' });
    }
  });

  /**
   * Coding memory (Create tab auto-suggestion) -- Xero's own bank rules learn from prior manual
   * codings by payee; this is the same idea in its simplest form: look at the most recent time
   * THIS org coded a Create-tab line for the same payee to a single account, and offer it back
   * as a pre-fill. Deliberately narrow: only single-split prior codings count (a multi-split
   * history is ambiguous about which line the payee "usually" goes to), and only plain Create
   * codings (source='bank_reconciliation') -- a Match or Transfer coding says nothing about which
   * expense/revenue account a fresh Create-tab entry for this payee should default to.
   */
  app.get('/api/organizational/orgs/:slug/bank-statement-lines/:id/coding-suggestion', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const lineId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(lineId) || lineId < 1) return res.status(400).json({ error: 'invalid line id' });
    try {
      const line = await loadOwnStatementLine(orgId, lineId);
      if (!line) return res.status(404).json({ error: 'Statement line not found' });
      const payee = String(line.payee_raw || '').trim();
      if (!payee) return res.json({ suggestion: null });

      const r = await pool.query(
        `SELECT l.account_id, a.code AS account_code, a.name AS account_name, l.program_id, p.name AS program_name,
                l.grant_id, l.donor_restriction_class::text AS donor_restriction_class
         FROM org_bank_statement_lines bsl
         JOIN org_ledger_transactions t ON t.id = bsl.ledger_transaction_id AND t.source = 'bank_reconciliation'
         JOIN (SELECT transaction_id, COUNT(*) AS line_count FROM org_ledger_lines GROUP BY transaction_id) lc
           ON lc.transaction_id = t.id AND lc.line_count = 2
         JOIN org_ledger_lines l ON l.transaction_id = t.id AND l.account_id != bsl.bank_account_id
         JOIN org_accounts a ON a.id = l.account_id
         JOIN org_programs p ON p.id = l.program_id
         WHERE bsl.org_id = $1 AND bsl.status = 'confirmed' AND bsl.is_internal_transfer = false
           AND bsl.id != $2 AND lower(trim(bsl.payee_raw)) = lower($3)
         ORDER BY bsl.statement_date DESC, bsl.id DESC
         LIMIT 1`,
        [orgId, lineId, payee]
      );
      if (!r.rows.length) return res.json({ suggestion: null });
      const row = r.rows[0];
      return res.json({
        suggestion: {
          account_id: row.account_id, account_code: row.account_code, account_name: row.account_name,
          program_id: row.program_id, program_name: row.program_name,
          grant_id: row.grant_id, donor_restriction_class: row.donor_restriction_class,
        },
      });
    } catch (e) {
      console.error('GET /bank-statement-lines/:id/coding-suggestion:', e.message);
      return res.status(500).json({ error: 'Could not load coding suggestion' });
    }
  });

  /**
   * Match candidates (Reconcile tab's Match action) -- the piece Bank_Reconciliation_V1_Spec.md
   * originally scoped down to near-nothing ("limited in V1 since there's no AP/AR/bills
   * module"), now real: Purchases/Sales/payment-recording exist. Modeled directly on how Xero's
   * own Find & Match works -- search outstanding bills/invoices by amount/date/payee, not just
   * an exact-match lookup -- because the whole reason Match matters is Xero's own documented
   * failure mode: coding a bank line as a fresh Create transaction when it actually corresponds
   * to an existing bill/invoice produces a duplicate entry and a wrong bank balance.
   *
   * Two candidate shapes, not one:
   *  - `bills`/`invoices`: an unpaid bill or invoice with no payment recorded yet. Confirming
   *    this kind calls recordBillPayment()/recordInvoicePayment() -- the exact same function the
   *    bill/invoice panel's own "Record payment" button calls -- so there is structurally one
   *    posting path, not two.
   *  - `outstanding_bill_payments`/`outstanding_invoice_payments`: a payment ALREADY recorded
   *    from the bill/invoice panel (a check written before it cleared), whose ledger transaction
   *    has no linked statement line yet -- the "outstanding payments/receipts" concept the spec
   *    already named for the reconciliation report's balance formula, extended here to the
   *    Match action itself. Confirming this kind posts nothing new -- it only links the existing
   *    transaction to this statement line, since the money movement was already recorded.
   *
   * Direction matters: a debit line (money out) can only match bills/outstanding-bill-payments;
   * a credit line (money in) can only match invoices/outstanding-invoice-payments -- coding a
   * deposit against a bill would be nonsensical and is rejected at candidate-search time, not
   * left for the confirm step to catch.
   */
  app.get('/api/organizational/orgs/:slug/bank-statement-lines/:id/match-candidates', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const lineId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(lineId) || lineId < 1) return res.status(400).json({ error: 'invalid line id' });
    try {
      const line = await loadOwnStatementLine(orgId, lineId);
      if (!line) return res.status(404).json({ error: 'Statement line not found' });
      const amountCents = Number(line.amount_cents);
      const amountLowCents = Math.round(amountCents * 0.98);
      const amountHighCents = Math.round(amountCents * 1.02);
      const payeeText = String(line.payee_raw || line.description_raw || '').toLowerCase();
      const dateFrom = new Date(new Date(line.statement_date).getTime() - 15 * 86400000).toISOString().slice(0, 10);
      const dateTo = new Date(new Date(line.statement_date).getTime() + 15 * 86400000).toISOString().slice(0, 10);

      const candidates = {
        bills: [], invoices: [], outstanding_bill_payments: [], outstanding_invoice_payments: [], outstanding_transfers: [],
        grant_gifts: [], grant_gifts_excluded_no_account: [],
        membership_dues: [], membership_dues_excluded_no_account: [],
        sponsored_project_disbursements: [], sponsored_project_disbursements_excluded_no_account: [],
      };

      // The other side of a Transfer already coded on one of this org's OTHER cash accounts --
      // researched against Xero's real behavior (a direct two-account posting, no clearing
      // account, auto-matched once the destination's own statement line arrives) rather than
      // assumed. Found via the source line's own transfer_pending status + is_internal_transfer
      // flag, not by trying to infer "this was a transfer" from the ledger transaction alone
      // (source='bank_reconciliation' isn't unique to transfers -- Create uses it too).
      const transferR = await pool.query(
        `SELECT src.id AS source_line_id, t.id AS ledger_transaction_id, t.transaction_date, t.memo,
                srcacct.name AS source_account_name, GREATEST(l.debit_cents, l.credit_cents) AS amount_cents
         FROM org_bank_statement_lines src
         JOIN org_ledger_transactions t ON t.id = src.ledger_transaction_id
         JOIN org_ledger_lines l ON l.transaction_id = t.id AND l.account_id = $1
         JOIN org_accounts srcacct ON srcacct.id = src.bank_account_id
         WHERE src.org_id = $2 AND src.is_internal_transfer IS TRUE AND src.status = 'transfer_pending'
           AND src.bank_account_id != $1
           AND NOT EXISTS (SELECT 1 FROM org_bank_statement_lines other WHERE other.ledger_transaction_id = t.id AND other.id != src.id)
           AND t.transaction_date BETWEEN $3 AND $4
           AND GREATEST(l.debit_cents, l.credit_cents) BETWEEN $5 AND $6
         ORDER BY ABS(t.transaction_date - $7::date)`,
        [line.bank_account_id, orgId, dateFrom, dateTo, amountLowCents, amountHighCents, line.statement_date]
      );
      candidates.outstanding_transfers = transferR.rows.map((r) => ({ id: r.source_line_id, ledger_transaction_id: r.ledger_transaction_id, source_account_name: r.source_account_name, transaction_date: r.transaction_date, amount_cents: String(r.amount_cents), memo: r.memo }));

      if (line.credit_debit_indicator === 'debit') {
        const billsR = await pool.query(
          `SELECT * FROM (
             SELECT b.id, b.reference, b.bill_date, b.due_date, c.display_name AS vendor_name,
                    COALESCE((SELECT SUM(amount_cents) FROM org_bill_lines WHERE bill_id = b.id), 0)
                      - COALESCE((SELECT SUM(amount_cents) FROM org_bill_payments WHERE bill_id = b.id AND status = 'posted'), 0) AS remaining_cents
             FROM org_bills b JOIN org_constituents c ON c.id = b.constituent_id
             WHERE b.org_id = $1 AND b.status IN ('approved', 'scheduled', 'partially_paid') AND b.bill_date BETWEEN $2 AND $3
           ) candidate
           WHERE remaining_cents BETWEEN 1 AND $4
           ORDER BY ABS(bill_date - $5::date)`,
          [orgId, dateFrom, dateTo, amountHighCents, line.statement_date]
        );
        candidates.bills = billsR.rows.map((r) => ({ id: r.id, reference: r.reference, vendor_name: r.vendor_name, bill_date: r.bill_date, due_date: r.due_date, remaining_cents: String(r.remaining_cents), name_match: payeeText && String(r.vendor_name || '').toLowerCase().includes(payeeText.split(' ')[0]) }));

        const outR = await pool.query(
          `SELECT p.id, p.bill_id, p.payment_date, p.amount_cents, p.ledger_transaction_id, b.reference, c.display_name AS vendor_name
           FROM org_bill_payments p
           JOIN org_bills b ON b.id = p.bill_id
           JOIN org_constituents c ON c.id = b.constituent_id
           WHERE p.org_id = $1 AND p.status = 'posted' AND p.amount_cents BETWEEN $2 AND $3
             AND p.payment_date BETWEEN $4 AND $5
             AND NOT EXISTS (SELECT 1 FROM org_bank_statement_lines l2 WHERE l2.ledger_transaction_id = p.ledger_transaction_id)
             AND NOT EXISTS (SELECT 1 FROM org_bank_statement_line_postings sp WHERE sp.ledger_transaction_id = p.ledger_transaction_id)
           ORDER BY ABS(p.payment_date - $6::date)`,
          [orgId, amountLowCents, amountHighCents, dateFrom, dateTo, line.statement_date]
        );
        candidates.outstanding_bill_payments = outR.rows.map((r) => ({ id: r.id, bill_id: r.bill_id, reference: r.reference, vendor_name: r.vendor_name, payment_date: r.payment_date, amount_cents: String(r.amount_cents), ledger_transaction_id: r.ledger_transaction_id }));

        // Approved sponsored-project disbursements awaiting the actual outgoing payment --
        // approval alone posts nothing (see sponsoredProjectDisbursementPayment.js).
        const spDisbR = await pool.query(
          `SELECT d.id, d.amount_cents, d.disbursement_date, sp.id AS project_id, sp.name AS project_name, sp.disbursement_expense_account_id
           FROM org_sponsored_project_disbursements d
           JOIN org_sponsored_projects sp ON sp.id = d.sponsored_project_id
           WHERE d.org_id = $1 AND d.status = 'approved' AND d.ledger_transaction_id IS NULL
             AND d.amount_cents BETWEEN $2 AND $3
             AND d.disbursement_date BETWEEN $4 AND $5
           ORDER BY ABS(d.disbursement_date - $6::date)`,
          [orgId, amountLowCents, amountHighCents, dateFrom, dateTo, line.statement_date]
        );
        candidates.sponsored_project_disbursements = spDisbR.rows
          .filter((r) => r.disbursement_expense_account_id != null)
          .map((r) => ({ id: r.id, project_id: r.project_id, project_name: r.project_name, disbursement_date: r.disbursement_date, amount_cents: String(r.amount_cents) }));
        candidates.sponsored_project_disbursements_excluded_no_account = spDisbR.rows
          .filter((r) => r.disbursement_expense_account_id == null)
          .map((r) => ({ id: r.id, project_id: r.project_id, project_name: r.project_name, amount_cents: String(r.amount_cents) }));
      } else {
        const invR = await pool.query(
          `SELECT * FROM (
             SELECT i.id, i.reference, i.invoice_date, i.due_date, c.display_name AS customer_name,
                    COALESCE((SELECT SUM(ROUND(quantity * unit_amount_cents)) FROM org_invoice_lines WHERE invoice_id = i.id), 0)
                      - COALESCE((SELECT SUM(amount_cents) FROM org_invoice_payments WHERE invoice_id = i.id AND status = 'posted'), 0) AS remaining_cents
             FROM org_invoices i JOIN org_constituents c ON c.id = i.constituent_id
             WHERE i.org_id = $1 AND i.status IN ('sent', 'partially_paid', 'overdue') AND i.invoice_date BETWEEN $2 AND $3
           ) candidate
           WHERE remaining_cents BETWEEN 1 AND $4
           ORDER BY ABS(invoice_date - $5::date)`,
          [orgId, dateFrom, dateTo, amountHighCents, line.statement_date]
        );
        candidates.invoices = invR.rows.map((r) => ({ id: r.id, reference: r.reference, customer_name: r.customer_name, invoice_date: r.invoice_date, due_date: r.due_date, remaining_cents: String(r.remaining_cents), name_match: payeeText && String(r.customer_name || '').toLowerCase().includes(payeeText.split(' ')[0]) }));

        const outR = await pool.query(
          `SELECT p.id, p.invoice_id, p.payment_date, p.amount_cents, p.ledger_transaction_id, i.reference, c.display_name AS customer_name
           FROM org_invoice_payments p
           JOIN org_invoices i ON i.id = p.invoice_id
           JOIN org_constituents c ON c.id = i.constituent_id
           WHERE p.org_id = $1 AND p.status = 'posted' AND p.amount_cents BETWEEN $2 AND $3
             AND p.payment_date BETWEEN $4 AND $5
             AND NOT EXISTS (SELECT 1 FROM org_bank_statement_lines l2 WHERE l2.ledger_transaction_id = p.ledger_transaction_id)
             AND NOT EXISTS (SELECT 1 FROM org_bank_statement_line_postings sp WHERE sp.ledger_transaction_id = p.ledger_transaction_id)
           ORDER BY ABS(p.payment_date - $6::date)`,
          [orgId, amountLowCents, amountHighCents, dateFrom, dateTo, line.statement_date]
        );
        candidates.outstanding_invoice_payments = outR.rows.map((r) => ({ id: r.id, invoice_id: r.invoice_id, reference: r.reference, customer_name: r.customer_name, payment_date: r.payment_date, amount_cents: String(r.amount_cents), ledger_transaction_id: r.ledger_transaction_id }));

        // Cash grant gifts recorded in Donors (org_gifts.posting_status = 'unposted') --
        // grants with no default revenue_account_id are excluded here, with the reason
        // surfaced separately, rather than shown as a broken candidate with no way to confirm.
        const grantGiftR = await pool.query(
          `SELECT g.id, g.amount_cents, g.received_at, gr.id AS grant_id, gr.name AS grant_name,
                  gr.funder, gr.revenue_account_id, c.display_name AS constituent_name
           FROM org_gifts g
           JOIN org_grants gr ON gr.id = g.grant_id
           LEFT JOIN org_constituents c ON c.id = g.constituent_id
           WHERE g.org_id = $1 AND g.gift_type = 'grant' AND g.posting_status = 'unposted'
             AND g.amount_cents BETWEEN $2 AND $3
             AND g.received_at::date BETWEEN $4 AND $5
           ORDER BY ABS(g.received_at::date - $6::date)`,
          [orgId, amountLowCents, amountHighCents, dateFrom, dateTo, line.statement_date]
        );
        candidates.grant_gifts = grantGiftR.rows
          .filter((r) => r.revenue_account_id != null)
          .map((r) => ({ id: r.id, grant_id: r.grant_id, grant_name: r.grant_name, funder: r.funder, constituent_name: r.constituent_name, received_at: r.received_at, amount_cents: String(r.amount_cents) }));
        candidates.grant_gifts_excluded_no_account = grantGiftR.rows
          .filter((r) => r.revenue_account_id == null)
          .map((r) => ({ id: r.id, grant_id: r.grant_id, grant_name: r.grant_name, amount_cents: String(r.amount_cents) }));

        // Dues payments recorded in Membership, awaiting the real deposit -- confirming posts
        // to the member's tier's default revenue account (see membershipDuesPayment.js).
        const duesR = await pool.query(
          `SELECT p.id, p.amount_cents, p.payment_date, m.first_name, m.last_name, t.id AS tier_id, t.name AS tier_name, t.revenue_account_id
           FROM org_membership_payments p
           JOIN org_members m ON m.id = p.member_id
           LEFT JOIN org_membership_tiers t ON t.id = m.tier_id
           WHERE m.org_id = $1 AND p.posting_status = 'unposted'
             AND p.amount_cents BETWEEN $2 AND $3
             AND p.payment_date::date BETWEEN $4 AND $5
           ORDER BY ABS(p.payment_date::date - $6::date)`,
          [orgId, amountLowCents, amountHighCents, dateFrom, dateTo, line.statement_date]
        );
        candidates.membership_dues = duesR.rows
          .filter((r) => r.revenue_account_id != null)
          .map((r) => ({ id: r.id, member_name: `${r.first_name} ${r.last_name}`.trim(), tier_name: r.tier_name, payment_date: r.payment_date, amount_cents: String(r.amount_cents) }));
        candidates.membership_dues_excluded_no_account = duesR.rows
          .filter((r) => r.revenue_account_id == null)
          .map((r) => ({ id: r.id, member_name: `${r.first_name} ${r.last_name}`.trim(), tier_id: r.tier_id, tier_name: r.tier_name, amount_cents: String(r.amount_cents) }));
      }

      return res.json(candidates);
    } catch (e) {
      console.error('GET /bank-statement-lines/:id/match-candidates:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not load match candidates' });
    }
  });

  /**
   * Shared by the single-line Match endpoint (Reconcile) and the bulk endpoint (Cash Coding,
   * added 2026-09-11) -- same reasoning as codeStatementLineAsCreate above: one posting path
   * regardless of entry point, not two subtly different reimplementations of the same direction
   * checks and outstanding-transfer pairing logic.
   */
  async function matchStatementLine(orgId, userId, lineId, { matchType, targetId }) {
    const MATCH_TYPES = ['bill', 'invoice', 'outstanding_bill_payment', 'outstanding_invoice_payment', 'outstanding_transfer', 'grant_gift', 'membership_dues', 'sponsored_project_disbursement'];
    if (!MATCH_TYPES.includes(matchType)) {
      return { httpStatus: 400, body: { error: `match_type must be one of: ${MATCH_TYPES.join(', ')}` } };
    }
    if (!Number.isInteger(targetId) || targetId < 1) return { httpStatus: 400, body: { error: 'target_id is required' } };

    const line = await loadOwnStatementLine(orgId, lineId);
    if (!line) return { httpStatus: 404, body: { error: 'Statement line not found' } };
    if (line.status !== 'unconfirmed') {
      return { httpStatus: 409, body: { error: `Line is already ${line.status}`, code: 'already_coded' } };
    }
    if ((matchType === 'bill' || matchType === 'outstanding_bill_payment' || matchType === 'sponsored_project_disbursement') && line.credit_debit_indicator !== 'debit') {
      return { httpStatus: 422, body: { error: 'A bill/disbursement payment match requires a debit (money-out) line', code: 'wrong_direction' } };
    }
    if ((matchType === 'invoice' || matchType === 'outstanding_invoice_payment' || matchType === 'grant_gift' || matchType === 'membership_dues') && line.credit_debit_indicator !== 'credit') {
      return { httpStatus: 422, body: { error: 'A grant/invoice/dues payment match requires a credit (money-in) line', code: 'wrong_direction' } };
    }

    if (matchType === 'outstanding_transfer') {
      // targetId here is the SOURCE statement line's own id (candidateRows/match-candidates
      // returns it as `id`) -- confirming pairs both sides: this line links to the same
      // ledger transaction and both lines record transfer_pair_line_id, then both flip to
      // confirmed, since neither side is genuinely "pending" once both exist.
      const srcR = await pool.query(
        `SELECT * FROM org_bank_statement_lines WHERE id = $1 AND org_id = $2 AND is_internal_transfer IS TRUE AND status = 'transfer_pending'`,
        [targetId, orgId]
      );
      if (!srcR.rows.length) return { httpStatus: 404, body: { error: 'Outstanding transfer not found' } };
      const src = srcR.rows[0];
      const alreadyPaired = await pool.query(`SELECT 1 FROM org_bank_statement_lines WHERE ledger_transaction_id = $1 AND id != $2`, [src.ledger_transaction_id, targetId]);
      if (alreadyPaired.rows.length) return { httpStatus: 409, body: { error: 'That transfer is already paired with another statement line', code: 'already_linked' } };

      await pool.query(
        `UPDATE org_bank_statement_lines SET status = 'confirmed', ledger_transaction_id = $1, transfer_pair_line_id = $2, is_internal_transfer = true, coding_source = 'manual',
           discuss_resolved_at = CASE WHEN discuss_note IS NOT NULL AND discuss_resolved_at IS NULL THEN NOW() ELSE discuss_resolved_at END
         WHERE id = $3 AND org_id = $4`,
        [src.ledger_transaction_id, src.id, lineId, orgId]
      );
      await pool.query(
        `UPDATE org_bank_statement_lines SET status = 'confirmed', transfer_pair_line_id = $1 WHERE id = $2 AND org_id = $3`,
        [lineId, src.id, orgId]
      );
      return { httpStatus: 200, body: { id: lineId, status: 'confirmed', ledger_transaction_id: src.ledger_transaction_id, paired_with_line_id: src.id } };
    }

    let ledgerTransactionId;
    if (matchType === 'bill') {
      const result = await recordBillPayment(pool, {
        orgId, userId, billId: targetId, bankAccountId: line.bank_account_id,
        paymentDate: String(line.statement_date).slice(0, 10), amountCents: Number(line.amount_cents),
        reference: line.payee_raw || line.description_raw || null,
      });
      if (result.httpStatus >= 400) return result;
      ledgerTransactionId = result.body.ledger_transaction_id;
    } else if (matchType === 'invoice') {
      const result = await recordInvoicePayment(pool, {
        orgId, userId, invoiceId: targetId, bankAccountId: line.bank_account_id,
        paymentDate: String(line.statement_date).slice(0, 10), amountCents: Number(line.amount_cents),
        reference: line.payee_raw || line.description_raw || null,
      });
      if (result.httpStatus >= 400) return result;
      ledgerTransactionId = result.body.ledger_transaction_id;
    } else if (matchType === 'grant_gift') {
      const result = await recordGrantGiftPayment(pool, {
        orgId, userId, giftId: targetId, bankAccountId: line.bank_account_id,
        paymentDate: String(line.statement_date).slice(0, 10), amountCents: Number(line.amount_cents),
        reference: line.payee_raw || line.description_raw || null,
      });
      if (result.httpStatus >= 400) return result;
      ledgerTransactionId = result.body.ledger_transaction_id;
    } else if (matchType === 'membership_dues') {
      const result = await recordMembershipDuesPayment(pool, {
        orgId, userId, paymentId: targetId, bankAccountId: line.bank_account_id,
        paymentDate: String(line.statement_date).slice(0, 10), amountCents: Number(line.amount_cents),
        reference: line.payee_raw || line.description_raw || null,
      });
      if (result.httpStatus >= 400) return result;
      ledgerTransactionId = result.body.ledger_transaction_id;
    } else if (matchType === 'sponsored_project_disbursement') {
      const result = await recordSponsoredProjectDisbursementPayment(pool, {
        orgId, userId, disbursementId: targetId, bankAccountId: line.bank_account_id,
        paymentDate: String(line.statement_date).slice(0, 10), amountCents: Number(line.amount_cents),
        reference: line.payee_raw || line.description_raw || null,
      });
      if (result.httpStatus >= 400) return result;
      ledgerTransactionId = result.body.ledger_transaction_id;
    } else {
      // outstanding_bill_payment / outstanding_invoice_payment -- the payment already posted
      // from the bill/invoice panel; this line just links to it. Nothing new posts.
      const table = matchType === 'outstanding_bill_payment' ? 'org_bill_payments' : 'org_invoice_payments';
      const payR = await pool.query(`SELECT ledger_transaction_id FROM ${table} WHERE id = $1 AND org_id = $2 AND status = 'posted'`, [targetId, orgId]);
      if (!payR.rows.length) return { httpStatus: 404, body: { error: 'Outstanding payment not found' } };
      const alreadyLinked = await pool.query(`SELECT 1 FROM org_bank_statement_lines WHERE ledger_transaction_id = $1 AND id != $2`, [payR.rows[0].ledger_transaction_id, lineId]);
      if (alreadyLinked.rows.length) return { httpStatus: 409, body: { error: 'That payment is already linked to another statement line', code: 'already_linked' } };
      ledgerTransactionId = payR.rows[0].ledger_transaction_id;
    }

    await pool.query(
      `UPDATE org_bank_statement_lines
       SET status = 'confirmed', ledger_transaction_id = $1, coding_source = 'manual',
           discuss_resolved_at = CASE WHEN discuss_note IS NOT NULL AND discuss_resolved_at IS NULL THEN NOW() ELSE discuss_resolved_at END
       WHERE id = $2 AND org_id = $3`,
      [ledgerTransactionId, lineId, orgId]
    );
    return { httpStatus: 200, body: { id: lineId, status: 'confirmed', ledger_transaction_id: ledgerTransactionId } };
  }

  app.post('/api/organizational/orgs/:slug/bank-statement-lines/:id/match', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const lineId = Number.parseInt(String(req.params.id), 10);
    const body = req.body || {};
    if (!Number.isInteger(lineId) || lineId < 1) return res.status(400).json({ error: 'invalid line id' });

    try {
      const result = await matchStatementLine(orgId, userId, lineId, {
        matchType: String(body.match_type || ''),
        targetId: Number.parseInt(String(body.target_id), 10),
      });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('POST /bank-statement-lines/:id/match:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not match this line' });
    }
  });

  /**
   * Multi-select Find & Match (Xero's real behavior, researched via the same screenshot/spec
   * discussion as the rest of Bank Reconciliation V2): tick several open bills OR several open
   * invoices against one bank line -- never mixed, since one line has one direction -- with a
   * running total that must equal the line's amount exactly. Each item can carry a partial
   * amount now that bills support partial payment same as invoices (migration 222), matching
   * Xero's own Split affordance in spirit without a separate Split UI mode.
   *
   * Unlike single Match, this can't set org_bank_statement_lines.ledger_transaction_id -- there
   * are N ledger transactions (one per recordBillPayment/recordInvoicePayment call, same shared
   * posting lib as everywhere else, so this is still structurally one posting path) against ONE
   * statement line. Each is recorded in org_bank_statement_line_postings (migration 223) instead;
   * the line itself is left with ledger_transaction_id = NULL and unreconcile below knows to look
   * in that table for a line confirmed with no singular transaction.
   *
   * Validates every item's remaining balance BEFORE posting any of them (read-only pass), then
   * posts one by one; if a later post still fails (a real race -- another request paid down the
   * same bill/invoice in between), voids whatever this request already posted rather than leaving
   * a half-matched line, since a partially-applied multi-match would misstate both the bank line
   * and the still-open bill/invoice balances.
   */
  app.post('/api/organizational/orgs/:slug/bank-statement-lines/:id/match-multi', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const lineId = Number.parseInt(String(req.params.id), 10);
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : null;
    if (!Number.isInteger(lineId) || lineId < 1) return res.status(400).json({ error: 'invalid line id' });
    if (!items || items.length < 2) return res.status(400).json({ error: 'items must be an array of at least 2 entries (use /match for a single item)' });

    const parsedItems = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const matchType = String(it.match_type || '');
      const targetId = Number.parseInt(String(it.target_id), 10);
      const amountCents = Number.parseInt(String(it.amount_cents), 10);
      if (!['bill', 'invoice'].includes(matchType)) return res.status(400).json({ error: `item ${i + 1}: match_type must be bill or invoice` });
      if (!Number.isInteger(targetId) || targetId < 1) return res.status(400).json({ error: `item ${i + 1}: target_id is required` });
      if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: `item ${i + 1}: amount_cents must be a positive integer` });
      parsedItems.push({ matchType, targetId, amountCents });
    }
    const matchTypes = new Set(parsedItems.map((it) => it.matchType));
    if (matchTypes.size > 1) return res.status(400).json({ error: 'A single bank line can only match all-bills or all-invoices, not a mix -- one line has one direction' });
    const matchType = parsedItems[0].matchType;

    try {
      const line = await loadOwnStatementLine(orgId, lineId);
      if (!line) return res.status(404).json({ error: 'Statement line not found' });
      if (line.status !== 'unconfirmed') {
        return res.status(409).json({ error: `Line is already ${line.status}`, code: 'already_coded' });
      }
      if (matchType === 'bill' && line.credit_debit_indicator !== 'debit') {
        return res.status(422).json({ error: 'A bill payment match requires a debit (money-out) line', code: 'wrong_direction' });
      }
      if (matchType === 'invoice' && line.credit_debit_indicator !== 'credit') {
        return res.status(422).json({ error: 'An invoice payment match requires a credit (money-in) line', code: 'wrong_direction' });
      }
      const sumCents = parsedItems.reduce((s, it) => s + it.amountCents, 0);
      if (sumCents !== Number(line.amount_cents)) {
        return res.status(422).json({ error: `Selected amounts (${sumCents}) must add up to the line's amount (${line.amount_cents}) exactly`, code: 'amount_mismatch' });
      }

      // Pre-validate every item's remaining balance before posting any of them.
      for (const it of parsedItems) {
        const remaining = matchType === 'bill'
          ? await billRemainingBalanceCents(pool, it.targetId)
          : await invoiceRemainingBalanceCents(pool, it.targetId);
        if (it.amountCents > remaining.remainingCents) {
          return res.status(422).json({
            error: `${matchType === 'bill' ? 'Bill' : 'Invoice'} #${it.targetId}: amount_cents (${it.amountCents}) exceeds the remaining balance (${remaining.remainingCents})`,
            code: 'exceeds_remaining_balance',
          });
        }
      }

      const posted = [];
      for (const it of parsedItems) {
        const result = matchType === 'bill'
          ? await recordBillPayment(pool, {
              orgId, userId, billId: it.targetId, bankAccountId: line.bank_account_id,
              paymentDate: String(line.statement_date).slice(0, 10), amountCents: it.amountCents,
              reference: line.payee_raw || line.description_raw || null,
            })
          : await recordInvoicePayment(pool, {
              orgId, userId, invoiceId: it.targetId, bankAccountId: line.bank_account_id,
              paymentDate: String(line.statement_date).slice(0, 10), amountCents: it.amountCents,
              reference: line.payee_raw || line.description_raw || null,
            });
        if (result.httpStatus >= 400) {
          // Roll back whatever this request already posted -- a half-applied multi-match would
          // misstate both the bank line and the still-open bill/invoice balances.
          for (const done of posted) {
            if (done.matchType === 'bill') {
              await voidBillPayment(pool, { orgId, userId, billId: done.targetId, paymentId: done.paymentId, reason: 'Automatic rollback: a later item in the same multi-match failed' }).catch(() => {});
            } else {
              await voidInvoicePayment(pool, { orgId, userId, invoiceId: done.targetId, paymentId: done.paymentId, reason: 'Automatic rollback: a later item in the same multi-match failed' }).catch(() => {});
            }
          }
          return res.status(result.httpStatus).json(result.body);
        }
        posted.push({ matchType, targetId: it.targetId, paymentId: result.body.id, ledgerTransactionId: result.body.ledger_transaction_id, amountCents: it.amountCents });
      }

      for (const p of posted) {
        await pool.query(
          `INSERT INTO org_bank_statement_line_postings (statement_line_id, ledger_transaction_id, amount_cents) VALUES ($1, $2, $3)`,
          [lineId, p.ledgerTransactionId, p.amountCents]
        );
      }
      await pool.query(
        `UPDATE org_bank_statement_lines
         SET status = 'confirmed', coding_source = 'manual',
             discuss_resolved_at = CASE WHEN discuss_note IS NOT NULL AND discuss_resolved_at IS NULL THEN NOW() ELSE discuss_resolved_at END
         WHERE id = $1 AND org_id = $2`,
        [lineId, orgId]
      );
      return res.json({ id: lineId, status: 'confirmed', postings: posted.map((p) => ({ match_type: p.matchType, target_id: p.targetId, ledger_transaction_id: p.ledgerTransactionId, amount_cents: p.amountCents })) });
    } catch (e) {
      console.error('POST /bank-statement-lines/:id/match-multi:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not match this line' });
    }
  });

  /**
   * BUILT (2026-09-10) -- transfer-pair matching, as an `outstanding_transfer` match-candidate
   * type (see match-candidates above and the outstanding_transfer branch in /match). Researched
   * against Xero's real behavior first rather than assumed: Xero posts a direct double-entry
   * between the two real bank accounts (no clearing account) and "creates an automatic green
   * Match in the other bank account" once that account's own statement line arrives -- this
   * mirrors that. When a Transfer specifies a real destination account (not the clearing-account
   * fallback for an untracked external account), the destination's own future statement line
   * finds the source as a candidate and confirming just pairs the two rows (transfer_pair_line_id
   * both ways) rather than posting a second transaction.
   *
   * The RLS-scoping discipline this comment originally existed to enforce before the query was
   * written was followed, not skipped: org_id is passed as an explicit bound parameter and
   * filtered directly (`WHERE src.org_id = $2`) rather than trusted to the ambient RLS GUC alone,
   * and this route only ever runs inside a real request (requireOrgMembership's middleware chain
   * has already entered org context by the time this handler runs) -- there's no background-job
   * or batch-reconciler code path here that could run outside that context and silently narrow
   * to zero rows the way the original migration-200 bug did. Verified live against demo-company
   * (not just read for correctness): posted a transfer with a real destination account, confirmed
   * the source line's own ledger entry balanced correctly, inserted a matching statement line on
   * the destination account, confirmed it showed up as an outstanding_transfer candidate, and
   * confirmed pairing it set transfer_pair_line_id on both rows and flipped both to confirmed
   * without a second ledger transaction ever posting.
   */
  /**
   * A transfer between the org's own bank accounts has no P&L impact -- confirmed against
   * Xero's own actual Transfer behavior (researched, not assumed): Xero posts a direct
   * double-entry between the two real bank accounts with no intermediate clearing account, and
   * "creates an automatic green Match in the other bank account" once that account's own
   * statement line arrives. This mirrors that: when destinationAccountId is a real cash account,
   * the two ledger lines are the source and destination accounts directly, and the destination's
   * own future statement line becomes an `outstanding_transfer` match-candidate (see
   * match-candidates below) rather than something the user has to code a second time. The
   * clearing-account path (org_get_or_create_clearing_account) is kept only as the fallback for
   * a transfer to an account this org doesn't track here (an external account, or destination
   * simply not specified) -- the one case with no second statement line to ever auto-match.
   * org_ledger_lines.program_id is still NOT NULL on every line, so this resolves the org's one
   * system "Internal Transfers" program automatically (migration 221) rather than asking for one.
   */
  async function codeStatementLineAsTransfer(orgId, userId, lineId, { destinationAccountId, referenceNumber, memo }) {
    const line = await loadOwnStatementLine(orgId, lineId);
    if (!line) return { httpStatus: 404, body: { error: 'Statement line not found' } };
    if (line.status !== 'unconfirmed') {
      return { httpStatus: 409, body: { error: `Line is already ${line.status}`, code: 'already_coded' } };
    }

    let counterpartyAccountId;
    let destinationAccountName = null;
    if (destinationAccountId != null) {
      const destR = await pool.query(
        `SELECT name FROM org_accounts WHERE id = $1 AND org_id = $2 AND is_cash_account IS TRUE`,
        [destinationAccountId, orgId]
      );
      if (!destR.rows.length) return { httpStatus: 400, body: { error: 'destination_account_id must be a cash account belonging to this organization' } };
      if (Number(destinationAccountId) === Number(line.bank_account_id)) {
        return { httpStatus: 400, body: { error: 'destination_account_id cannot be the same account this line is on' } };
      }
      destinationAccountName = destR.rows[0].name;
      counterpartyAccountId = destinationAccountId;
    } else {
      const clearingR = await pool.query(`SELECT org_get_or_create_clearing_account($1) AS id`, [orgId]);
      counterpartyAccountId = clearingR.rows[0].id;
    }

    const programR = await pool.query(`SELECT org_get_or_create_internal_transfer_program($1) AS id`, [orgId]);
    const transferProgramId = programR.rows[0].id;
    const totalAmountCents = signedAmountCents(line);

    const lines = buildSplitLines({
      bankAccountId: line.bank_account_id,
      splits: [{ accountId: counterpartyAccountId, programId: transferProgramId, grantId: null, restrictionClass: null, amountCents: Math.abs(totalAmountCents) }],
      totalAmountCents,
    });

    const defaultMemo = 'Internal transfer' + (destinationAccountName ? ' to ' + destinationAccountName : '') + (line.description_raw ? ': ' + line.description_raw : '');
    const result = await postLedgerTransaction(pool, {
      orgId, userId,
      transactionDate: String(line.statement_date).slice(0, 10),
      memo: memo != null && memo !== '' ? memo : defaultMemo,
      payee: line.payee_raw,
      referenceNumber: referenceNumber || null,
      lines, source: 'bank_reconciliation',
    });
    if (result.httpStatus >= 400) return result;

    await pool.query(
      `UPDATE org_bank_statement_lines
       SET status = 'transfer_pending', is_internal_transfer = true, ledger_transaction_id = $1,
           discuss_resolved_at = CASE WHEN discuss_note IS NOT NULL AND discuss_resolved_at IS NULL THEN NOW() ELSE discuss_resolved_at END
       WHERE id = $2 AND org_id = $3`,
      [result.body.id, lineId, orgId]
    );
    return { httpStatus: 201, body: { id: lineId, status: 'transfer_pending', ledger_transaction_id: result.body.id } };
  }

  app.post('/api/organizational/orgs/:slug/bank-statement-lines/:id/transfer', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const lineId = Number.parseInt(String(req.params.id), 10);
    const body = req.body || {};
    const destinationAccountId = body.destination_account_id != null && body.destination_account_id !== ''
      ? Number.parseInt(String(body.destination_account_id), 10) : null;

    if (!Number.isInteger(lineId) || lineId < 1) return res.status(400).json({ error: 'invalid line id' });
    if (destinationAccountId != null && (!Number.isInteger(destinationAccountId) || destinationAccountId < 1)) {
      return res.status(400).json({ error: 'destination_account_id must be a positive integer if provided' });
    }

    try {
      const result = await codeStatementLineAsTransfer(orgId, userId, lineId, {
        destinationAccountId,
        referenceNumber: body.reference != null ? String(body.reference) : null,
        memo: body.memo != null ? String(body.memo) : null,
      });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('POST /bank-statement-lines/:id/transfer:', e.message);
      return res.status(500).json({ error: 'Could not code this line as a transfer' });
    }
  });

  /** Discuss tab: an open-question flag, not a coding action -- keeps a line visibly flagged
   * without forcing a premature Create/Transfer or blocking the rest of the queue. */
  app.post('/api/organizational/orgs/:slug/bank-statement-lines/:id/discuss', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const lineId = Number.parseInt(String(req.params.id), 10);
    const note = req.body && req.body.note != null ? String(req.body.note).trim() : '';
    if (!Number.isInteger(lineId) || lineId < 1) return res.status(400).json({ error: 'invalid line id' });
    if (!note) return res.status(400).json({ error: 'note is required' });

    try {
      const r = await pool.query(
        `UPDATE org_bank_statement_lines SET discuss_note = $1, discuss_resolved_at = NULL
         WHERE id = $2 AND org_id = $3 RETURNING id`,
        [note, lineId, orgId]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'Statement line not found' });
      return res.json({ id: lineId, discuss_note: note });
    } catch (e) {
      console.error('POST /bank-statement-lines/:id/discuss:', e.message);
      return res.status(500).json({ error: 'Could not save discuss note' });
    }
  });

  /**
   * Cash Coding's "Save & Reconcile All" -- one commit for many lines, not per-line
   * confirmation. Each entry gets coded independently via the exact same
   * codeStatementLineAsCreate/codeStatementLineAsTransfer helpers Reconcile's single-line
   * endpoints use (same posting logic, same validation, same trigger set) -- this is not a
   * second implementation. Entries are processed one at a time, not wrapped in one shared DB
   * transaction, so one bad line (already coded by someone else since the grid loaded, a
   * validation failure) doesn't block the rest of the batch from committing -- matches the
   * CSV import's per-row error handling, and is more useful for a bulk grid than an
   * all-or-nothing failure.
   */
  app.post('/api/organizational/orgs/:slug/bank-statement-lines/bulk-code', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const codings = Array.isArray(req.body && req.body.codings) ? req.body.codings : null;
    if (!codings || !codings.length) {
      return res.status(400).json({ error: 'codings must be a non-empty array' });
    }

    const results = [];
    for (const c of codings) {
      const lineId = Number.parseInt(String(c.line_id), 10);
      if (!Number.isInteger(lineId) || lineId < 1) {
        results.push({ line_id: c.line_id, ok: false, error: 'invalid line id' });
        continue;
      }
      try {
        let result;
        if (c.is_match) {
          result = await matchStatementLine(orgId, userId, lineId, {
            matchType: String(c.match_type || ''),
            targetId: Number.parseInt(String(c.target_id), 10),
          });
        } else if (c.is_transfer) {
          const destinationAccountId = c.destination_account_id != null && c.destination_account_id !== ''
            ? Number.parseInt(String(c.destination_account_id), 10) : null;
          result = await codeStatementLineAsTransfer(orgId, userId, lineId, {
            destinationAccountId, referenceNumber: c.reference || null, memo: c.memo || null,
          });
        } else {
          const { error, splits } = parseSplits(c);
          if (error) { results.push({ line_id: lineId, ok: false, error }); continue; }
          result = await codeStatementLineAsCreate(orgId, userId, lineId, {
            splits, memo: c.memo || null, payee: c.payee || null, referenceNumber: c.reference_number || null,
            codingSource: c.coding_source === 'rule' ? 'rule' : 'manual',
            appliedRuleId: c.applied_rule_id != null ? Number.parseInt(String(c.applied_rule_id), 10) : null,
          });
        }
        if (result.httpStatus >= 400) {
          results.push({ line_id: lineId, ok: false, error: result.body.message || result.body.error, code: result.body.code });
        } else {
          results.push({ line_id: lineId, ok: true, ledger_transaction_id: result.body.ledger_transaction_id, status: result.body.status });
        }
      } catch (e) {
        console.error('POST /bank-statement-lines/bulk-code (line ' + lineId + '):', e.message);
        results.push({ line_id: lineId, ok: false, error: 'Could not code this line' });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    return res.json({ total: results.length, succeeded, failed: results.length - succeeded, results });
  });

  /**
   * Bank Reconciliation report (spec Section 1, mandatory for V1): does the bank balance tie to
   * the book balance. Formula: Ending Bank Statement Balance + Deposits in Transit -
   * Outstanding Unconfirmed Lines = Ending GL Cash Balance.
   *
   * What each term means given how this system actually works (V1 has no "GL entry recorded
   * before it hits the bank" path except a manual ledger post, so this isn't the textbook
   * definition by assumption -- it's derived from the two ways a ledger line can touch a cash
   * account here):
   *   - Ending GL Cash Balance: net movement in org_ledger_lines against this bank account,
   *     posted transactions only, up to and including the statement date.
   *   - Outstanding Unconfirmed Lines: statement lines already imported (on the real bank
   *     statement) but not yet coded (status IN unconfirmed/transfer_pending) -- on the bank,
   *     not yet in the GL.
   *   - Deposits in Transit: the other direction -- ledger lines against this bank account that
   *     did NOT originate from a coded statement line (no org_bank_statement_lines row points at
   *     that transaction) -- i.e. a manual Ledger-module entry against cash that hasn't shown up
   *     on an imported statement yet. In the GL, not yet on the bank.
   * A org can lock a fiscal year and does not need this report clean to do so -- read-only, like
   * the existing "Reconciliation & Close" advisory checks (reconciliation.js), never a gate.
   */
  app.get('/api/organizational/orgs/:slug/bank-statement-lines/reconciliation-report', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const bankAccountId = Number.parseInt(String(req.query.bank_account_id), 10);
    const statementDate = req.query.statement_date != null ? String(req.query.statement_date) : null;
    const endingBalanceCents = req.query.ending_balance_cents != null ? Number.parseInt(String(req.query.ending_balance_cents), 10) : null;

    if (!Number.isInteger(bankAccountId) || bankAccountId < 1) return res.status(400).json({ error: 'bank_account_id is required' });
    if (!statementDate || !DATE_RE.test(statementDate)) return res.status(400).json({ error: 'statement_date is required and must be YYYY-MM-DD' });
    if (!Number.isInteger(endingBalanceCents)) return res.status(400).json({ error: 'ending_balance_cents is required' });

    try {
      const acctR = await pool.query(
        `SELECT 1 FROM org_accounts WHERE id = $1 AND org_id = $2 AND is_cash_account IS TRUE`,
        [bankAccountId, orgId]
      );
      if (acctR.rows.length === 0) {
        return res.status(400).json({ error: 'bank_account_id must be a cash account belonging to this organization' });
      }

      const glR = await pool.query(
        `SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0)::bigint AS cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND l.account_id = $2 AND t.transaction_date <= $3`,
        [orgId, bankAccountId, statementDate]
      );
      const endingGlCashBalanceCents = Number(glR.rows[0].cents);

      const outstandingR = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN credit_debit_indicator = 'debit' THEN -amount_cents ELSE amount_cents END), 0)::bigint AS cents
         FROM org_bank_statement_lines
         WHERE org_id = $1 AND bank_account_id = $2 AND status IN ('unconfirmed', 'transfer_pending')
           AND statement_date <= $3`,
        [orgId, bankAccountId, statementDate]
      );
      const outstandingUnconfirmedCents = Number(outstandingR.rows[0].cents);

      const transitR = await pool.query(
        `SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0)::bigint AS cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND l.account_id = $2 AND t.transaction_date <= $3
           AND NOT EXISTS (SELECT 1 FROM org_bank_statement_lines bsl WHERE bsl.ledger_transaction_id = t.id)
           AND NOT EXISTS (SELECT 1 FROM org_bank_statement_line_postings sp WHERE sp.ledger_transaction_id = t.id)`,
        [orgId, bankAccountId, statementDate]
      );
      const depositsInTransitCents = Number(transitR.rows[0].cents);

      const computedGlFromFormula = endingBalanceCents + depositsInTransitCents - outstandingUnconfirmedCents;
      const differenceCents = computedGlFromFormula - endingGlCashBalanceCents;

      return res.json({
        bank_account_id: bankAccountId,
        statement_date: statementDate,
        ending_bank_statement_balance_cents: String(endingBalanceCents),
        deposits_in_transit_cents: String(depositsInTransitCents),
        outstanding_unconfirmed_cents: String(outstandingUnconfirmedCents),
        computed_gl_cash_balance_cents: String(computedGlFromFormula),
        actual_gl_cash_balance_cents: String(endingGlCashBalanceCents),
        difference_cents: String(differenceCents),
        matches: differenceCents === 0,
      });
    } catch (e) {
      console.error('GET /bank-statement-lines/reconciliation-report:', e.message);
      return res.status(500).json({ error: 'Could not compute reconciliation report' });
    }
  });

  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /**
   * Unreconcile (Step 6, spec Section 2.5). Two paths, chosen BEFORE any write is attempted
   * (isFiscalYearLocked check first, not inferred from a caught CA001) -- exactly the spec's
   * two-path design:
   *   - Unlocked period: void the linked transaction (voidLedgerTransaction, the same function
   *     ledger.js's own void endpoint uses -- no new mechanism) and reset the statement line to
   *     unconfirmed.
   *   - Locked period: never touch the historical transaction. Post a reversing entry (mirrored
   *     lines, debit/credit swapped, reverses_transaction_id set) dated today, in whatever
   *     fiscal year that falls into -- the current OPEN period, not the locked one. The
   *     statement line goes back to unconfirmed AND gets flagged via discuss_note (the same
   *     "needs attention" mechanism Step 3 already built for ambiguous lines, not a new column)
   *     so it visibly needs re-coding rather than silently reappearing in the queue.
   */
  /**
   * Shared by both unreconcile paths below -- void-if-unlocked / reverse-if-locked for ONE
   * ledger transaction. Extracted so a multi-select match's several postings (migration 223) can
   * each go through the identical logic a single Match/Create/Transfer already used, rather than
   * a second, subtly different implementation.
   *
   * Found live during this session's own testing (not a pre-existing known issue that was
   * deferred): a Match-type transaction is also a recorded org_bill_payments/org_invoice_payments
   * row, and voidLedgerTransaction alone only flips the LEDGER transaction to voided -- it has no
   * idea org_bills/org_invoices even exist, so a bill/invoice stayed stuck at 'paid' after its
   * payment's transaction was voided via unreconcile. Fixed by detecting that case first and
   * routing through voidBillPayment/voidInvoicePayment instead (the same shared functions
   * recordBillPayment's own void button uses), which do cascade the bill/invoice status --
   * falling back to a bare voidLedgerTransaction only for transactions with no such row (plain
   * Create-tab codings, Transfers).
   */
  async function unreconcileOneTransaction(orgId, userId, txnId, reason) {
    const txnR = await pool.query(`SELECT * FROM org_ledger_transactions WHERE id = $1 AND org_id = $2`, [txnId, orgId]);
    const txn = txnR.rows[0];
    if (!txn) return { httpStatus: 500, body: { error: 'Linked transaction not found (inconsistent state)' } };
    if (txn.status === 'voided') return { httpStatus: 409, body: { error: 'Linked transaction is already voided', code: 'already_unreconciled' } };

    const billPayR = await pool.query(`SELECT id, bill_id FROM org_bill_payments WHERE ledger_transaction_id = $1 AND org_id = $2 AND status = 'posted'`, [txnId, orgId]);
    if (billPayR.rows.length) {
      const p = billPayR.rows[0];
      const result = await voidBillPayment(pool, { orgId, userId, billId: p.bill_id, paymentId: p.id, reason });
      if (result.httpStatus >= 400) return result;
      return { httpStatus: 200, body: result.body.reversal_transaction_id
        ? { mode: 'reversed', original_transaction_id: txnId, reversing_transaction_id: result.body.reversal_transaction_id, fiscal_year: txn.fiscal_year }
        : { mode: 'voided', original_transaction_id: txnId } };
    }
    const invPayR = await pool.query(`SELECT id, invoice_id FROM org_invoice_payments WHERE ledger_transaction_id = $1 AND org_id = $2 AND status = 'posted'`, [txnId, orgId]);
    if (invPayR.rows.length) {
      const p = invPayR.rows[0];
      const result = await voidInvoicePayment(pool, { orgId, userId, invoiceId: p.invoice_id, paymentId: p.id, reason });
      if (result.httpStatus >= 400) return result;
      return { httpStatus: 200, body: result.body.reversal_transaction_id
        ? { mode: 'reversed', original_transaction_id: txnId, reversing_transaction_id: result.body.reversal_transaction_id, fiscal_year: txn.fiscal_year }
        : { mode: 'voided', original_transaction_id: txnId } };
    }

    const locked = await isFiscalYearLocked(pool, orgId, txn.fiscal_year);
    if (!locked) {
      const voidResult = await voidLedgerTransaction(pool, { orgId, userId, transactionId: txn.id, voidReason: reason });
      if (voidResult.httpStatus >= 400) return voidResult;
      return { httpStatus: 200, body: { mode: 'voided', original_transaction_id: txn.id } };
    }

    const originalLinesR = await pool.query(
      `SELECT account_id, program_id, grant_id, donor_restriction_class::text AS donor_restriction_class, board_designation_id, debit_cents, credit_cents, line_memo
       FROM org_ledger_lines WHERE transaction_id = $1`,
      [txn.id]
    );
    const reversingLines = buildReversingLines(originalLinesR.rows).map((l) => ({
      account_id: l.account_id, program_id: l.program_id, grant_id: l.grant_id,
      donor_restriction_class: l.donor_restriction_class, debit_cents: l.debit_cents, credit_cents: l.credit_cents,
      line_memo: l.line_memo,
    }));
    const reverseResult = await postLedgerTransaction(pool, {
      orgId, userId,
      transactionDate: todayIso(),
      memo: 'Reversal of transaction ' + txn.id + ' (originally FY' + txn.fiscal_year + ', now locked): ' + reason,
      payee: txn.payee,
      referenceNumber: null,
      lines: reversingLines,
      source: 'bank_reconciliation',
      reversesTransactionId: txn.id,
    });
    if (reverseResult.httpStatus >= 400) return reverseResult;
    return { httpStatus: 200, body: { mode: 'reversed', original_transaction_id: txn.id, reversing_transaction_id: reverseResult.body.id, fiscal_year: txn.fiscal_year } };
  }

  app.post('/api/organizational/orgs/:slug/bank-statement-lines/:id/unreconcile', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const lineId = Number.parseInt(String(req.params.id), 10);
    const reason = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';

    if (!Number.isInteger(lineId) || lineId < 1) return res.status(400).json({ error: 'invalid line id' });
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    try {
      const line = await loadOwnStatementLine(orgId, lineId);
      if (!line) return res.status(404).json({ error: 'Statement line not found' });

      if (!line.ledger_transaction_id) {
        // No singular transaction -- check whether this is a multi-select match line (migration
        // 223) instead of just declaring it unreconciled.
        const postingsR = await pool.query(
          `SELECT ledger_transaction_id FROM org_bank_statement_line_postings WHERE statement_line_id = $1`,
          [lineId]
        );
        if (!postingsR.rows.length) {
          return res.status(409).json({ error: 'Line is not reconciled', code: 'not_reconciled' });
        }

        const results = [];
        for (const p of postingsR.rows) {
          const r = await unreconcileOneTransaction(orgId, userId, p.ledger_transaction_id, reason);
          if (r.httpStatus >= 400) return res.status(r.httpStatus).json(r.body);
          results.push(r.body);
        }
        await pool.query(`DELETE FROM org_bank_statement_line_postings WHERE statement_line_id = $1`, [lineId]);
        const anyReversed = results.some((r) => r.mode === 'reversed');
        if (anyReversed) {
          await pool.query(
            `UPDATE org_bank_statement_lines
             SET status = 'unconfirmed', is_internal_transfer = false, discuss_note = $2, discuss_resolved_at = NULL
             WHERE id = $1 AND org_id = $3`,
            [lineId, 'Unreconciled a multi-match with at least one posting in a locked fiscal year -- see void/reversal history on the individual transactions. Needs re-coding: ' + reason, orgId]
          );
        } else {
          await pool.query(
            `UPDATE org_bank_statement_lines SET status = 'unconfirmed', is_internal_transfer = false WHERE id = $1 AND org_id = $2`,
            [lineId, orgId]
          );
        }
        return res.json({ id: lineId, status: 'unconfirmed', mode: 'multi', postings: results });
      }

      const txnR = await pool.query(
        `SELECT * FROM org_ledger_transactions WHERE id = $1 AND org_id = $2`,
        [line.ledger_transaction_id, orgId]
      );
      const txn = txnR.rows[0];
      if (!txn) return res.status(500).json({ error: 'Linked transaction not found (inconsistent state)' });
      if (txn.status === 'voided') {
        return res.status(409).json({ error: 'Linked transaction is already voided', code: 'already_unreconciled' });
      }

      const result = await unreconcileOneTransaction(orgId, userId, txn.id, reason);
      if (result.httpStatus >= 400) return res.status(result.httpStatus).json(result.body);

      if (result.body.mode === 'voided') {
        await pool.query(
          `UPDATE org_bank_statement_lines
           SET status = 'unconfirmed', ledger_transaction_id = NULL, is_internal_transfer = false
           WHERE id = $1 AND org_id = $2`,
          [lineId, orgId]
        );
        return res.json({ id: lineId, status: 'unconfirmed', mode: 'voided', voided_transaction_id: txn.id });
      }

      await pool.query(
        `UPDATE org_bank_statement_lines
         SET status = 'unconfirmed', ledger_transaction_id = NULL, is_internal_transfer = false,
             discuss_note = $1, discuss_resolved_at = NULL
         WHERE id = $2 AND org_id = $3`,
        [
          'Unreconciled from a locked fiscal year (FY' + result.body.fiscal_year + ') -- original transaction ' + txn.id
            + ' left untouched, reversed by transaction ' + result.body.reversing_transaction_id + '. Needs re-coding: ' + reason,
          lineId, orgId,
        ]
      );
      return res.json({
        id: lineId, status: 'unconfirmed', mode: 'reversed',
        original_transaction_id: txn.id, reversing_transaction_id: result.body.reversing_transaction_id,
      });
    } catch (e) {
      console.error('POST /bank-statement-lines/:id/unreconcile:', e.message);
      return res.status(500).json({ error: 'Could not unreconcile this line' });
    }
  });

}

module.exports = { registerBankReconciliationRoutes };
