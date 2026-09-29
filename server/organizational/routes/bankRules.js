'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { RESTRICTION_CLASSES } = require('../lib/ledgerPosting');

const DIRECTIONS = new Set(['debit', 'credit']);

function rowToRule(row) {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    is_active: row.is_active,
    bank_account_id: row.bank_account_id,
    bank_account_name: row.bank_account_name,
    payee_contains: row.payee_contains,
    description_contains: row.description_contains,
    amount_min_cents: row.amount_min_cents != null ? String(row.amount_min_cents) : null,
    amount_max_cents: row.amount_max_cents != null ? String(row.amount_max_cents) : null,
    direction: row.direction,
    action_account_id: row.action_account_id,
    action_account_code: row.action_account_code,
    action_account_name: row.action_account_name,
    action_program_id: row.action_program_id,
    action_program_name: row.action_program_name,
    action_grant_id: row.action_grant_id,
    action_donor_restriction_class: row.action_donor_restriction_class,
    created_at: row.created_at,
  };
}

/**
 * Validates and normalizes a rule's condition/action fields from a request body. Shared by
 * create and update so both enforce the same rules the DB's own CHECK constraints enforce --
 * this exists purely to give a clearer 400 message than a raw constraint-violation 500 would.
 */
function parseRuleBody(body, { partial } = { partial: false }) {
  const out = {};
  const err = (msg) => ({ error: msg });

  if (body.name != null) out.name = String(body.name).trim();
  if (!partial && !out.name) return err('name is required');

  if (body.priority != null) {
    const p = Number.parseInt(String(body.priority), 10);
    if (!Number.isInteger(p)) return err('priority must be an integer');
    out.priority = p;
  } else if (!partial) {
    out.priority = 100;
  }

  if (body.is_active != null) out.is_active = !!body.is_active;
  else if (!partial) out.is_active = true;

  if (body.bank_account_id != null && body.bank_account_id !== '') {
    const id = Number.parseInt(String(body.bank_account_id), 10);
    if (!Number.isInteger(id) || id < 1) return err('bank_account_id must be a positive integer');
    out.bank_account_id = id;
  } else if (body.bank_account_id === '' || body.bank_account_id === null) {
    out.bank_account_id = null;
  }

  if (body.payee_contains != null) {
    const s = String(body.payee_contains).trim();
    out.payee_contains = s || null;
  }
  if (body.description_contains != null) {
    const s = String(body.description_contains).trim();
    out.description_contains = s || null;
  }

  const payeeSet = out.payee_contains !== undefined ? out.payee_contains : (partial ? undefined : null);
  const descSet = out.description_contains !== undefined ? out.description_contains : (partial ? undefined : null);
  if (!partial && !payeeSet && !descSet) {
    return err('At least one of payee_contains or description_contains is required');
  }

  if (body.amount_min_cents != null && body.amount_min_cents !== '') {
    const n = Number.parseInt(String(body.amount_min_cents), 10);
    if (!Number.isInteger(n) || n < 0) return err('amount_min_cents must be a non-negative integer');
    out.amount_min_cents = n;
  } else if (body.amount_min_cents === '' || body.amount_min_cents === null) {
    out.amount_min_cents = null;
  }
  if (body.amount_max_cents != null && body.amount_max_cents !== '') {
    const n = Number.parseInt(String(body.amount_max_cents), 10);
    if (!Number.isInteger(n) || n < 0) return err('amount_max_cents must be a non-negative integer');
    out.amount_max_cents = n;
  } else if (body.amount_max_cents === '' || body.amount_max_cents === null) {
    out.amount_max_cents = null;
  }
  if (out.amount_min_cents != null && out.amount_max_cents != null && out.amount_min_cents > out.amount_max_cents) {
    return err('amount_min_cents must be <= amount_max_cents');
  }

  if (body.direction != null && body.direction !== '') {
    const d = String(body.direction);
    if (!DIRECTIONS.has(d)) return err('direction must be debit or credit');
    out.direction = d;
  } else if (body.direction === '' || body.direction === null) {
    out.direction = null;
  }

  if (body.action_account_id != null) {
    const id = Number.parseInt(String(body.action_account_id), 10);
    if (!Number.isInteger(id) || id < 1) return err('action_account_id is required');
    out.action_account_id = id;
  } else if (!partial) {
    return err('action_account_id is required');
  }

  if (body.action_program_id != null) {
    const id = Number.parseInt(String(body.action_program_id), 10);
    if (!Number.isInteger(id) || id < 1) return err('action_program_id is required');
    out.action_program_id = id;
  } else if (!partial) {
    return err('action_program_id is required');
  }

  if (body.action_grant_id != null && body.action_grant_id !== '') {
    const id = Number.parseInt(String(body.action_grant_id), 10);
    if (!Number.isInteger(id) || id < 1) return err('action_grant_id must be a positive integer if provided');
    out.action_grant_id = id;
  } else if (body.action_grant_id === '' || body.action_grant_id === null) {
    out.action_grant_id = null;
  }

  if (body.action_donor_restriction_class != null && body.action_donor_restriction_class !== '') {
    const rc = String(body.action_donor_restriction_class);
    if (!RESTRICTION_CLASSES.has(rc)) return err('action_donor_restriction_class must be one of unrestricted, temporarily_restricted, permanently_restricted');
    out.action_donor_restriction_class = rc;
  } else if (body.action_donor_restriction_class === '' || body.action_donor_restriction_class === null) {
    out.action_donor_restriction_class = null;
  }

  return { fields: out };
}

/**
 * Evaluates first-match-wins rule matching for a set of statement lines, entirely in SQL --
 * mirrors this file's own condition set exactly (substring/range/direction/account), no
 * separate JS reimplementation to drift out of sync. Only unconfirmed lines and active rules
 * are ever considered; DISTINCT ON (line id), ordered by priority, picks the single winning
 * rule per line the same way ORDER BY + LIMIT 1 would per-line, without an N-query round trip.
 */
async function matchRulesForLines(pool, orgId, lineIds) {
  if (!lineIds.length) return {};
  const r = await pool.query(
    `SELECT DISTINCT ON (bsl.id)
            bsl.id AS line_id, br.id AS rule_id, br.name AS rule_name,
            br.action_account_id, aa.code AS action_account_code, aa.name AS action_account_name,
            br.action_program_id, ap.name AS action_program_name,
            br.action_grant_id, br.action_donor_restriction_class::text AS action_donor_restriction_class
     FROM org_bank_statement_lines bsl
     JOIN org_bank_rules br ON br.org_id = bsl.org_id AND br.is_active = true
       AND (br.bank_account_id IS NULL OR br.bank_account_id = bsl.bank_account_id)
       AND (br.payee_contains IS NULL OR lower(COALESCE(bsl.payee_raw, '')) LIKE '%' || lower(br.payee_contains) || '%')
       AND (br.description_contains IS NULL OR lower(COALESCE(bsl.description_raw, '')) LIKE '%' || lower(br.description_contains) || '%')
       AND (br.amount_min_cents IS NULL OR bsl.amount_cents >= br.amount_min_cents)
       AND (br.amount_max_cents IS NULL OR bsl.amount_cents <= br.amount_max_cents)
       AND (br.direction IS NULL OR br.direction = bsl.credit_debit_indicator)
     JOIN org_accounts aa ON aa.id = br.action_account_id
     JOIN org_programs ap ON ap.id = br.action_program_id
     WHERE bsl.org_id = $1 AND bsl.id = ANY($2::int[]) AND bsl.status = 'unconfirmed'
     ORDER BY bsl.id, br.priority ASC, br.id ASC`,
    [orgId, lineIds]
  );
  const out = {};
  for (const row of r.rows) {
    out[row.line_id] = {
      rule_id: row.rule_id,
      rule_name: row.rule_name,
      account_id: row.action_account_id,
      account_code: row.action_account_code,
      account_name: row.action_account_name,
      program_id: row.action_program_id,
      program_name: row.action_program_name,
      grant_id: row.action_grant_id,
      donor_restriction_class: row.action_donor_restriction_class,
    };
  }
  return out;
}

function registerBankRuleRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/bank-rules', ...orgAuth, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT br.*, acc.code AS action_account_code, acc.name AS action_account_name,
                p.name AS action_program_name, ba.name AS bank_account_name
         FROM org_bank_rules br
         JOIN org_accounts acc ON acc.id = br.action_account_id
         JOIN org_programs p ON p.id = br.action_program_id
         LEFT JOIN org_accounts ba ON ba.id = br.bank_account_id
         WHERE br.org_id = $1
         ORDER BY br.priority ASC, br.id ASC`,
        [req.orgId]
      );
      return res.json({ rules: r.rows.map(rowToRule) });
    } catch (e) {
      console.error('GET /bank-rules:', e.message);
      return res.status(500).json({ error: 'Could not load bank rules' });
    }
  });

  app.post('/api/organizational/orgs/:slug/bank-rules', ...orgAuth, async (req, res) => {
    const { error, fields } = parseRuleBody(req.body || {});
    if (error) return res.status(400).json({ error });
    try {
      const userId = req.user.user_id ?? req.user.id;
      const r = await pool.query(
        `INSERT INTO org_bank_rules
           (org_id, name, priority, is_active, bank_account_id, payee_contains, description_contains,
            amount_min_cents, amount_max_cents, direction, action_account_id, action_program_id,
            action_grant_id, action_donor_restriction_class, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [req.orgId, fields.name, fields.priority, fields.is_active, fields.bank_account_id,
          fields.payee_contains, fields.description_contains, fields.amount_min_cents, fields.amount_max_cents,
          fields.direction, fields.action_account_id, fields.action_program_id, fields.action_grant_id,
          fields.action_donor_restriction_class, userId]
      );
      return res.status(201).json({ id: r.rows[0].id });
    } catch (e) {
      console.error('POST /bank-rules:', e.message);
      return res.status(500).json({ error: 'Could not create bank rule' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/bank-rules/:id', ...orgAuth, async (req, res) => {
    const ruleId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(ruleId) || ruleId < 1) return res.status(400).json({ error: 'invalid rule id' });
    const { error, fields } = parseRuleBody(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields to update' });

    try {
      const setClauses = [];
      const params = [];
      let p = 1;
      for (const [key, val] of Object.entries(fields)) {
        setClauses.push(`${key} = $${p}`);
        params.push(val);
        p += 1;
      }
      params.push(ruleId, req.orgId);
      const r = await pool.query(
        `UPDATE org_bank_rules SET ${setClauses.join(', ')} WHERE id = $${p} AND org_id = $${p + 1} RETURNING id`,
        params
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Bank rule not found' });
      return res.json({ id: r.rows[0].id });
    } catch (e) {
      console.error('PATCH /bank-rules/:id:', e.message);
      return res.status(500).json({ error: 'Could not update bank rule' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/bank-rules/:id', ...orgAuth, async (req, res) => {
    const ruleId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(ruleId) || ruleId < 1) return res.status(400).json({ error: 'invalid rule id' });
    try {
      const r = await pool.query(`DELETE FROM org_bank_rules WHERE id = $1 AND org_id = $2 RETURNING id`, [ruleId, req.orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Bank rule not found' });
      return res.json({ id: ruleId, deleted: true });
    } catch (e) {
      console.error('DELETE /bank-rules/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete bank rule' });
    }
  });

  /**
   * Read-only preview: which rule (if any) would fire for each given line. Posts nothing --
   * callers (Reconcile's per-row badge, Cash Coding's bulk apply) use this to pre-fill fields
   * that the existing Create / bulk-commit path then posts exactly as a manual entry would,
   * just tagged coding_source='rule' + applied_rule_id.
   */
  app.post('/api/organizational/orgs/:slug/bank-statement-lines/match-rules', ...orgAuth, async (req, res) => {
    const body = req.body || {};
    const lineIds = Array.isArray(body.line_ids) ? body.line_ids.map((v) => Number.parseInt(String(v), 10)).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (!lineIds.length) return res.status(400).json({ error: 'line_ids must be a non-empty array' });
    try {
      const matches = await matchRulesForLines(pool, req.orgId, lineIds);
      return res.json({ matches });
    } catch (e) {
      console.error('POST /bank-statement-lines/match-rules:', e.message);
      return res.status(500).json({ error: 'Could not match rules' });
    }
  });
}

module.exports = { registerBankRuleRoutes, matchRulesForLines };
