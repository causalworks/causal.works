'use strict';

// Tools that put gifts into the books: in-kind and pledge commitments, voiding a gift posting, linking a grant gift to a bank transaction, accepting a "not a gift" flag, and pledge accretion.

const { defineTool } = require('./registry');
const { logAudit } = require('../lib/auditLog');
const { isFiscalYearLocked } = require('../lib/ledgerPosting');
const { postInKindGift, postPledgeCommitment, voidGiftPosting } = require('../lib/giftPosting');
const { runPledgeAccretion } = require('../lib/pledgeAccretion');
const { linkOrReclassifyGrantGiftTransaction } = require('../lib/grantGiftPayment');
const { acquireDocumentLock } = require('../lib/documentLock');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const posInt = (v) => { const n = Number.parseInt(String(v), 10); return Number.isInteger(n) && n >= 1 ? n : null; };
const optNum = (v) => (v != null ? Number(v) : undefined);

async function locked(ctx, key, fn) {
  const lock = await acquireDocumentLock(ctx.pool, key);
  try { return await fn(); } finally { await lock.release(); }
}

defineTool({
  name: 'gift.post',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const id = posInt(b.id);
    if (!id) return { error: 'invalid gift id' };
    return { value: { id, b } };
  },
  run: (ctx, { id, b }) => locked(ctx, 'gift:' + id, async () => {
    const { pool, orgId, userId } = ctx;
    const postingDate = b.posting_date != null ? String(b.posting_date) : null;
    const kindR = await pool.query('SELECT gift_type, payment_method FROM org_gifts WHERE id = $1 AND org_id = $2 LIMIT 1', [id, orgId]);
    if (!kindR.rows.length) return { httpStatus: 404, body: { error: 'Gift not found' } };
    const isInKind = kindR.rows[0].payment_method === 'in_kind';
    const isPledge = kindR.rows[0].gift_type === 'pledge';
    const common = {
      orgId, userId, giftId: id, postingDate,
      revenueAccountId: optNum(b.revenue_account_id),
      programId: optNum(b.program_id),
      donorRestrictionClass: b.donor_restriction_class !== undefined ? b.donor_restriction_class : undefined,
    };
    let result;
    if (isInKind) {
      result = await postInKindGift(pool, { ...common, expenseAccountId: optNum(b.expense_account_id) });
    } else if (isPledge) {
      result = await postPledgeCommitment(pool, {
        ...common, receivableAccountId: optNum(b.receivable_account_id),
        discountRateBps: optNum(b.discount_rate_bps), pledgeYears: optNum(b.pledge_years),
      });
    } else {
      return { httpStatus: 400, body: { error: 'This gift is neither in-kind nor a pledge -- nothing to post' } };
    }
    if (result.httpStatus < 400 && isPledge) {
      const g = await pool.query(
        `SELECT g.is_multi_year_pledge, (SELECT COUNT(*) FROM org_gift_pledge_installments i WHERE i.gift_id = g.id) AS installments
           FROM org_gifts g WHERE g.id = $1 AND g.org_id = $2`, [id, orgId]);
      if (g.rows[0] && g.rows[0].is_multi_year_pledge && Number(g.rows[0].installments) === 0) {
        result.body.warning = 'This multi-year pledge has no installment schedule, so its discount will not be accreted. Add the installments in Funding.';
      }
    }
    return result;
  }),
});

defineTool({
  name: 'gift.void_posting',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const id = posInt(b.id);
    if (!id) return { error: 'invalid gift id' };
    return { value: { id, voidReason: b.void_reason != null ? String(b.void_reason) : null } };
  },
  run: (ctx, v) => locked(ctx, 'gift:' + v.id, () => voidGiftPosting(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, giftId: v.id, voidReason: v.voidReason })),
});

defineTool({
  name: 'gift.link_transaction',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const id = posInt(b.id);
    if (!id) return { error: 'invalid gift id' };
    const transactionId = posInt(b.ledger_transaction_id);
    if (!transactionId) return { error: 'ledger_transaction_id is required' };
    return { value: { id, transactionId } };
  },
  run: (ctx, v) => locked(ctx, 'gift:' + v.id, () => linkOrReclassifyGrantGiftTransaction(ctx.pool, {
    orgId: ctx.orgId, userId: ctx.userId, giftId: v.id, transactionId: v.transactionId })),
});

defineTool({
  name: 'pledge.run_accretion',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const throughDate = b.through_date != null ? String(b.through_date) : null;
    if (!throughDate || !DATE_RE.test(throughDate)) return { error: 'through_date is required and must be YYYY-MM-DD' };
    const incomeAccountId = posInt(b.income_account_id);
    if (!incomeAccountId) return { error: 'income_account_id is required' };
    return { value: { throughDate, incomeAccountId } };
  },
  run: (ctx, v) => locked(ctx, 'pledge-accretion:' + ctx.orgId, async () => {
    const { posted, failed } = await runPledgeAccretion(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, throughDate: v.throughDate, incomeAccountId: v.incomeAccountId });
    return { httpStatus: 200, body: { posted, failed, posted_count: posted.length, failed_count: failed.length } };
  }),
});

defineTool({
  name: 'gift.resolve_not_a_gift',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const id = posInt(b.id);
    if (!id) return { error: 'invalid gift id' };
    return { value: { id, body: b } };
  },
  run: (ctx, { id: giftId, body }) => locked(ctx, 'gift:' + giftId, async () => {
    const { orgId, userId } = ctx;
    const accept = !body.keep;
    const client = await ctx.pool.connect();
    const fail = async (httpStatus, payload) => { await client.query('ROLLBACK'); return { httpStatus, body: payload }; };
    try {
      await client.query('BEGIN');
      const gR = await client.query(
        `SELECT id, ledger_transaction_id, not_gift_note FROM org_gifts
          WHERE id = $1 AND org_id = $2 AND not_gift_flagged_at IS NOT NULL AND review_status <> 'dismissed' FOR UPDATE`, [giftId, orgId]);
      const g = gR.rows[0];
      if (!g) return await fail(404, { error: 'No flagged gift with that id' });
      if (!accept) {
        await client.query('UPDATE org_gifts SET not_gift_flagged_at = NULL, not_gift_flagged_by = NULL, not_gift_note = NULL WHERE id = $1', [giftId]);
        await logAudit(client, { orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
          fields: [{ fieldName: 'Not a gift', oldValue: 'flagged for Accounting', newValue: 'kept as a gift' }] });
        await client.query('COMMIT');
        return { httpStatus: 200, body: { id: giftId, accepted: false } };
      }
      let recoded = null;
      if (g.ledger_transaction_id) {
        const tR = await client.query('SELECT id, fiscal_year, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [g.ledger_transaction_id, orgId]);
        const t = tR.rows[0];
        if (t && t.status === 'posted') {
          let accountId = Number.parseInt(String(body.account_id), 10);
          const programId = body.program_id != null && body.program_id !== '' ? Number.parseInt(String(body.program_id), 10) : null;
          if (body.uncoded) {
            const uR = await client.query('SELECT id FROM org_accounts WHERE org_id = $1 AND is_system_unallocated_receipts_account LIMIT 1', [orgId]);
            if (!uR.rows.length) return await fail(409, { error: 'This workspace has no holding account for uncoded receipts. Choose an account.' });
            accountId = uR.rows[0].id;
          }
          if (!(accountId > 0)) return await fail(400, { error: 'Choose the account this money belongs in, or leave it uncoded for later.' });
          if (!body.uncoded && !(programId > 0)) return await fail(400, { error: 'Choose a program, or leave it uncoded for later.' });
          if (await isFiscalYearLocked(client, orgId, t.fiscal_year)) {
            return await fail(409, { error: 'Fiscal year ' + t.fiscal_year + ' is closed, so the entry cannot be recoded. Reopen the year, or void the entry and enter the corrected one, then accept.', code: 'recode_in_transactions', transaction_id: t.id });
          }
          const aR = await client.query('SELECT id, code, name, is_posting, is_cash_account FROM org_accounts WHERE org_id = $1 AND id = $2', [orgId, accountId]);
          if (!aR.rows.length || !aR.rows[0].is_posting || aR.rows[0].is_cash_account) return await fail(400, { error: 'Choose a posting account that is not a bank account.' });
          const lR = await client.query(
            `SELECT l.id, l.account_id, l.program_id, a.code || ' ' || a.name AS label
               FROM org_ledger_lines l JOIN org_accounts a ON a.id = l.account_id
              WHERE l.transaction_id = $1 AND l.credit_cents > 0 AND (l.source_line_type = 'org_gifts' AND l.source_line_id = $2 OR a.type = 'income')`, [t.id, giftId]);
          if (lR.rows.length !== 1) return await fail(409, { error: 'This entry has more than one income line. Recode it in Transactions, then accept.', code: 'recode_in_transactions', transaction_id: t.id });
          const line = lR.rows[0];
          const fields = [{ fieldName: 'Donor review', oldValue: null, newValue: 'Accepted as not a gift' }];
          if (line.account_id !== accountId) fields.push({ fieldName: 'Income line account', oldValue: line.label, newValue: aR.rows[0].code + ' ' + aR.rows[0].name });
          if (!body.uncoded && programId && programId !== line.program_id) fields.push({ fieldName: 'Income line program', oldValue: String(line.program_id), newValue: String(programId) });
          await client.query('UPDATE org_ledger_lines SET account_id = $1, program_id = COALESCE($2, program_id) WHERE id = $3', [accountId, body.uncoded ? null : programId, line.id]);
          await logAudit(client, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: t.id, fields,
            metadata: { reason: 'Not a gift: ' + (g.not_gift_note || '') + (body.uncoded ? ' (left uncoded for later)' : '') } });
          recoded = t.id;
        }
      }
      await client.query(`UPDATE org_gifts SET review_status = 'dismissed', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`, [userId, giftId]);
      await logAudit(client, { orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
        fields: [{ fieldName: 'Not a gift', oldValue: 'flagged for Accounting', newValue: 'accepted, removed from Funding' }] });
      await client.query('COMMIT');
      return { httpStatus: 200, body: { id: giftId, accepted: true, recoded_transaction_id: recoded } };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }),
});
