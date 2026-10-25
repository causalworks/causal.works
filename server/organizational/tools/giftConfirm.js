'use strict';

// Tool that confirms the donor on a gift created from an Accounting entry and sets the entry's contact when it has none.

const { defineTool } = require('./registry');
const { acquireDocumentLock } = require('../lib/documentLock');
const { addContactRoles } = require('../lib/contactRoles');
const { logAudit } = require('../lib/auditLog');

const resp = (httpStatus, body) => ({ httpStatus, body });

defineTool({
  name: 'gift.confirm_donor',
  capability: 'write',
  nonHuman: 'propose',
  validate: (b) => {
    const id = Number.parseInt(String(b.id), 10);
    return Number.isInteger(id) && id >= 1 ? { value: { id, constituent_id: b.constituent_id, campaign: b.campaign } } : { error: 'Invalid id' };
  },
  run: async (ctx, v) => {
    const { pool, orgId, userId } = ctx;
    const giftId = v.id;
    const lock = await acquireDocumentLock(pool, 'gift:' + giftId);
    try {
      const g = (await pool.query(`SELECT * FROM org_gifts WHERE id = $1 AND org_id = $2 AND source = 'accounting' LIMIT 1`, [giftId, orgId])).rows[0];
      if (!g) return resp(404, { error: 'Gift not found' });
      if (g.review_status !== 'to_confirm') return resp(409, { error: 'This gift is already ' + g.review_status + '.' });
      let donorId = g.constituent_id != null ? Number(g.constituent_id) : null;
      if (v.constituent_id != null && v.constituent_id !== '') {
        donorId = Number.parseInt(String(v.constituent_id), 10);
        if (!Number.isInteger(donorId) || donorId < 1) return resp(400, { error: 'constituent_id must be a positive integer' });
        const c = await pool.query('SELECT 1 FROM org_constituents WHERE id = $1 AND org_id = $2', [donorId, orgId]);
        if (!c.rows.length) return resp(400, { error: 'That contact was not found in this workspace' });
      }
      if (!donorId) return resp(400, { error: 'Choose the donor from Contacts before confirming.' });
      const campaign = v.campaign !== undefined ? (String(v.campaign || '').trim() || null) : g.campaign;
      await addContactRoles(pool, orgId, donorId, ['donor']);
      await pool.query(
        `UPDATE org_gifts SET constituent_id = $1, campaign = $2, review_status = 'confirmed', reviewed_by = $3, reviewed_at = NOW() WHERE id = $4 AND org_id = $5`,
        [donorId, campaign, userId, giftId, orgId]);
      let ledgerContactSet = false;
      if (g.ledger_transaction_id) {
        try {
          const u = await pool.query(
            `UPDATE org_ledger_transactions SET constituent_id = $1 WHERE id = $2 AND org_id = $3 AND constituent_id IS NULL`,
            [donorId, g.ledger_transaction_id, orgId]);
          ledgerContactSet = u.rowCount > 0;
          if (ledgerContactSet) {
            logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: g.ledger_transaction_id,
              fields: [{ fieldName: 'Contact', oldValue: null, newValue: 'contact #' + donorId }], metadata: { ...ctx.meta, reason: 'Donor confirmed in Funding for gift #' + giftId } }).catch(() => {});
          }
        } catch (e) { console.error('confirm gift: could not set the entry contact:', e.message); }
      }
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
        fields: [{ fieldName: 'Review', oldValue: 'to_confirm', newValue: 'confirmed' }], metadata: ctx.meta }).catch(() => {});
      return resp(200, { id: giftId, review_status: 'confirmed', constituent_id: donorId, ledger_contact_set: ledgerContactSet });
    } finally { await lock.release(); }
  },
});
