'use strict';

// Platform-admin page for the bookkeeper review of the Accounting module (migrations 288, 289).
// Item text is static (server/data/accounting-review.json). Responses are stored one row per
// (item, reviewer) in accounting_review_entry, so two people answer independently and can compare.
// Fields in SHARED_FIELDS belong to the pair of them and live under reviewer = 'shared'.

const fs = require('fs');
const path = require('path');

const CONTENT_PATH = path.join(__dirname, '..', 'data', 'accounting-review.json');
const PAGE_PATH = path.join(__dirname, 'accounting-review.html');

// Only this login can enter decisions, responses and decision-log rows (the shared fields).
const DECIDER_EMAIL = 'loopy@causal.works';
const SHARED = 'shared';
const ITEM_ID_RE = /^(?:[BPIQ]\d{2}|[AL]-\d{10,16})$/;
const MINE_FIELDS = new Set([
  'works', 'priority', 'comments', 'answer', 'reasoning',
  'area', 'issue', 'example', 'frequency'
]);
const SHARED_FIELDS = new Set([
  'decision', 'response', 'date', 'items', 'who', 'why', 'build', 'verified'
]);
const MAX_FIELD_LEN = 4000;

// Returns the fields to merge into the row; an empty string means "clear this field".
function cleanData(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.has(k)) return null;
    if (typeof v !== 'string' || v.length > MAX_FIELD_LEN) return null;
    out[k] = v;
  }
  return out;
}

function registerAccountingReview(app, { pool, requireAdmin }) {
  const me = (req) => String(req.user.email).toLowerCase();
  const canDecide = (req) => me(req) === DECIDER_EMAIL;

  app.get('/admin/accounting-review', requireAdmin, (req, res) => {
    res.type('html').send(fs.readFileSync(PAGE_PATH, 'utf8'));
  });

  app.get('/admin/api/accounting-review', requireAdmin, async (req, res) => {
    try {
      const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
      const r = await pool.query(
        'SELECT item_id, reviewer, data, updated_at FROM accounting_review_entry ORDER BY item_id, reviewer');
      return res.json({ content, me: me(req), can_decide: canDecide(req), entries: r.rows });
    } catch (e) {
      console.error('GET /admin/api/accounting-review:', e.message);
      return res.status(500).json({ error: 'Could not load the review' });
    }
  });

  // body: { scope: 'mine' | 'shared', data: { field: text } }. Only the fields sent are changed,
  // so two people editing different fields of one shared row don't overwrite each other.
  app.put('/admin/api/accounting-review/:itemId', requireAdmin, async (req, res) => {
    const { itemId } = req.params;
    if (!ITEM_ID_RE.test(itemId)) return res.status(400).json({ error: 'Bad item id' });
    const scope = req.body && req.body.scope;
    if (scope !== 'mine' && scope !== 'shared') return res.status(400).json({ error: 'Bad scope' });
    if (scope === 'shared' && !canDecide(req)) return res.status(403).json({ error: 'Only the admin can enter decisions' });
    const data = cleanData(req.body.data, scope === 'mine' ? MINE_FIELDS : SHARED_FIELDS);
    if (!data) return res.status(400).json({ error: 'Bad data' });
    const reviewer = scope === 'mine' ? me(req) : SHARED;
    // Reasoning only goes with an answer: clearing the answer clears it, and it can't be set without one.
    if (scope === 'mine' && /^Q/.test(itemId)) {
      if (data.answer === '') data.reasoning = '';
      if (data.reasoning && data.answer === undefined) {
        const cur = await pool.query(
          'SELECT data->>\'answer\' AS answer FROM accounting_review_entry WHERE item_id = $1 AND reviewer = $2',
          [itemId, reviewer]);
        if (!cur.rows.length || !cur.rows[0].answer) {
          return res.status(400).json({ error: 'Add an answer before the reasoning' });
        }
      }
    }
    const nonEmpty = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ''));
    try {
      const r = await pool.query(
        `INSERT INTO accounting_review_entry (item_id, reviewer, data, updated_by, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, now())
         ON CONFLICT (item_id, reviewer) DO UPDATE
           SET data = (SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
                       FROM jsonb_each(accounting_review_entry.data || $5::jsonb)
                       WHERE value <> '""'::jsonb),
               updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING data, updated_at`,
        [itemId, reviewer, JSON.stringify(nonEmpty), me(req), JSON.stringify(data)]);
      return res.json({ ok: true, data: r.rows[0].data, updated_at: r.rows[0].updated_at });
    } catch (e) {
      console.error('PUT /admin/api/accounting-review:', e.message);
      return res.status(500).json({ error: 'Could not save' });
    }
  });

  // A reviewer can delete a gap they added (their row plus its shared row); anyone can delete
  // a decision-log row. Fixed review items cannot be deleted.
  app.delete('/admin/api/accounting-review/:itemId', requireAdmin, async (req, res) => {
    const { itemId } = req.params;
    if (!ITEM_ID_RE.test(itemId) || !/^[AL]-/.test(itemId)) {
      return res.status(400).json({ error: 'Only added rows can be deleted' });
    }
    try {
      if (itemId.startsWith('L-')) {
        if (!canDecide(req)) return res.status(403).json({ error: 'Only the admin can edit the decision log' });
        await pool.query('DELETE FROM accounting_review_entry WHERE item_id = $1', [itemId]);
      } else {
        const own = await pool.query(
          'SELECT 1 FROM accounting_review_entry WHERE item_id = $1 AND reviewer = $2', [itemId, me(req)]);
        if (!own.rows.length) return res.status(403).json({ error: 'You can only delete your own additions' });
        await pool.query(
          'DELETE FROM accounting_review_entry WHERE item_id = $1 AND reviewer IN ($2, $3)',
          [itemId, me(req), SHARED]);
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /admin/api/accounting-review:', e.message);
      return res.status(500).json({ error: 'Could not delete' });
    }
  });
}

module.exports = { registerAccountingReview };
