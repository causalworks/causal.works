'use strict';

// Platform-admin page for the bookkeeper review of the Accounting module (migration 288).
// Item text is static (server/data/accounting-review.json); only the reviewer's responses
// are stored, one JSON object per item in accounting_review_entry.

const fs = require('fs');
const path = require('path');

const CONTENT_PATH = path.join(__dirname, '..', 'data', 'accounting-review.json');
const PAGE_PATH = path.join(__dirname, 'accounting-review.html');

const ITEM_ID_RE = /^(?:[BPIQ]\d{2}|[AL]-\d{10,16})$/;
const FIELDS = new Set([
  'works', 'comments', 'priority', 'decision', 'answer', 'reasoning',
  'area', 'issue', 'example', 'frequency', 'response',
  'date', 'items', 'who', 'build', 'verified'
]);
const MAX_FIELD_LEN = 4000;

function cleanData(body) {
  const out = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  for (const [k, v] of Object.entries(body)) {
    if (!FIELDS.has(k)) return null;
    if (typeof v !== 'string' || v.length > MAX_FIELD_LEN) return null;
    if (v !== '') out[k] = v;
  }
  return out;
}

function registerAccountingReview(app, { pool, requireAdmin }) {
  app.get('/admin/accounting-review', requireAdmin, (req, res) => {
    res.type('html').send(fs.readFileSync(PAGE_PATH, 'utf8'));
  });

  app.get('/admin/api/accounting-review', requireAdmin, async (req, res) => {
    try {
      const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
      const r = await pool.query(
        'SELECT item_id, data, updated_by, updated_at FROM accounting_review_entry ORDER BY item_id');
      return res.json({ content, entries: r.rows });
    } catch (e) {
      console.error('GET /admin/api/accounting-review:', e.message);
      return res.status(500).json({ error: 'Could not load the review' });
    }
  });

  app.put('/admin/api/accounting-review/:itemId', requireAdmin, async (req, res) => {
    const { itemId } = req.params;
    if (!ITEM_ID_RE.test(itemId)) return res.status(400).json({ error: 'Bad item id' });
    const data = cleanData(req.body && req.body.data);
    if (!data) return res.status(400).json({ error: 'Bad data' });
    try {
      const r = await pool.query(
        `INSERT INTO accounting_review_entry (item_id, data, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (item_id) DO UPDATE
           SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING updated_at`,
        [itemId, JSON.stringify(data), req.user.email]);
      return res.json({ ok: true, updated_at: r.rows[0].updated_at });
    } catch (e) {
      console.error('PUT /admin/api/accounting-review:', e.message);
      return res.status(500).json({ error: 'Could not save' });
    }
  });

  app.delete('/admin/api/accounting-review/:itemId', requireAdmin, async (req, res) => {
    const { itemId } = req.params;
    if (!/^[AL]-/.test(itemId) || !ITEM_ID_RE.test(itemId)) {
      return res.status(400).json({ error: 'Only added rows can be deleted' });
    }
    try {
      await pool.query('DELETE FROM accounting_review_entry WHERE item_id = $1', [itemId]);
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /admin/api/accounting-review:', e.message);
      return res.status(500).json({ error: 'Could not delete' });
    }
  });
}

module.exports = { registerAccountingReview };
