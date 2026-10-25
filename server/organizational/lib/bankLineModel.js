'use strict';

// Asks the configured language model to propose an account and program for a bank line that no rule or payee history settled. Sends minimized text only.

const { generate } = require('../../ai/llmClient');

const TASK = 'bank_coding';
const AGENT_NAME = 'Loopy';
const PROMPT_VERSION = 'bank-coding-1';
const MAX_CANDIDATES = 200;

function enabled() {
  return !!String(process.env.LLM_PROVIDER_BANK_CODING || '').trim();
}

function modelName() {
  return String(process.env.LLM_MODEL_BANK_CODING || '').trim() || 'default';
}

function clean(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ')
    .replace(/\d{4,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function amountBand(cents) {
  const d = Number(cents) / 100;
  if (d < 25) return 'under $25';
  if (d < 100) return '$25 to $100';
  if (d < 500) return '$100 to $500';
  if (d < 2500) return '$500 to $2,500';
  if (d < 10000) return '$2,500 to $10,000';
  return 'over $10,000';
}

async function candidates(pool, orgId, direction) {
  const type = direction === 'credit' ? 'income' : 'expense';
  const accounts = await pool.query(
    `SELECT id, name FROM org_accounts
      WHERE org_id = $1 AND type = $2::org_account_type AND is_posting AND import_active
        AND NOT is_system_clearing_account AND NOT is_system_ap_account AND NOT is_system_ar_account AND NOT is_statistical
      ORDER BY code LIMIT ${MAX_CANDIDATES}`, [orgId, type]);
  const programs = await pool.query(
    `SELECT id, name FROM org_programs WHERE org_id = $1 AND active AND NOT is_system_transfer_program ORDER BY name LIMIT ${MAX_CANDIDATES}`, [orgId]);
  return { accounts: accounts.rows, programs: programs.rows };
}

function buildPrompt(sent) {
  const list = (items) => items.map((x) => `${x.key}: ${x.name}`).join('\n');
  return `You help a small nonprofit code one bank transaction. Choose the single best account and program from the lists. If you cannot tell, answer with "confidence": "low".

Transaction (${sent.direction === 'credit' ? 'money in' : 'money out'}):
payee: ${sent.payee || '(none)'}
memo: ${sent.memo || '(none)'}
amount: ${sent.amount}

Accounts:
${list(sent.accounts)}

Programs:
${list(sent.programs)}

Answer with JSON only: {"account": "<account key>", "program": "<program key>", "confidence": "high" | "medium" | "low", "why": "<one short sentence>"}`;
}

// Returns { input, reason, evidence, warnings, model, promptVersion }, or null when the model cannot settle the line.
async function suggestWithModel(pool, orgId, line, { call = generate } = {}) {
  const { accounts, programs } = await candidates(pool, orgId, line.credit_debit_indicator);
  if (!accounts.length || !programs.length) return null;
  const sent = {
    direction: line.credit_debit_indicator,
    payee: clean(line.payee_raw),
    memo: clean(line.description_raw),
    amount: amountBand(line.amount_cents),
    accounts: accounts.map((a, i) => ({ key: `A${i + 1}`, name: a.name })),
    programs: programs.map((p, i) => ({ key: `P${i + 1}`, name: p.name })),
  };
  if (!sent.payee && !sent.memo) return null;

  const raw = await call(TASK, buildPrompt(sent), { json: true, temperature: 0, timeoutMs: 30000 });
  let out;
  try { out = JSON.parse(raw); } catch { return null; }
  const account = accounts[sent.accounts.findIndex((a) => a.key === out.account)];
  const program = programs[sent.programs.findIndex((p) => p.key === out.program)];
  if (!account || !program || !['high', 'medium'].includes(out.confidence)) return null;

  const why = String(out.why || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return {
    input: { line_id: line.id, account_id: account.id, program_id: program.id, coding_source: 'manual' },
    reason: `No bank rule or earlier coding of this payee exists. ${AGENT_NAME} suggests: ${account.name}, ${program.name} based on common knowledge. Confidence: ${out.confidence}.`,
    evidence: {
      basis: 'model',
      confidence: out.confidence,
      why,
      sent: { direction: sent.direction, payee: sent.payee, memo: sent.memo, amount: sent.amount, candidate_accounts: sent.accounts.length, candidate_programs: sent.programs.length },
    },
    warnings: null,
    model: modelName(),
    promptVersion: PROMPT_VERSION,
  };
}

module.exports = { enabled, suggestWithModel, clean, amountBand };
