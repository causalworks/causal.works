'use strict';

// Suggests an account and program for each line read from an uploaded bill, from the org's earlier bill lines.

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'inc', 'llc', 'co', 'ltd', 'fee', 'fees', 'charge', 'charges', 'item', 'items', 'order', 'invoice']);

function tokens(text) {
  return new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)));
}

async function suggestBillCoding(pool, orgId, vendorId, descriptions) {
  const r = await pool.query(
    `SELECT b.constituent_id, l.account_id, l.program_id, l.line_memo
       FROM org_bill_lines l
       JOIN org_bills b ON b.id = l.bill_id
       JOIN org_accounts a ON a.id = l.account_id AND a.org_id = b.org_id AND a.is_posting
      WHERE b.org_id = $1 AND b.status NOT IN ('void', 'draft')
      ORDER BY b.bill_date DESC, b.id DESC
      LIMIT 600`,
    [orgId]
  );
  const history = r.rows.map((row) => ({
    vendor: vendorId != null && Number(row.constituent_id) === Number(vendorId),
    account_id: Number(row.account_id), program_id: Number(row.program_id), words: tokens(row.line_memo),
  }));
  const vendorCounts = new Map();
  for (const h of history) {
    if (!h.vendor) continue;
    const key = h.account_id + ':' + h.program_id;
    vendorCounts.set(key, (vendorCounts.get(key) || 0) + 1);
  }
  let vendorTop = null;
  for (const [key, n] of vendorCounts) if (!vendorTop || n > vendorTop.n) vendorTop = { key, n };

  return descriptions.map((desc) => {
    const words = tokens(desc);
    let best = null;
    for (const h of history) {
      let score = 0;
      for (const w of words) if (h.words.has(w)) score += 1;
      if (!score) continue;
      if (h.vendor) score += 0.5;
      if (!best || score > best.score) best = { score, h };
    }
    if (best) return { account_id: best.h.account_id, program_id: best.h.program_id, source: 'similar_line' };
    if (vendorTop) {
      const [accountId, programId] = vendorTop.key.split(':').map(Number);
      return { account_id: accountId, program_id: programId, source: 'vendor_history' };
    }
    return null;
  });
}

module.exports = { suggestBillCoding };
