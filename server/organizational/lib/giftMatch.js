'use strict';

const { scoreCandidate } = require('./bankMatchScore');

const MAX_RESULTS = 8;

function likePattern(q) {
  return '%' + String(q).trim().replace(/[\\%_]/g, '\\$&') + '%';
}

async function findExpectedGifts(pool, { orgId, amountCents, date, text, q }) {
  const line = { text: text || '', cents: Number(amountCents) || 0, date: date || new Date().toISOString().slice(0, 10) };
  const searching = !!(q && String(q).trim());
  const like = searching ? likePattern(q) : null;
  const cands = [];

  const inst = await pool.query(
    `SELECT i.id, i.gift_id, i.due_date::text AS due, i.amount_cents, g.constituent_id, c.display_name, g.receivable_account_id, g.program_id
       FROM org_gift_pledge_installments i
       JOIN org_gifts g ON g.id = i.gift_id AND g.org_id = i.org_id
       LEFT JOIN org_constituents c ON c.id = g.constituent_id
      WHERE i.org_id = $1 AND i.status = 'expected' AND g.gift_type = 'pledge' AND g.posting_status = 'posted'
        AND g.pledge_status = 'unconditional' AND g.receivable_account_id IS NOT NULL
        ${searching ? "AND c.display_name ILIKE $2 ESCAPE '\\'" : ''}
      ORDER BY i.due_date LIMIT 200`, searching ? [orgId, like] : [orgId]);
  inst.rows.forEach((r) => cands.push({
    kind: 'pledge_installment', id: r.id, gift_id: r.gift_id, donor_id: r.constituent_id, donor_name: r.display_name,
    label: 'Pledge installment from ' + (r.display_name || 'a donor') + ', due ' + r.due,
    amount_cents: Number(r.amount_cents), date: r.due, names: [r.display_name],
  }));

  const grants = await pool.query(
    `SELECT g.id, g.constituent_id, c.display_name, g.amount_cents, g.received_at::date::text AS d, gr.name AS grant_name
       FROM org_gifts g
       LEFT JOIN org_constituents c ON c.id = g.constituent_id
       LEFT JOIN org_grants gr ON gr.id = g.grant_id
      WHERE g.org_id = $1 AND g.gift_type = 'grant' AND g.posting_status = 'unposted' AND g.ledger_transaction_id IS NULL
        AND g.payment_method IS DISTINCT FROM 'in_kind'
        ${searching ? "AND (c.display_name ILIKE $2 ESCAPE '\\' OR gr.name ILIKE $2 ESCAPE '\\')" : ''}
      ORDER BY g.received_at DESC LIMIT 200`, searching ? [orgId, like] : [orgId]);
  grants.rows.forEach((r) => cands.push({
    kind: 'grant_gift', id: r.id, gift_id: r.id, donor_id: r.constituent_id, donor_name: r.display_name,
    label: 'Grant payment expected' + (r.grant_name ? ' for ' + r.grant_name : '') + (r.display_name ? ' from ' + r.display_name : ''),
    amount_cents: Number(r.amount_cents), date: r.d, names: [r.display_name, r.grant_name],
  }));

  const crm = await pool.query(
    `SELECT g.id, g.constituent_id, c.display_name, g.amount_cents, g.received_at::date::text AS d
       FROM org_gifts g
       LEFT JOIN org_constituents c ON c.id = g.constituent_id
      WHERE g.org_id = $1 AND g.gift_type = 'donation' AND g.posting_status = 'not_applicable' AND g.ledger_transaction_id IS NULL
        AND g.payment_method IS DISTINCT FROM 'in_kind' AND g.review_status <> 'dismissed'
        ${searching ? "AND c.display_name ILIKE $2 ESCAPE '\\'" : ''}
      ORDER BY g.received_at DESC LIMIT 300`, searching ? [orgId, like] : [orgId]);
  crm.rows.forEach((r) => cands.push({
    kind: 'crm_gift', id: r.id, gift_id: r.id, donor_id: r.constituent_id, donor_name: r.display_name,
    label: 'Gift recorded in Funding' + (r.display_name ? ' from ' + r.display_name : '') + ', not in the books yet',
    amount_cents: Number(r.amount_cents), date: r.d, names: [r.display_name],
  }));

  const out = [];
  for (const c of cands) {
    const s = scoreCandidate(line, { names: c.names, cents: c.amount_cents, date: c.date });
    const amountClose = s.reasons.includes('exact amount') || s.reasons.includes('amount within 2%');
    if (!searching && !amountClose) continue;
    out.push({ kind: c.kind, id: c.id, gift_id: c.gift_id, donor_id: c.donor_id, donor_name: c.donor_name, label: c.label,
      amount_cents: c.amount_cents, date: c.date, score: s.score, reasons: s.reasons });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, MAX_RESULTS);
}

async function loadExpected(pool, orgId, kind, id) {
  if (kind === 'pledge_installment') {
    const r = await pool.query(
      `SELECT i.id, i.gift_id, i.amount_cents, i.due_date::text AS due, g.constituent_id, g.receivable_account_id, g.program_id
         FROM org_gift_pledge_installments i JOIN org_gifts g ON g.id = i.gift_id AND g.org_id = i.org_id
        WHERE i.id = $1 AND i.org_id = $2 AND i.status = 'expected' AND g.gift_type = 'pledge' AND g.posting_status = 'posted'
          AND g.pledge_status = 'unconditional' AND g.receivable_account_id IS NOT NULL`, [id, orgId]);
    return r.rows[0] ? { kind, ...r.rows[0] } : null;
  }
  if (kind === 'grant_gift' || kind === 'crm_gift') {
    const r = await pool.query(
      `SELECT id, constituent_id, amount_cents, gift_type, posting_status FROM org_gifts
        WHERE id = $1 AND org_id = $2 AND ledger_transaction_id IS NULL
          AND ((gift_type = 'grant' AND posting_status = 'unposted') OR (gift_type = 'donation' AND posting_status = 'not_applicable'))`, [id, orgId]);
    const row = r.rows[0];
    if (!row) return null;
    if (kind === 'grant_gift' && row.gift_type !== 'grant') return null;
    if (kind === 'crm_gift' && row.gift_type !== 'donation') return null;
    return { kind, ...row };
  }
  return null;
}

module.exports = { findExpectedGifts, loadExpected };
