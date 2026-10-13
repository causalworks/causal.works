'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { waitingForAnAsset } = require('../lib/fixedAssetWaiting');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { postLedgerTransaction } = require('../lib/ledgerPosting');
const { fyDateRange, getFiscalYearEndMonth } = require('../lib/fiscalYear');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function lastDayOfMonthIso(year, month) {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function depreciationSchedule(asset) {
  const base = Number(asset.cost_cents) - Number(asset.salvage_value_cents);
  const months = asset.useful_life_months;
  const monthlyCents = Math.floor(base / months);
  const acqDate = new Date(asset.acquisition_date + 'T00:00:00');
  let year = acqDate.getFullYear();
  let month = acqDate.getMonth() + 1;
  const periods = [];
  let runningTotal = 0;
  for (let i = 1; i <= months; i++) {
    const amount = i === months ? (base - runningTotal) : monthlyCents;
    runningTotal += amount;
    periods.push({ period_date: lastDayOfMonthIso(year, month), amount_cents: amount });
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return periods;
}

function rowToAsset(row) {
  const costCents = Number(row.cost_cents);
  const accumulatedCents = Number(row.accumulated_depreciation_cents || 0);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    asset_account_id: row.asset_account_id,
    asset_account_code: row.asset_account_code,
    asset_account_name: row.asset_account_name,
    accumulated_depreciation_account_id: row.accumulated_depreciation_account_id,
    depreciation_expense_account_id: row.depreciation_expense_account_id,
    depreciation_expense_account_name: row.depreciation_expense_account_name,
    program_id: row.program_id,
    program_name: row.program_name,
    acquisition_date: row.acquisition_date,
    cost_cents: String(costCents),
    salvage_value_cents: String(row.salvage_value_cents),
    useful_life_months: row.useful_life_months,
    status: row.status,
    disposal_date: row.disposal_date,
    disposal_proceeds_cents: row.disposal_proceeds_cents != null ? String(row.disposal_proceeds_cents) : null,
    accumulated_depreciation_cents: String(accumulatedCents),
    net_book_value_cents: String(costCents - accumulatedCents),
    created_at: row.created_at,
  };
}

function parseAssetBody(body, { partial } = { partial: false }) {
  const out = {};
  if (body.prior_depreciation_cents != null && body.prior_depreciation_cents !== '') {
    const n = Number.parseInt(String(body.prior_depreciation_cents), 10);
    if (!Number.isInteger(n) || n < 0) return { error: 'prior_depreciation_cents must be zero or more' };
    out.prior_depreciation_cents = n;
  }
  if (body.prior_depreciation_through != null && body.prior_depreciation_through !== '') {
    if (!DATE_RE.test(String(body.prior_depreciation_through))) return { error: 'prior_depreciation_through must be YYYY-MM-DD' };
    out.prior_depreciation_through = String(body.prior_depreciation_through);
  }
  if (out.prior_depreciation_cents > 0 && !out.prior_depreciation_through) return { error: 'Say the date the earlier depreciation runs through.' };
  if (!partial && body.acquisition_ledger_transaction_id != null && body.acquisition_ledger_transaction_id !== '') {
    const id = Number.parseInt(String(body.acquisition_ledger_transaction_id), 10);
    if (!Number.isInteger(id) || id < 1) return { error: 'acquisition_ledger_transaction_id must be a positive integer' };
    out.acquisition_ledger_transaction_id = id;
  }
  const err = (msg) => ({ error: msg });

  if (body.name != null) out.name = String(body.name).trim();
  if (!partial && !out.name) return err('name is required');
  if (body.description !== undefined) out.description = body.description ? String(body.description).trim() : null;

  for (const [field, label] of [
    ['asset_account_id', 'asset_account_id'],
    ['accumulated_depreciation_account_id', 'accumulated_depreciation_account_id'],
    ['depreciation_expense_account_id', 'depreciation_expense_account_id'],
    ['program_id', 'program_id'],
  ]) {
    if (body[field] != null) {
      const id = Number.parseInt(String(body[field]), 10);
      if (!Number.isInteger(id) || id < 1) return err(`${label} must be a positive integer`);
      out[field] = id;
    } else if (!partial) {
      return err(`${label} is required`);
    }
  }

  if (body.acquisition_date != null) {
    if (!DATE_RE.test(String(body.acquisition_date))) return err('acquisition_date must be YYYY-MM-DD');
    out.acquisition_date = String(body.acquisition_date);
  } else if (!partial) {
    return err('acquisition_date is required');
  }

  if (body.cost_cents != null) {
    const n = Number.parseInt(String(body.cost_cents), 10);
    if (!Number.isInteger(n) || n <= 0) return err('cost_cents must be a positive integer');
    out.cost_cents = n;
  } else if (!partial) {
    return err('cost_cents is required');
  }

  if (body.salvage_value_cents != null) {
    const n = Number.parseInt(String(body.salvage_value_cents), 10);
    if (!Number.isInteger(n) || n < 0) return err('salvage_value_cents must be a non-negative integer');
    out.salvage_value_cents = n;
  } else if (!partial) {
    out.salvage_value_cents = 0;
  }

  if (body.useful_life_months != null) {
    const n = Number.parseInt(String(body.useful_life_months), 10);
    if (!Number.isInteger(n) || n <= 0) return err('useful_life_months must be a positive integer');
    out.useful_life_months = n;
  } else if (!partial) {
    return err('useful_life_months is required');
  }

  const costForCheck = out.cost_cents != null ? out.cost_cents : (partial ? undefined : null);
  const salvageForCheck = out.salvage_value_cents != null ? out.salvage_value_cents : (partial ? undefined : 0);
  if (costForCheck != null && salvageForCheck != null && salvageForCheck >= costForCheck) {
    return err('salvage_value_cents must be less than cost_cents');
  }

  return { fields: out };
}

function registerFixedAssetRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);

  const LIST_QUERY = `
    SELECT fa.*, aa.code AS asset_account_code, aa.name AS asset_account_name,
           dea.name AS depreciation_expense_account_name, p.name AS program_name,
           COALESCE((SELECT SUM(amount_cents) FROM org_fixed_asset_depreciation_entries e WHERE e.fixed_asset_id = fa.id), 0) + fa.prior_depreciation_cents AS accumulated_depreciation_cents
    FROM org_fixed_assets fa
    JOIN org_accounts aa ON aa.id = fa.asset_account_id
    JOIN org_accounts dea ON dea.id = fa.depreciation_expense_account_id
    JOIN org_programs p ON p.id = fa.program_id
    WHERE fa.org_id = $1`;

  app.get('/api/organizational/orgs/:slug/fixed-assets', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    try {
      const r = await pool.query(LIST_QUERY + ' ORDER BY fa.status = \'disposed\', fa.acquisition_date DESC, fa.id DESC', [req.orgId]);
      return res.json({ fixed_assets: r.rows.map(rowToAsset) });
    } catch (e) {
      console.error('GET /fixed-assets:', e.message);
      return res.status(500).json({ error: 'Could not load fixed assets' });
    }
  });

  app.post('/api/organizational/orgs/:slug/fixed-assets/:id/link', ...orgAuth, financeWriter, async (req, res) => {
    const assetId = Number.parseInt(String(req.params.id), 10);
    const txnId = Number.parseInt(String(req.body && req.body.transaction_id), 10);
    if (!Number.isInteger(assetId) || assetId < 1 || !Number.isInteger(txnId) || txnId < 1) return res.status(400).json({ error: 'asset and transaction ids are required' });
    try {
      const ok = await pool.query(
        `SELECT 1 FROM org_fixed_assets fa JOIN org_ledger_transactions t ON t.org_id = fa.org_id
           JOIN org_ledger_lines l ON l.transaction_id = t.id AND l.account_id = fa.asset_account_id AND l.debit_cents > l.credit_cents
          WHERE fa.id = $1 AND fa.org_id = $2 AND fa.acquisition_ledger_transaction_id IS NULL AND t.id = $3 AND t.status = 'posted'
            AND NOT EXISTS (SELECT 1 FROM org_fixed_assets o WHERE o.acquisition_ledger_transaction_id = t.id) LIMIT 1`, [assetId, req.orgId, txnId]);
      if (!ok.rows.length) return res.status(409).json({ error: 'That asset and entry cannot be linked: the entry must be posted, add cost to the asset account, and not already belong to an asset.' });
      await pool.query('UPDATE org_fixed_assets SET acquisition_ledger_transaction_id = $1 WHERE id = $2 AND org_id = $3', [txnId, assetId, req.orgId]);
      return res.json({ id: assetId, linked: true });
    } catch (e) {
      console.error('POST /fixed-assets/:id/link:', e.message);
      return res.status(500).json({ error: 'Could not link the asset' });
    }
  });

  app.get('/api/organizational/orgs/:slug/fixed-assets/settings', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    try {
      const r = await pool.query('SELECT capitalization_threshold_cents FROM org_settings WHERE org_id = $1', [req.orgId]);
      return res.json({ capitalization_threshold_cents: r.rows.length ? Number(r.rows[0].capitalization_threshold_cents) : 500000, can_change: ['admin', ...FINANCE_ROLES].includes(req.coopOrgRole) });
    } catch (e) {
      console.error('GET /fixed-assets/settings:', e.message);
      return res.status(500).json({ error: 'Could not load fixed asset settings' });
    }
  });
  app.put('/api/organizational/orgs/:slug/fixed-assets/settings', ...orgAuth, financeWriter, async (req, res) => {
    const n = Number(req.body && req.body.capitalization_threshold_cents);
    if (!Number.isInteger(n) || n < 0 || n > 100000000) return res.status(400).json({ error: 'Enter the threshold in dollars, zero or more.' });
    try {
      const r = await pool.query('UPDATE org_settings SET capitalization_threshold_cents = $2, updated_at = NOW() WHERE org_id = $1 RETURNING capitalization_threshold_cents', [req.orgId, n]);
      if (!r.rows.length) return res.status(404).json({ error: 'Settings not found' });
      return res.json({ capitalization_threshold_cents: Number(r.rows[0].capitalization_threshold_cents) });
    } catch (e) {
      console.error('PUT /fixed-assets/settings:', e.message);
      return res.status(500).json({ error: 'Could not save fixed asset settings' });
    }
  });

  app.get('/api/organizational/orgs/:slug/fixed-assets/waiting', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    try {
      return res.json(await waitingForAnAsset(pool, req.orgId));
    } catch (e) {
      console.error('GET /fixed-assets/waiting:', e.message);
      return res.status(500).json({ error: 'Could not load the entries waiting for an asset' });
    }
  });

  app.post('/api/organizational/orgs/:slug/fixed-assets', ...orgAuth, financeWriter, async (req, res) => {
    const { error, fields } = parseAssetBody(req.body || {});
    if (error) return res.status(400).json({ error });
    try {
      const userId = req.user.user_id ?? req.user.id;
      if (fields.acquisition_ledger_transaction_id) {
        const link = await pool.query(
          `SELECT 1 FROM org_ledger_transactions t JOIN org_ledger_lines l ON l.transaction_id = t.id
            WHERE t.id = $1 AND t.org_id = $2 AND t.status = 'posted' AND l.account_id = $3 AND l.debit_cents > l.credit_cents
              AND NOT EXISTS (SELECT 1 FROM org_fixed_assets fa WHERE fa.acquisition_ledger_transaction_id = t.id) LIMIT 1`,
          [fields.acquisition_ledger_transaction_id, req.orgId, fields.asset_account_id]);
        if (!link.rows.length) return res.status(409).json({ error: 'That entry is not available to link: it must be posted, add cost to this asset account, and not already be an asset.' });
      }
      const r = await pool.query(
        `INSERT INTO org_fixed_assets
           (org_id, name, description, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id,
            program_id, acquisition_date, cost_cents, salvage_value_cents, useful_life_months, created_by,
            acquisition_ledger_transaction_id, prior_depreciation_cents, prior_depreciation_through)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [req.orgId, fields.name, fields.description || null, fields.asset_account_id, fields.accumulated_depreciation_account_id,
          fields.depreciation_expense_account_id, fields.program_id, fields.acquisition_date, fields.cost_cents,
          fields.salvage_value_cents, fields.useful_life_months, userId,
          fields.acquisition_ledger_transaction_id || null, fields.prior_depreciation_cents || 0, fields.prior_depreciation_through || null]
      );
      return res.status(201).json({ id: r.rows[0].id });
    } catch (e) {
      console.error('POST /fixed-assets:', e.message);
      return res.status(500).json({ error: 'Could not create fixed asset' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/fixed-assets/:id', ...orgAuth, financeWriter, async (req, res) => {
    const assetId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(assetId) || assetId < 1) return res.status(400).json({ error: 'invalid asset id' });
    const { error, fields } = parseAssetBody(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields to update' });

    try {
      const lockedFields = ['asset_account_id', 'accumulated_depreciation_account_id', 'depreciation_expense_account_id', 'acquisition_date', 'cost_cents', 'salvage_value_cents', 'useful_life_months'];
      const touchesLocked = Object.keys(fields).some((k) => lockedFields.includes(k));
      if (touchesLocked) {
        const entryR = await pool.query(`SELECT 1 FROM org_fixed_asset_depreciation_entries WHERE fixed_asset_id = $1 AND org_id = $2 LIMIT 1`, [assetId, req.orgId]);
        if (entryR.rows.length) {
          return res.status(409).json({ error: 'This asset already has posted depreciation -- cost basis, accounts, dates, and useful life can no longer be changed. Only name, description, and program can still be edited.', code: 'depreciation_already_posted' });
        }
      }

      const setClauses = [];
      const params = [];
      let p = 1;
      for (const [key, val] of Object.entries(fields)) {
        setClauses.push(`${key} = $${p}`);
        params.push(val);
        p += 1;
      }
      params.push(assetId, req.orgId);
      const r = await pool.query(
        `UPDATE org_fixed_assets SET ${setClauses.join(', ')} WHERE id = $${p} AND org_id = $${p + 1} AND status != 'disposed' RETURNING id`,
        params
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Fixed asset not found, or it has been disposed' });
      return res.json({ id: r.rows[0].id });
    } catch (e) {
      console.error('PATCH /fixed-assets/:id:', e.message);
      return res.status(500).json({ error: 'Could not update fixed asset' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/fixed-assets/:id', ...orgAuth, financeWriter, async (req, res) => {
    const assetId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(assetId) || assetId < 1) return res.status(400).json({ error: 'invalid asset id' });
    try {
      const entryR = await pool.query(`SELECT 1 FROM org_fixed_asset_depreciation_entries WHERE fixed_asset_id = $1 AND org_id = $2 LIMIT 1`, [assetId, req.orgId]);
      if (entryR.rows.length) {
        return res.status(409).json({ error: 'This asset already has posted depreciation and cannot be deleted -- dispose it instead.', code: 'depreciation_already_posted' });
      }
      const r = await pool.query(`DELETE FROM org_fixed_assets WHERE id = $1 AND org_id = $2 RETURNING id`, [assetId, req.orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Fixed asset not found' });
      return res.json({ id: assetId, deleted: true });
    } catch (e) {
      console.error('DELETE /fixed-assets/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete fixed asset' });
    }
  });

  async function computeDuePeriods(orgId, throughDate) {
    const assetsR = await pool.query(
      `SELECT * FROM org_fixed_assets WHERE org_id = $1 AND status = 'active' AND acquisition_date <= $2`,
      [orgId, throughDate]
    );
    const due = [];
    for (const asset of assetsR.rows) {
      const schedule = depreciationSchedule(asset);
      const postedR = await pool.query(
        `SELECT period_date::text AS period_date FROM org_fixed_asset_depreciation_entries WHERE fixed_asset_id = $1`,
        [asset.id]
      );
      const postedSet = new Set(postedR.rows.map((r) => r.period_date));
      for (const period of schedule) {
        if (period.period_date > throughDate) break;
        if (postedSet.has(period.period_date)) continue;
        if (asset.prior_depreciation_through && period.period_date <= String(asset.prior_depreciation_through).slice(0, 10)) continue;
        due.push({ asset_id: asset.id, asset_name: asset.name, period_date: period.period_date, amount_cents: period.amount_cents, asset });
      }
    }
    return due;
  }

  app.get('/api/organizational/orgs/:slug/fixed-assets/run-depreciation-preview', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const throughDate = req.query.through_date != null ? String(req.query.through_date) : null;
    if (!throughDate || !DATE_RE.test(throughDate)) return res.status(400).json({ error: 'through_date is required and must be YYYY-MM-DD' });
    try {
      const due = await computeDuePeriods(req.orgId, throughDate);
      return res.json({
        periods: due.map((d) => ({ asset_id: d.asset_id, asset_name: d.asset_name, period_date: d.period_date, amount_cents: String(d.amount_cents) })),
        total_cents: String(due.reduce((s, d) => s + d.amount_cents, 0)),
      });
    } catch (e) {
      console.error('GET /fixed-assets/run-depreciation-preview:', e.message);
      return res.status(500).json({ error: 'Could not compute depreciation preview' });
    }
  });

  app.post('/api/organizational/orgs/:slug/fixed-assets/run-depreciation', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const throughDate = req.body && req.body.through_date != null ? String(req.body.through_date) : null;
    if (!throughDate || !DATE_RE.test(throughDate)) return res.status(400).json({ error: 'through_date is required and must be YYYY-MM-DD' });

    try {
      const due = await computeDuePeriods(orgId, throughDate);
      const posted = [];
      const failed = [];
      for (const d of due) {
        const asset = d.asset;
        const result = await postLedgerTransaction(pool, {
          orgId, userId, transactionDate: d.period_date,
          memo: 'Depreciation: ' + asset.name + ' (' + d.period_date + ')',
          payee: null, referenceNumber: null,
          lines: [
            { account_id: asset.depreciation_expense_account_id, program_id: asset.program_id, debit_cents: d.amount_cents, credit_cents: 0 },
            { account_id: asset.accumulated_depreciation_account_id, program_id: asset.program_id, debit_cents: 0, credit_cents: d.amount_cents },
          ],
          source: 'fixed_asset_depreciation',
        });
        if (result.httpStatus >= 400) {
          failed.push({ asset_id: d.asset_id, period_date: d.period_date, error: result.body.error || result.body.message });
          continue;
        }
        const insertR = await pool.query(
          `INSERT INTO org_fixed_asset_depreciation_entries (org_id, fixed_asset_id, period_date, amount_cents, ledger_transaction_id)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (fixed_asset_id, period_date) DO NOTHING
           RETURNING id`,
          [orgId, d.asset_id, d.period_date, d.amount_cents, result.body.id]
        );
        if (!insertR.rows.length) continue;
        posted.push({ asset_id: d.asset_id, period_date: d.period_date, amount_cents: String(d.amount_cents), ledger_transaction_id: result.body.id });
      }

      const assetIds = [...new Set(due.map((d) => d.asset_id))];
      if (assetIds.length) {
        await pool.query(
          `UPDATE org_fixed_assets fa
           SET status = 'fully_depreciated'
           WHERE fa.id = ANY($1::int[]) AND fa.org_id = $2 AND fa.status = 'active'
             AND (SELECT COALESCE(SUM(amount_cents), 0) FROM org_fixed_asset_depreciation_entries e WHERE e.fixed_asset_id = fa.id)
                 >= (fa.cost_cents - fa.salvage_value_cents)`,
          [assetIds, orgId]
        );
      }

      return res.json({ posted, failed, posted_count: posted.length, failed_count: failed.length });
    } catch (e) {
      console.error('POST /fixed-assets/run-depreciation:', e.message);
      return res.status(500).json({ error: 'Could not run depreciation' });
    }
  });

  app.post('/api/organizational/orgs/:slug/fixed-assets/:id/dispose', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const assetId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(assetId) || assetId < 1) return res.status(400).json({ error: 'invalid asset id' });
    const body = req.body || {};
    const disposalDate = body.disposal_date != null ? String(body.disposal_date) : null;
    if (!disposalDate || !DATE_RE.test(disposalDate)) return res.status(400).json({ error: 'disposal_date is required and must be YYYY-MM-DD' });
    const proceedsCents = body.disposal_proceeds_cents != null ? Number.parseInt(String(body.disposal_proceeds_cents), 10) : 0;
    if (!Number.isInteger(proceedsCents) || proceedsCents < 0) return res.status(400).json({ error: 'disposal_proceeds_cents must be a non-negative integer if provided' });
    const bankAccountId = body.bank_account_id != null && body.bank_account_id !== '' ? Number.parseInt(String(body.bank_account_id), 10) : null;
    if (proceedsCents > 0 && !bankAccountId) return res.status(400).json({ error: 'bank_account_id is required when disposal_proceeds_cents is greater than 0' });
    const gainLossAccountId = body.gain_loss_account_id != null && body.gain_loss_account_id !== '' ? Number.parseInt(String(body.gain_loss_account_id), 10) : null;

    try {
      const assetR = await pool.query(
        `SELECT fa.*, COALESCE((SELECT SUM(amount_cents) FROM org_fixed_asset_depreciation_entries e WHERE e.fixed_asset_id = fa.id), 0) + fa.prior_depreciation_cents AS accumulated_depreciation_cents
         FROM org_fixed_assets fa WHERE fa.id = $1 AND fa.org_id = $2`,
        [assetId, orgId]
      );
      if (!assetR.rows.length) return res.status(404).json({ error: 'Fixed asset not found' });
      const asset = assetR.rows[0];
      if (asset.status === 'disposed') return res.status(409).json({ error: 'This asset has already been disposed', code: 'already_disposed' });

      const costCents = Number(asset.cost_cents);
      const accumulatedCents = Number(asset.accumulated_depreciation_cents);
      const netBookValueCents = costCents - accumulatedCents;
      const gainLossCents = proceedsCents - netBookValueCents;

      if (gainLossCents !== 0 && !gainLossAccountId) {
        return res.status(400).json({
          error: 'gain_loss_account_id is required: disposal_proceeds_cents (' + proceedsCents + ') does not equal net book value (' + netBookValueCents + '), producing a ' + (gainLossCents > 0 ? 'gain' : 'loss') + ' of ' + Math.abs(gainLossCents) + ' cents that needs an account to post to.',
          code: 'gain_loss_account_required',
        });
      }

      const lines = [
        { account_id: asset.asset_account_id, program_id: asset.program_id, debit_cents: 0, credit_cents: costCents },
      ];
      if (accumulatedCents > 0) {
        lines.push({ account_id: asset.accumulated_depreciation_account_id, program_id: asset.program_id, debit_cents: accumulatedCents, credit_cents: 0 });
      }
      if (proceedsCents > 0) {
        lines.push({ account_id: bankAccountId, program_id: asset.program_id, debit_cents: proceedsCents, credit_cents: 0 });
      }
      if (gainLossCents > 0) {
        lines.push({ account_id: gainLossAccountId, program_id: asset.program_id, debit_cents: 0, credit_cents: gainLossCents });
      } else if (gainLossCents < 0) {
        lines.push({ account_id: gainLossAccountId, program_id: asset.program_id, debit_cents: -gainLossCents, credit_cents: 0 });
      }

      const result = await postLedgerTransaction(pool, {
        orgId, userId, transactionDate: disposalDate,
        memo: 'Disposal: ' + asset.name,
        payee: null, referenceNumber: null,
        lines, source: 'fixed_asset_disposal',
      });
      if (result.httpStatus >= 400) return res.status(result.httpStatus).json(result.body);

      await pool.query(
        `UPDATE org_fixed_assets SET status = 'disposed', disposal_date = $1, disposal_proceeds_cents = $2 WHERE id = $3 AND org_id = $4`,
        [disposalDate, proceedsCents, assetId, orgId]
      );
      return res.json({ id: assetId, status: 'disposed', ledger_transaction_id: result.body.id, gain_loss_cents: String(gainLossCents) });
    } catch (e) {
      console.error('POST /fixed-assets/:id/dispose:', e.message);
      return res.status(500).json({ error: 'Could not dispose of this asset' });
    }
  });

  app.get('/api/organizational/orgs/:slug/fixed-assets/schedule-d', ...orgAuth, requireAccountingAccess(pool, 'reports'), async (req, res) => {
    const fy = req.query.fiscal_year ? Number.parseInt(String(req.query.fiscal_year), 10) : null;
    if (!Number.isInteger(fy)) return res.status(400).json({ error: 'fiscal_year is required' });
    try {
      const fyEndMonth = await getFiscalYearEndMonth(pool, req.orgId);
      const asOfDate = fyDateRange(fy, fyEndMonth).endDate;
      const r = await pool.query(
        `SELECT fa.id, fa.name, fa.acquisition_date, fa.cost_cents, fa.status,
                aa.code AS asset_account_code,
                COALESCE((SELECT SUM(amount_cents) FROM org_fixed_asset_depreciation_entries e WHERE e.fixed_asset_id = fa.id AND e.period_date <= $2), 0) + CASE WHEN fa.prior_depreciation_through IS NULL OR fa.prior_depreciation_through <= $2 THEN fa.prior_depreciation_cents ELSE 0 END AS accumulated_depreciation_cents
         FROM org_fixed_assets fa
         JOIN org_accounts aa ON aa.id = fa.asset_account_id
         WHERE fa.org_id = $1 AND fa.acquisition_date <= $2 AND (fa.status != 'disposed' OR fa.disposal_date > $2)
         ORDER BY fa.acquisition_date ASC, fa.id ASC`,
        [req.orgId, asOfDate]
      );
      const assets = r.rows.map((row) => ({
        id: row.id, name: row.name, asset_account_code: row.asset_account_code, acquisition_date: row.acquisition_date,
        cost_cents: String(row.cost_cents), accumulated_depreciation_cents: String(row.accumulated_depreciation_cents),
        net_book_value_cents: String(Number(row.cost_cents) - Number(row.accumulated_depreciation_cents)),
      }));
      const totals = assets.reduce((acc, a) => ({
        cost_cents: acc.cost_cents + Number(a.cost_cents),
        accumulated_depreciation_cents: acc.accumulated_depreciation_cents + Number(a.accumulated_depreciation_cents),
        net_book_value_cents: acc.net_book_value_cents + Number(a.net_book_value_cents),
      }), { cost_cents: 0, accumulated_depreciation_cents: 0, net_book_value_cents: 0 });
      return res.json({
        as_of_date: asOfDate, assets,
        totals: { cost_cents: String(totals.cost_cents), accumulated_depreciation_cents: String(totals.accumulated_depreciation_cents), net_book_value_cents: String(totals.net_book_value_cents) },
      });
    } catch (e) {
      console.error('GET /fixed-assets/schedule-d:', e.message);
      return res.status(500).json({ error: 'Could not compute Schedule D' });
    }
  });
}

module.exports = { registerFixedAssetRoutes };
