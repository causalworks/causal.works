'use strict';

// How the assistant's bank line coding proposals fared: agreed, changed or dismissed, by month, by payee and by account.

// Outcome of each proposal. A proposal that expired because the line was coded by hand counts as agreed when the entry has the proposed account and program, otherwise as changed.
const OUTCOMES_SQL = `
  SELECT p.id, p.created_at, p.proposer_kind, p.model,
         s.payee_raw, a.name AS account_name, COALESCE(p.evidence->>'basis', 'unknown') AS basis,
         CASE
           WHEN p.status = 'accepted' THEN 'agreed'
           WHEN p.status = 'changed' THEN 'changed'
           WHEN p.status = 'dismissed' THEN 'dismissed'
           WHEN p.status = 'expired' AND s.status = 'confirmed' THEN
             CASE WHEN EXISTS (
               SELECT 1 FROM org_ledger_lines l
                WHERE l.transaction_id = s.ledger_transaction_id AND l.account_id = (p.input->>'account_id')::int AND l.program_id = (p.input->>'program_id')::int
             ) THEN 'agreed' ELSE 'changed' END
           ELSE 'open'
         END AS outcome
    FROM org_tool_proposals p
    LEFT JOIN org_bank_statement_lines s ON s.org_id = p.org_id AND s.id = (p.input->>'line_id')::int
    LEFT JOIN org_accounts a ON a.org_id = p.org_id AND a.id = (p.input->>'account_id')::int
   WHERE p.org_id = $1 AND p.tool_name = 'bank_line.code'`;

function summarize(rows, keyOf) {
  const m = new Map();
  for (const r of rows) {
    if (r.outcome === 'open') continue;
    const k = keyOf(r);
    const e = m.get(k) || { key: k, agreed: 0, changed: 0, dismissed: 0 };
    e[r.outcome] += 1;
    m.set(k, e);
  }
  return [...m.values()].map((e) => {
    const total = e.agreed + e.changed + e.dismissed;
    return { ...e, total, override_rate: total ? (e.changed + e.dismissed) / total : 0 };
  });
}

async function measure(pool, orgId) {
  const rows = (await pool.query(OUTCOMES_SQL, [orgId])).rows;
  const byMonth = summarize(rows, (r) => new Date(r.created_at).toISOString().slice(0, 7)).sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, 12);
  const worst = (list) => list.filter((e) => e.total >= 2).sort((a, b) => b.override_rate - a.override_rate || b.total - a.total).slice(0, 10);
  return {
    by_month: byMonth,
    by_source: summarize(rows, (r) => r.basis).sort((a, b) => (a.key < b.key ? -1 : 1)),
    by_payee: worst(summarize(rows, (r) => String(r.payee_raw || '').trim().toLowerCase() || '(no payee)')),
    by_category: worst(summarize(rows, (r) => r.account_name || '(unknown)')),
    open: rows.filter((r) => r.outcome === 'open').length,
  };
}

module.exports = { measure };
