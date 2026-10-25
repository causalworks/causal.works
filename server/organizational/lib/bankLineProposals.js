'use strict';

// Prepares coding proposals for unconfirmed bank lines from the workspace's bank rules, then from how the same payee was coded before. A person accepts each one in the proposals queue.

const { matchRulesForLines } = require('../routes/bankRules');
const { runTool } = require('../tools');
const { effectiveMode, assistantContext } = require('./assistantSeat');
const bankLineModel = require('./bankLineModel');

const BATCH_LIMIT = 200;
const MODEL_LIMIT = 25;

async function payeeHistory(pool, orgId, line) {
  const payee = String(line.payee_raw || '').trim();
  if (!payee) return null;
  const r = await pool.query(
    `SELECT l.account_id, a.code AS account_code, a.name AS account_name, l.program_id, p.name AS program_name,
            l.grant_id, l.donor_restriction_class::text AS donor_restriction_class, COUNT(*)::int AS n
       FROM org_bank_statement_lines bsl
       JOIN org_ledger_transactions t ON t.id = bsl.ledger_transaction_id AND t.source = 'bank_reconciliation' AND t.status = 'posted'
       JOIN (SELECT transaction_id, COUNT(*) AS line_count FROM org_ledger_lines GROUP BY transaction_id) lc ON lc.transaction_id = t.id AND lc.line_count = 2
       JOIN org_ledger_lines l ON l.transaction_id = t.id AND l.account_id != bsl.bank_account_id
       JOIN org_accounts a ON a.id = l.account_id
       JOIN org_programs p ON p.id = l.program_id
      WHERE bsl.org_id = $1 AND bsl.status = 'confirmed' AND bsl.is_internal_transfer = false AND bsl.id != $2
        AND bsl.credit_debit_indicator = $4 AND lower(trim(bsl.payee_raw)) = lower($3)
      GROUP BY l.account_id, a.code, a.name, l.program_id, p.name, l.grant_id, l.donor_restriction_class
      ORDER BY n DESC, MAX(bsl.statement_date) DESC`,
    [orgId, line.id, payee, line.credit_debit_indicator]);
  if (!r.rows.length) return null;
  const total = r.rows.reduce((s, x) => s + x.n, 0);
  return { top: r.rows[0], total, kinds: r.rows.length };
}

// Returns { input, reason, evidence, warnings } for one line, or null when neither the rules nor the history settle it.
async function suggestForLine(pool, orgId, line) {
  const byRule = (await matchRulesForLines(pool, orgId, [line.id]))[line.id];
  if (byRule) {
    return {
      input: { line_id: line.id, account_id: byRule.account_id, program_id: byRule.program_id, grant_id: byRule.grant_id, donor_restriction_class: byRule.donor_restriction_class, coding_source: 'rule', applied_rule_id: byRule.rule_id },
      reason: `Matches your bank rule "${byRule.rule_name}".`,
      evidence: { basis: 'bank_rule', rule_id: byRule.rule_id },
      warnings: null,
    };
  }
  const h = await payeeHistory(pool, orgId, line);
  if (!h) return null;
  const x = h.top;
  const warnings = h.kinds > 1 ? [`Coded ${h.kinds} different ways before.`] : null;
  return {
    input: { line_id: line.id, account_id: x.account_id, program_id: x.program_id, grant_id: x.grant_id, donor_restriction_class: x.donor_restriction_class, coding_source: 'manual' },
    reason: `Same coding as ${x.n} of ${h.total} past ${h.total === 1 ? 'payment' : 'payments'} to this payee.`,
    evidence: { basis: 'payee_history', matching_lines: x.n, payee_lines: h.total, codings_seen: h.kinds },
    warnings,
  };
}

// Proposes coding for unconfirmed lines that have no open proposal. Does nothing while the assistant is off for the workspace. Lines no rule or history settles go to the language model when it is switched on and the assistant holds a live seat.
async function proposeForUnconfirmedLines(pool, orgId, { modelSuggest = bankLineModel.suggestWithModel, modelEnabled = bankLineModel.enabled, modelDelayMs = 1100 } = {}) {
  const mode = await effectiveMode(pool, orgId, null);
  if (mode === 'off') return { skipped: 'The assistant is off in this workspace', proposed: 0, expired: 0 };

  const expired = await pool.query(
    `UPDATE org_tool_proposals p SET status = 'expired'
      WHERE p.org_id = $1 AND p.status = 'open' AND p.tool_name = 'bank_line.code'
        AND NOT EXISTS (SELECT 1 FROM org_bank_statement_lines s WHERE s.org_id = p.org_id AND s.id = (p.input->>'line_id')::int AND s.status = 'unconfirmed')
      RETURNING p.id`, [orgId]);

  const lines = await pool.query(
    `SELECT s.* FROM org_bank_statement_lines s
      WHERE s.org_id = $1 AND s.status = 'unconfirmed' AND s.is_internal_transfer = false AND s.pending = false
        AND NOT EXISTS (SELECT 1 FROM org_tool_proposals p WHERE p.org_id = s.org_id AND p.tool_name = 'bank_line.code' AND p.status IN ('open', 'dismissed') AND (p.input->>'line_id')::int = s.id)
      ORDER BY s.statement_date, s.id LIMIT ${BATCH_LIMIT}`, [orgId]);

  let proposed = 0;
  let proposedByModel = 0;
  const leftovers = [];
  for (const line of lines.rows) {
    const s = await suggestForLine(pool, orgId, line);
    if (!s) { leftovers.push(line); continue; }
    const ctx = { pool, orgId, userId: null, actor: 'job', programScope: null, meta: {}, proposal: { reason: s.reason, evidence: s.evidence, warnings: s.warnings } };
    const out = await runTool('bank_line.code', ctx, s.input);
    if (out.httpStatus === 202) proposed += 1;
  }

  if (modelEnabled() && leftovers.length) {
    const seat = await assistantContext(pool, { orgId });
    if (seat.ctx) {
      for (const line of leftovers.filter((l) => !l.model_tried_at).slice(0, MODEL_LIMIT)) {
        let s;
        if (modelDelayMs) await new Promise((r) => setTimeout(r, modelDelayMs));
        try {
          s = await modelSuggest(pool, orgId, line);
        } catch (e) {
          console.warn('bank line model step:', String(e.message).slice(0, 120));
          continue;
        }
        await pool.query('UPDATE org_bank_statement_lines SET model_tried_at = now() WHERE id = $1 AND org_id = $2', [line.id, orgId]);
        if (!s) continue;
        const out = await runTool('bank_line.code', { ...seat.ctx, proposal: { reason: s.reason, evidence: s.evidence, warnings: s.warnings, model: s.model, promptVersion: s.promptVersion } }, s.input);
        if (out.httpStatus === 202) { proposed += 1; proposedByModel += 1; }
      }
    }
  }
  return { proposed, proposedByModel, expired: expired.rowCount, examined: lines.rows.length };
}

module.exports = { suggestForLine, proposeForUnconfirmedLines };
