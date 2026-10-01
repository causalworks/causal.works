'use strict';

/**
 * Offline side-by-side evaluation of email -> action extraction across LLM providers/models.
 * Reads a sample file (JSON array of stored emails + the stored extraction), runs the live
 * extractAction() prompt once per config, and writes results next to the sample. Never touches
 * the database or the running server; the sample and results files hold real email text, so keep
 * them outside the repo.
 *
 *   node scripts/llm-eval/email-extraction.js run    <sample.json> <results.json> [limit]
 *   node scripts/llm-eval/email-extraction.js report <results.json>
 *
 * Sample row: { id, raw, sender, reply_to, org_name, action_type, turnaround_category,
 *   secondary_turnarounds, e4a_parameters, decision_window_date, timing_confidence,
 *   rep_targets, material_stake, boundary_ids }
 */

const fs = require('fs');

const CONFIGS = [
  { label: 'gemini-A', provider: 'gemini', model: 'gemini-2.5-flash' },
  { label: 'gemini-B', provider: 'gemini', model: 'gemini-2.5-flash' }, // repeat run = Gemini's own noise
  { label: 'mistral-small', provider: 'mistral', model: 'mistral-small-2603' },
  { label: 'mistral-medium', provider: 'mistral', model: 'mistral-medium-latest' },
  { label: 'mistral-large', provider: 'mistral', model: 'mistral-large-2512' },
];
const BASELINE = 'gemini-A';
const FALLBACK_ASK = 'Manual review required'; // extractAction's swallowed-error marker
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function quiet(fn) {
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  return fn().finally(() => { console.log = log; console.warn = warn; console.error = error; });
}

async function runOne(extractAction, cfg, row) {
  process.env.LLM_PROVIDER_EMAIL_EXTRACT = cfg.provider;
  process.env.LLM_MODEL_EMAIL_EXTRACT = cfg.model;
  const started = Date.now();
  let result = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    result = await quiet(() => extractAction(row.raw, 'activist email', {
      senderEmail: row.sender, replyTo: row.reply_to, fromName: '', suggestedOrgFromSender: '',
    }));
    if (result.action_ask !== FALLBACK_ASK) break;
    await sleep(15000 * (attempt + 1)); // most failures here are rate limits
  }
  return { result, failed: result.action_ask === FALLBACK_ASK, ms: Date.now() - started };
}

async function run(samplePath, outPath, limit) {
  const { extractAction } = require('../../server/ai/ai-service');
  let sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  if (limit) sample = sample.slice(0, Number(limit));
  const out = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { sample, runs: {} };
  out.sample = sample;
  for (const cfg of CONFIGS) {
    out.runs[cfg.label] = out.runs[cfg.label] || { cfg, items: {} };
    for (const row of sample) {
      if (out.runs[cfg.label].items[row.id]) continue; // resumable
      out.runs[cfg.label].items[row.id] = await runOne(extractAction, cfg, row);
      fs.writeFileSync(outPath, JSON.stringify(out));
      process.stdout.write('.');
    }
    process.stdout.write(` ${cfg.label} done\n`);
  }
}

// ---- scoring ----
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const asSet = (a) => new Set((Array.isArray(a) ? a : []).map(norm).filter(Boolean));
function jaccard(a, b) {
  const A = asSet(a), B = asSet(b);
  if (!A.size && !B.size) return 1;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
}
const dateStr = (d) => (d ? String(d).slice(0, 10) : null);
const present = (v) => (v == null || v === '' ? 0 : 1);

const FIELDS = {
  action_type: (a, b) => (a.action_type === b.action_type ? 1 : 0),
  turnaround: (a, b) => (norm(a.turnaround_category) === norm(b.turnaround_category) ? 1 : 0),
  org_name: (a, b) => {
    const x = norm(a.org_name), y = norm(b.org_name);
    return x === y || x.includes(y) || y.includes(x) ? 1 : 0;
  },
  deadline_date: (a, b) => (dateStr(a.decision_window_date) === dateStr(b.decision_window_date) ? 1 : 0),
  timing_within_1: (a, b) => (Math.abs((a.timing_confidence || 0) - (b.timing_confidence || 0)) <= 1 ? 1 : 0),
  boundaries: (a, b) => jaccard(a.boundary_ids, b.boundary_ids),
  e4a_params: (a, b) => jaccard(a.e4a_parameters, b.e4a_parameters),
  secondary: (a, b) => jaccard(a.secondary_turnarounds, b.secondary_turnarounds),
  rep_targets: (a, b) => jaccard(a.rep_targets, b.rep_targets),
  leverage_null_match: (a, b) => (present(a.leverage_point) === present(b.leverage_point) ? 1 : 0),
  stake_null_match: (a, b) => (present(a.material_stake) === present(b.material_stake) ? 1 : 0),
};

function report(outPath) {
  const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const labels = Object.keys(out.runs);
  const ids = out.sample.map((r) => r.id);
  const get = (label, id) => out.runs[label].items[id];
  const pad = (s, n) => String(s).padEnd(n);

  console.log('\nRun health');
  for (const l of labels) {
    const items = ids.map((id) => get(l, id)).filter(Boolean);
    const failed = items.filter((i) => i.failed).length;
    const avgMs = Math.round(items.reduce((a, i) => a + i.ms, 0) / Math.max(1, items.length));
    console.log(`  ${pad(l, 16)} done ${items.length}/${ids.length}  failed ${failed}  avg ${avgMs} ms`);
  }

  const compare = (title, refOf) => {
    console.log(`\n${title}  (share of items agreeing; list fields = overlap score)`);
    console.log('  ' + pad('field', 20) + labels.map((l) => pad(l, 16)).join(''));
    for (const [name, fn] of Object.entries(FIELDS)) {
      const cells = labels.map((l) => {
        let sum = 0, n = 0;
        for (const id of ids) {
          const cand = get(l, id), ref = refOf(id);
          if (!cand || cand.failed || !ref) continue;
          sum += fn(cand.result, ref); n++;
        }
        return pad(n ? (sum / n).toFixed(2) : '-', 16);
      });
      console.log('  ' + pad(name, 20) + cells.join(''));
    }
  };
  compare(`Agreement with ${BASELINE} (Gemini today)`, (id) => (get(BASELINE, id) && !get(BASELINE, id).failed ? get(BASELINE, id).result : null));
  compare('Agreement with the stored answer from when the email arrived', (id) => out.sample.find((r) => r.id === id));
}

const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === 'run' && a && b) run(a, b, c).catch((e) => { console.error(e); process.exit(1); });
else if (cmd === 'report' && a) report(a);
else { console.error('usage: run <sample.json> <results.json> [limit] | report <results.json>'); process.exit(1); }
