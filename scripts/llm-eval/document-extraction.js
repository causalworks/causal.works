'use strict';

/**
 * Offline evaluation harness: compares document reading (receipts, bills, invoices) between the
 * current Gemini path and Mistral OCR plus a Mistral text model. Renders its own test documents
 * and runs the production extractors unchanged, swapping only the LLM client call in memory.
 *
 *   node scripts/llm-eval/document-extraction.js <workdir>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ quiet: true });

const WORK = path.resolve(process.argv[2] || '.');
fs.mkdirSync(WORK, { recursive: true });

// ---------- synthetic documents ----------
const css = `body{font-family:'DejaVu Sans Mono',monospace;margin:28px;font-size:14px;color:#111}
table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;text-align:left}.r{text-align:right}h1{margin:0 0 6px}`;
const page = (body, w) => `<html><head><style>${css}body{width:${w}px}</style></head><body>${body}</body></html>`;

const DOCS = [
  {
    id: 'receipt_clean', kind: 'receipt', mime: 'image/png', width: 380,
    html: `<h1>HARBOR STREET CAFE</h1>118 Quay Road<br>Date: 09/12/2026 13:41<br><hr>
<table><tr><td>Lunch special x2</td><td class=r>29.00</td></tr><tr><td>Sparkling water x2</td><td class=r>6.50</td></tr><tr><td>Pastry</td><td class=r>6.00</td></tr></table><hr>
<table><tr><td>Subtotal</td><td class=r>41.50</td></tr><tr><td>Tax</td><td class=r>3.32</td></tr><tr><td>Tip</td><td class=r>8.00</td></tr><tr><td><b>TOTAL PAID</b></td><td class=r><b>52.82</b></td></tr></table><br>VISA ****4421`,
    truth: { vendor: 'harbor street', date: '2026-09-12', amount: 5282 },
  },
  {
    id: 'receipt_bad_photo', kind: 'receipt', mime: 'image/jpeg', width: 340, degrade: true,
    html: `<h1>NORTHLINE PARKING</h1>Garage B, Level 3<br>IN 09/03/2026 08:12<br>OUT 09/03/2026 17:50<hr>
<table><tr><td>Daily maximum</td><td class=r>18.00</td></tr><tr><td>Tax incl.</td><td class=r>0.00</td></tr><tr><td><b>AMOUNT</b></td><td class=r><b>$18.00</b></td></tr></table><br>Thank you`,
    truth: { vendor: 'northline', date: '2026-09-03', amount: 1800 },
  },
  {
    id: 'receipt_hotel_folio', kind: 'receipt', mime: 'image/png', width: 560,
    html: `<h1>Lakeside Inn</h1>Guest folio · Arrival 08/25/2026 · Departure 08/27/2026<hr>
<table><tr><th>Date</th><th>Description</th><th class=r>Amount</th></tr>
<tr><td>08/25</td><td>Room 214</td><td class=r>189.00</td></tr><tr><td>08/26</td><td>Room 214</td><td class=r>189.00</td></tr>
<tr><td>08/26</td><td>Restaurant charge</td><td class=r>24.50</td></tr><tr><td>08/27</td><td>Occupancy tax</td><td class=r>34.02</td></tr>
<tr><td></td><td><b>Total charges</b></td><td class=r><b>436.52</b></td></tr><tr><td>08/27</td><td>Payment - Visa</td><td class=r>-436.52</td></tr><tr><td></td><td>Balance</td><td class=r>0.00</td></tr></table>`,
    truth: { vendor: 'lakeside inn', date: '2026-08-27', amount: 43652 },
  },
  {
    id: 'bill_office_supply', kind: 'bill', mime: 'application/pdf', width: 700,
    html: `<h1>MERIDIAN OFFICE SUPPLY LLC</h1>44 Foundry Lane, Dunmore<br><br><b>INVOICE INV-20448</b><br>Invoice date: 2026-09-05 &nbsp; Due date: 2026-10-05 &nbsp; Terms: Net 30<br>Bill to: Example Community Org<hr>
<table><tr><th>Item</th><th class=r>Qty</th><th class=r>Unit</th><th class=r>Amount</th></tr>
<tr><td>Copy paper, case</td><td class=r>12</td><td class=r>34.50</td><td class=r>414.00</td></tr><tr><td>Toner cartridge</td><td class=r>2</td><td class=r>71.20</td><td class=r>142.40</td></tr><tr><td>Binders</td><td class=r>20</td><td class=r>2.80</td><td class=r>56.00</td></tr></table><hr>
<table><tr><td class=r>Subtotal</td><td class=r>612.40</td></tr><tr><td class=r>Sales tax 8%</td><td class=r>49.27</td></tr><tr><td class=r><b>TOTAL DUE</b></td><td class=r><b>661.67</b></td></tr></table>`,
    truth: { vendor: 'meridian office', date: '2026-09-05', due: '2026-10-05', reference: 'INV-20448', amount: 66167 },
  },
  {
    id: 'invoice_retainer', kind: 'invoice', mime: 'application/pdf', width: 700,
    html: `<h1>Example Community Org</h1>Invoice # 2026-0097<br>Date: September 15, 2026<br>Payment due: October 15, 2026<hr>
Bill to: Riverbend Community Fund<br><br>
<table><tr><th>Description</th><th class=r>Amount</th></tr><tr><td>Monthly strategy consulting retainer, September</td><td class=r>4,000.00</td></tr><tr><td>Workshop materials</td><td class=r>250.00</td></tr></table><hr>
<table><tr><td class=r>Total</td><td class=r>4,250.00</td></tr><tr><td class=r>Paid to date</td><td class=r>0.00</td></tr><tr><td class=r><b>Balance due</b></td><td class=r><b>4,250.00</b></td></tr></table>`,
    truth: { vendor: 'riverbend', date: '2026-09-15', due: '2026-10-15', reference: '2026-0097', amount: 425000 },
  },
  {
    id: 'folio_heavy_degrade', kind: 'receipt', mime: 'image/jpeg', width: 560, degrade: 'heavy', reuse: 'receipt_hotel_folio',
    truth: { vendor: 'lakeside inn', date: '2026-08-27', amount: 43652 },
  },
  {
    id: 'bill_heavy_degrade', kind: 'bill', mime: 'image/jpeg', width: 700, degrade: 'heavy', reuse: 'bill_office_supply',
    truth: { vendor: 'meridian office', date: '2026-09-05', due: '2026-10-05', reference: 'INV-20448', amount: 66167 },
  },
  {
    id: 'receipt_handwritten_note', kind: 'receipt', mime: 'image/jpeg', width: 380, degrade: true,
    html: `<h1>QUICK CAB CO</h1>Trip 7731<br>Date: 09/18/2026<hr>
<table><tr><td>Fare</td><td class=r>31.00</td></tr><tr><td>Tip</td><td class=r>6.00</td></tr><tr><td><b>TOTAL</b></td><td class=r><b>37.00</b></td></tr></table><br>
<div style="font-family:'Z003','URW Chancery L',cursive;font-size:26px;color:#1a2a7a;transform:rotate(-4deg);margin-top:18px">site visit to grantee</div>`,
    truth: { vendor: 'quick cab', date: '2026-09-18', amount: 3700, note: 'site visit' },
  },
  {
    id: 'not_a_receipt', kind: 'receipt', mime: 'image/png', width: 560,
    html: `<h1>Dear neighbors</h1>The community garden meeting is moved to Thursday evening. Bring seeds to swap and a chair if you have one. We will talk about the compost bins and the fall planting schedule.<br><br>See you there,<br>Marta`,
    truth: { allNull: true },
  },
];

function render(doc) {
  const base = path.join(WORK, doc.id);
  if (doc.reuse) {
    const src = path.join(WORK, doc.reuse);
    if (fs.existsSync(`${base}.jpg`)) return;
    const input = fs.existsSync(`${src}.png`) ? `${src}.png` : `${src}.pdf[0]`;
    execFileSync('convert', ['-density', '110', input, '-background', 'white', '-flatten', '-trim', '+repage', '-bordercolor', 'white', '-border', '20',
      '-rotate', '-6', '-background', 'gray70', '-blur', '0x2.2', '-attenuate', '1.2', '+noise', 'Gaussian', '-resize', '38%', '-brightness-contrast', '-12x-8', '-quality', '18', `${base}.jpg`]);
    return;
  }
  if (fs.existsSync(`${base}.${doc.mime === 'application/pdf' ? 'pdf' : doc.mime === 'image/jpeg' ? 'jpg' : 'png'}`)) return;
  fs.writeFileSync(`${base}.html`, page(doc.html, doc.width));
  execFileSync('google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${base}.pdf`, `${base}.html`], { stdio: 'ignore' });
  if (doc.mime === 'application/pdf') return;
  execFileSync('pdftoppm', ['-png', '-r', '110', '-singlefile', `${base}.pdf`, base]);
  execFileSync('convert', [`${base}.png`, '-trim', '+repage', '-bordercolor', 'white', '-border', '20', `${base}.png`]);
  if (doc.degrade) {
    execFileSync('convert', [`${base}.png`, '-rotate', '4', '-background', 'gray90', '-blur', '0x1.1', '-attenuate', '0.5', '+noise', 'Gaussian',
      '-resize', '70%', '-quality', '35', `${base}.jpg`]);
  }
}

// ---------- Mistral path: OCR the file, then run the production prompt on the text ----------
const MISTRAL_KEY = () => String(process.env.MISTRAL_API_KEY || '').trim();
async function mistralOcr(buffer, mimeType) {
  const uri = `data:${mimeType};base64,${buffer.toString('base64')}`;
  const document = mimeType === 'application/pdf' ? { type: 'document_url', document_url: uri } : { type: 'image_url', image_url: uri };
  const r = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MISTRAL_KEY()}` },
    body: JSON.stringify({ model: 'mistral-ocr-latest', document }),
  });
  if (!r.ok) throw new Error(`Mistral OCR HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const data = await r.json();
  return (data.pages || []).map((p) => p.markdown).join('\n\n');
}
async function mistralChat(model, prompt) {
  const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MISTRAL_KEY()}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
  });
  if (!r.ok) throw new Error(`Mistral HTTP ${r.status}`);
  return (await r.json()).choices[0].message.content;
}

const PATHS = [
  { label: 'gemini (today)', mistralModel: null },
  { label: 'ocr+mistral-small', mistralModel: 'mistral-small-2603' },
  { label: 'ocr+mistral-large', mistralModel: 'mistral-large-2512' },
];

const ocrCache = new Map();
function patchClient(mistralModel) {
  const client = require('../../server/ai/llmClient');
  if (!client._realGenerate) client._realGenerate = client.generate;
  client.generate = async (task, input, opts) => {
    if (!mistralModel) return client._realGenerate(task, input, opts);
    const filePart = input.find((p) => p.file);
    const key = filePart.file.buffer.toString('base64').slice(0, 64) + filePart.file.buffer.length;
    if (!ocrCache.has(key)) ocrCache.set(key, await mistralOcr(filePart.file.buffer, filePart.file.mimeType));
    const prompt = input.filter((p) => p.text).map((p) => p.text).join('\n\n')
      + `\n\nThe document was converted to text by OCR (tables as markdown). Read it from this text:\n\n${ocrCache.get(key)}`;
    return mistralChat(mistralModel, prompt);
  };
}

// ---------- scoring ----------
const nz = (s) => String(s || '').toLowerCase();
function score(doc, ex) {
  const t = doc.truth;
  if (t.allNull) return { pass: !ex || Object.values(ex).every((v) => v == null), notes: ex ? JSON.stringify(ex) : 'null (correct)' };
  if (!ex) return { pass: false, notes: 'no result' };
  const vendor = ex.vendor ?? ex.counterparty_name;
  const date = ex.expense_date ?? ex.document_date;
  const amount = ex.amount_cents ?? ex.total_amount_cents;
  const checks = {
    vendor: nz(vendor).includes(t.vendor),
    date: date === t.date,
    amount: amount === t.amount,
    ...(t.due ? { due: ex.due_date === t.due } : {}),
    ...(t.reference ? { ref: nz(ex.reference).replace(/\s/g, '') === nz(t.reference) } : {}),
  };
  if (t.note) checks.note = nz(ex.suggested_description).includes(t.note);
  const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  return { pass: !bad.length, notes: bad.length ? `wrong: ${bad.join(',')} (got ${JSON.stringify({ vendor, date, amount, due: ex.due_date, ref: ex.reference, desc: ex.suggested_description })})` : 'all fields correct', checks };
}

async function main() {
  DOCS.forEach(render);
  const { extractReceiptFields } = require('../../server/organizational/lib/receiptOcr');
  const { extractBillOrInvoiceFields } = require('../../server/organizational/lib/billInvoiceOcr');
  const results = {};
  for (const p of PATHS) {
    patchClient(p.mistralModel);
    for (const doc of DOCS) {
      const file = path.join(WORK, `${doc.id}.${doc.mime === 'application/pdf' ? 'pdf' : doc.mime === 'image/jpeg' ? 'jpg' : 'png'}`);
      const buf = fs.readFileSync(file);
      const started = Date.now();
      const out = doc.kind === 'receipt' ? await extractReceiptFields(buf, doc.mime) : await extractBillOrInvoiceFields(buf, doc.mime, doc.kind);
      const s = score(doc, out.extracted);
      (results[doc.id] = results[doc.id] || {})[p.label] = { ...s, ms: Date.now() - started, error: out.error };
    }
  }
  console.log('\n' + 'document'.padEnd(22) + PATHS.map((p) => p.label.padEnd(20)).join(''));
  for (const doc of DOCS) console.log(doc.id.padEnd(22) + PATHS.map((p) => (results[doc.id][p.label].pass ? 'PASS' : 'FAIL').padEnd(20)).join(''));
  console.log('\nDetails');
  for (const doc of DOCS) for (const p of PATHS) {
    const r = results[doc.id][p.label];
    if (!r.pass) console.log(`  ${doc.id} / ${p.label}: ${r.notes}${r.error ? ' | ' + r.error : ''}`);
  }
  console.log('\nAvg ms per document: ' + PATHS.map((p) => `${p.label} ${Math.round(DOCS.reduce((a, d) => a + results[d.id][p.label].ms, 0) / DOCS.length)}`).join(' | '));
}
main().catch((e) => { console.error(e); process.exit(1); });
