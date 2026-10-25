'use strict';

// Tools that run depreciation for an organization and dispose of a fixed asset.

const { defineTool } = require('./registry');
const { postLedgerTransaction, voidLedgerTransaction } = require('../lib/ledgerPosting');
const { acquireDocumentLock } = require('../lib/documentLock');
const { computeDuePeriods } = require('../lib/fixedAssetDepreciation');
const { logAudit } = require('../lib/auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function withAssetLock(ctx, fn) {
  const lock = await acquireDocumentLock(ctx.pool, 'fixed-assets:' + ctx.orgId);
  try { return await fn(); } finally { await lock.release(); }
}

defineTool({
  name: 'fixed_assets.run_depreciation',
  capability: 'post',
  nonHuman: 'propose',
  validate: (input) => {
    const throughDate = input.through_date != null ? String(input.through_date) : null;
    if (!throughDate || !DATE_RE.test(throughDate)) return { error: 'through_date is required and must be YYYY-MM-DD' };
    return { value: { throughDate } };
  },
  run: (ctx, v) => withAssetLock(ctx, async () => {
    const { pool, orgId, userId } = ctx;
    const due = await computeDuePeriods(pool, orgId, v.throughDate);
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
        [orgId, d.asset_id, d.period_date, d.amount_cents, result.body.id]);
      if (!insertR.rows.length) {
        await voidLedgerTransaction(pool, { orgId, userId, transactionId: result.body.id, voidReason: 'Depreciation for this period was already recorded' });
        continue;
      }
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
        [assetIds, orgId]);
    }
    await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_fixed_asset_depreciation_entries', metadata: { ...ctx.meta, through_date: v.throughDate, posted_count: posted.length, failed_count: failed.length } });
    return { httpStatus: 200, body: { posted, failed, posted_count: posted.length, failed_count: failed.length } };
  }),
});

defineTool({
  name: 'fixed_assets.dispose',
  capability: 'post',
  nonHuman: 'propose',
  validate: (body) => {
    const assetId = Number.parseInt(String(body.id), 10);
    if (!Number.isInteger(assetId) || assetId < 1) return { error: 'invalid asset id' };
    const disposalDate = body.disposal_date != null ? String(body.disposal_date) : null;
    if (!disposalDate || !DATE_RE.test(disposalDate)) return { error: 'disposal_date is required and must be YYYY-MM-DD' };
    const proceedsCents = body.disposal_proceeds_cents != null ? Number.parseInt(String(body.disposal_proceeds_cents), 10) : 0;
    if (!Number.isInteger(proceedsCents) || proceedsCents < 0) return { error: 'disposal_proceeds_cents must be a non-negative integer if provided' };
    const bankAccountId = body.bank_account_id != null && body.bank_account_id !== '' ? Number.parseInt(String(body.bank_account_id), 10) : null;
    if (proceedsCents > 0 && !bankAccountId) return { error: 'bank_account_id is required when disposal_proceeds_cents is greater than 0' };
    const gainLossAccountId = body.gain_loss_account_id != null && body.gain_loss_account_id !== '' ? Number.parseInt(String(body.gain_loss_account_id), 10) : null;
    return { value: { assetId, disposalDate, proceedsCents, bankAccountId, gainLossAccountId } };
  },
  run: (ctx, v) => withAssetLock(ctx, async () => {
    const { pool, orgId, userId } = ctx;
    const { assetId, disposalDate, proceedsCents, bankAccountId, gainLossAccountId } = v;
    const assetR = await pool.query(
      `SELECT fa.*, COALESCE((SELECT SUM(amount_cents) FROM org_fixed_asset_depreciation_entries e WHERE e.fixed_asset_id = fa.id), 0) + fa.prior_depreciation_cents AS accumulated_depreciation_cents
       FROM org_fixed_assets fa WHERE fa.id = $1 AND fa.org_id = $2`, [assetId, orgId]);
    if (!assetR.rows.length) return { httpStatus: 404, body: { error: 'Fixed asset not found' } };
    const asset = assetR.rows[0];
    if (asset.status === 'disposed') return { httpStatus: 409, body: { error: 'This asset has already been disposed', code: 'already_disposed' } };

    const costCents = Number(asset.cost_cents);
    const accumulatedCents = Number(asset.accumulated_depreciation_cents);
    const netBookValueCents = costCents - accumulatedCents;
    const gainLossCents = proceedsCents - netBookValueCents;
    if (gainLossCents !== 0 && !gainLossAccountId) {
      return { httpStatus: 400, body: {
        error: 'gain_loss_account_id is required: disposal_proceeds_cents (' + proceedsCents + ') does not equal net book value (' + netBookValueCents + '), producing a ' + (gainLossCents > 0 ? 'gain' : 'loss') + ' of ' + Math.abs(gainLossCents) + ' cents that needs an account to post to.',
        code: 'gain_loss_account_required',
      } };
    }

    const lines = [{ account_id: asset.asset_account_id, program_id: asset.program_id, debit_cents: 0, credit_cents: costCents }];
    if (accumulatedCents > 0) lines.push({ account_id: asset.accumulated_depreciation_account_id, program_id: asset.program_id, debit_cents: accumulatedCents, credit_cents: 0 });
    if (proceedsCents > 0) lines.push({ account_id: bankAccountId, program_id: asset.program_id, debit_cents: proceedsCents, credit_cents: 0 });
    if (gainLossCents > 0) lines.push({ account_id: gainLossAccountId, program_id: asset.program_id, debit_cents: 0, credit_cents: gainLossCents });
    else if (gainLossCents < 0) lines.push({ account_id: gainLossAccountId, program_id: asset.program_id, debit_cents: -gainLossCents, credit_cents: 0 });

    const result = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: disposalDate, memo: 'Disposal: ' + asset.name,
      payee: null, referenceNumber: null, lines, source: 'fixed_asset_disposal',
    });
    if (result.httpStatus >= 400) return result;
    await pool.query(
      `UPDATE org_fixed_assets SET status = 'disposed', disposal_date = $1, disposal_proceeds_cents = $2 WHERE id = $3 AND org_id = $4`,
      [disposalDate, proceedsCents, assetId, orgId]);
    return { httpStatus: 200, body: { id: assetId, status: 'disposed', ledger_transaction_id: result.body.id, gain_loss_cents: String(gainLossCents) } };
  }),
});
