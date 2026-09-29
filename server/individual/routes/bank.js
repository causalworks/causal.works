'use strict';

const { requireAuth } = require('../../auth');
const { removeBankSegmentFromCsv, extractUsStateFromAddress } = require('../utils');
const { BANK_FLAG_DATA } = require('../../data/bank-flag-data');
const { BANK_ALTERNATIVES } = require('../../data/bank-alternatives');

function getFlagKeyAndData(institutionName) {
  if (!institutionName) return { flag_key: null, flagData: null };
  const lower = String(institutionName).toLowerCase();
  for (const [key, data] of Object.entries(BANK_FLAG_DATA)) {
    if (lower.includes(key)) return { flag_key: key, flagData: data };
  }
  return { flag_key: null, flagData: null };
}

function getFlagData(institutionName) {
  return getFlagKeyAndData(institutionName).flagData;
}

function isValidBankPledgeInstitutionKey(key) {
  const k = String(key || '').trim().toLowerCase();
  return k && Object.prototype.hasOwnProperty.call(BANK_FLAG_DATA, k);
}

// Parses a YYYY-MM-DD date string, rejecting invalid or past dates. Returns { ok, value } —
// value is null when no date was supplied (clearing/omitting is allowed), string when valid.
function parseConditionDeadline(raw) {
  if (raw == null || raw === '') return { ok: true, value: null };
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, value: null };
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return { ok: false, value: null };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (d.getTime() < today.getTime()) return { ok: false, value: null };
  return { ok: true, value: s };
}

async function bankPledgeStatsPayload(pool, institutionKey, userId) {
  const inst = String(institutionKey || '').trim().toLowerCase();
  const countR = await pool.query(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(pledge_amount), 0)::bigint AS total
     FROM bank_pledges WHERE institution_name = $1`,
    [inst]
  );
  const row = countR.rows[0] || { c: 0, total: '0' };
  const pledger_count = Number(row.c) || 0;
  const total_sum = Number(row.total) || 0;
  const threshold_met = pledger_count >= 50;
  const total_pledged = threshold_met ? total_sum : null;
  const mine = await pool.query(
    `SELECT status, condition_deadline, condition_note FROM bank_pledges WHERE user_id = $1 AND institution_name = $2 LIMIT 1`,
    [userId, inst]
  );
  const user_has_pledge = mine.rowCount > 0;
  const user_pledge_status = user_has_pledge ? String(mine.rows[0].status || 'pledged') : null;
  const user_condition_deadline = user_has_pledge ? mine.rows[0].condition_deadline : null;
  const user_condition_note = user_has_pledge ? mine.rows[0].condition_note : null;

  const pressureGlobal = await pool.query(
    `SELECT action_type, COUNT(*)::int AS c FROM bank_pressure_actions WHERE institution_name = $1 GROUP BY action_type`,
    [inst]
  );
  const pressure_action_counts = { c4cj: 0, bankgreen: 0, third_act: 0 };
  for (const pr of pressureGlobal.rows) {
    const t = String(pr.action_type || '');
    if (Object.prototype.hasOwnProperty.call(pressure_action_counts, t)) {
      pressure_action_counts[t] = Number(pr.c) || 0;
    }
  }
  const myPressure = await pool.query(
    `SELECT action_type FROM bank_pressure_actions WHERE user_id = $1 AND institution_name = $2`,
    [userId, inst]
  );
  const user_pressure_actions = myPressure.rows.map((r) => String(r.action_type));

  return {
    pledger_count,
    total_pledged,
    threshold_met,
    user_has_pledge,
    user_pledge_status,
    user_condition_deadline,
    user_condition_note,
    user_pressure_actions,
    pressure_action_counts,
  };
}

function isValidFinancialRepKey(key) {
  const k = String(key || '').trim();
  return k.startsWith('fiduciary:') && k.length > 10 && k.length <= 100;
}

async function financialRepPledgeStatsPayload(pool, institutionKey, userId) {
  const countR = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM financial_rep_pledges
     WHERE institution_key = $1 AND status != 'withdrawn'`,
    [institutionKey]
  );
  const committed_count = Number((countR.rows[0] || {}).c) || 0;
  let user_has_pledge = false;
  let user_pledge_status = null;
  let user_commitment_note = null;
  let user_condition_deadline = null;
  let user_condition_note = null;
  if (userId) {
    const mine = await pool.query(
      `SELECT status, commitment_note, condition_deadline, condition_note FROM financial_rep_pledges
       WHERE user_id = $1 AND institution_key = $2 LIMIT 1`,
      [userId, institutionKey]
    );
    if (mine.rowCount > 0) {
      user_has_pledge = true;
      user_pledge_status = String(mine.rows[0].status || 'committed');
      user_commitment_note = mine.rows[0].commitment_note || null;
      user_condition_deadline = mine.rows[0].condition_deadline;
      user_condition_note = mine.rows[0].condition_note;
    }
  }
  return {
    committed_count,
    user_has_pledge,
    user_pledge_status,
    user_commitment_note,
    user_condition_deadline,
    user_condition_note,
  };
}

function registerBankRoutes(app, pool) {

  app.post('/api/bank/check', requireAuth(pool), async (req, res) => {
    try {
      const institutionName = req.body && req.body.institution_name
        ? String(req.body.institution_name).trim()
        : '';
      if (!institutionName) return res.status(400).json({ error: 'institution_name required' });
      const { flag_key: flagKey, flagData } = getFlagKeyAndData(institutionName);
      const normalizedName = (flagData && flagData.display) ? flagData.display : institutionName;
      res.json({
        institution_name: normalizedName,
        flagged: !!flagData,
        flag_data: flagData || null,
        flag_key: flagKey || null,
      });
    } catch (e) {
      console.error('❌ /api/bank/check error:', e.message);
      res.status(500).json({ error: e.message || 'Bank check failed' });
    }
  });

  app.get('/api/bank/pressure', requireAuth(pool), async (req, res) => {
    const bank = String(req.query.bank || '').trim();
    if (!bank) return res.status(400).json({ results: [] });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.json({ results: [] });

    const prompt = `Find 2-3 current (2025-2026) campaigns, shareholder resolutions, or divestment
actions targeting ${bank} specifically for its fossil fuel financing.
Return only real results with working URLs. For each result return: title,
url, source (org name), and one sentence description. Return as JSON array,
no markdown, no preamble.`;

    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(8000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tools: [{ google_search: {} }],
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      if (!r.ok) return res.json({ results: [] });
      const data = await r.json().catch(() => null);
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n').trim() || '';
      if (!text) return res.json({ results: [] });
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return res.json({ results: [] });
      const results = parsed
        .map((item) => ({
          title: String(item?.title || '').trim(),
          url: String(item?.url || '').trim(),
          source: String(item?.source || '').trim(),
          description: String(item?.description || '').trim(),
        }))
        .filter((item) => item.title && item.url && item.source && item.description)
        .slice(0, 3);
      return res.json({ results });
    } catch (_) {
      return res.json({ results: [] });
    }
  });

  app.get('/api/bank/pledge-stats', requireAuth(pool), async (req, res) => {
    try {
      const institution = String(req.query.institution || '').trim().toLowerCase();
      if (!institution) return res.status(400).json({ error: 'institution query required' });
      if (!isValidBankPledgeInstitutionKey(institution)) {
        return res.status(400).json({ error: 'unknown institution key' });
      }
      const userId = req.user.user_id ?? req.user.id;
      const stats = await bankPledgeStatsPayload(pool, institution, userId);
      return res.json(stats);
    } catch (e) {
      console.error('❌ GET /api/bank/pledge-stats:', e.message);
      return res.status(500).json({ error: 'Could not load pledge stats' });
    }
  });

  app.post('/api/bank/pledge', requireAuth(pool), async (req, res) => {
    try {
      const institution_name = String(req.body && req.body.institution_name || '').trim().toLowerCase();
      if (!isValidBankPledgeInstitutionKey(institution_name)) {
        return res.status(400).json({ error: 'invalid institution_name' });
      }
      let pledge_amount = null;
      if (req.body && req.body.pledge_amount != null && req.body.pledge_amount !== '') {
        const n = Number(req.body.pledge_amount);
        if (!Number.isFinite(n) || n < 0 || n > 1e12) {
          return res.status(400).json({ error: 'invalid pledge_amount' });
        }
        pledge_amount = Math.round(n);
      }
      const currency = String(req.body && req.body.currency || 'USD').trim().toUpperCase().slice(0, 3) || 'USD';
      const userId = req.user.user_id ?? req.user.id;
      await pool.query(
        `INSERT INTO bank_pledges (user_id, institution_name, pledge_amount, currency, status, updated_at)
         VALUES ($1, $2, $3, $4, 'pledged', NOW())
         ON CONFLICT (user_id, institution_name)
         DO UPDATE SET pledge_amount = EXCLUDED.pledge_amount,
                       currency = EXCLUDED.currency,
                       status = 'pledged',
                       updated_at = NOW()`,
        [userId, institution_name, pledge_amount, currency]
      );
      const stats = await bankPledgeStatsPayload(pool, institution_name, userId);
      return res.json({
        pledged: true,
        pledger_count: stats.pledger_count,
        total_pledged: stats.total_pledged,
        threshold_met: stats.threshold_met,
        user_pledge_status: stats.user_pledge_status,
        user_pressure_actions: stats.user_pressure_actions,
        pressure_action_counts: stats.pressure_action_counts,
      });
    } catch (e) {
      console.error('❌ POST /api/bank/pledge:', e.message);
      return res.status(500).json({ error: 'Could not save pledge' });
    }
  });

  app.patch('/api/bank/pledge', requireAuth(pool), async (req, res) => {
    try {
      const institution_name = String(req.body && req.body.institution_name || '').trim().toLowerCase();
      if (!isValidBankPledgeInstitutionKey(institution_name)) {
        return res.status(400).json({ error: 'invalid institution_name' });
      }
      const status = String(req.body && req.body.status || '').trim();
      const allowed = ['pledged', 'partial_divest', 'divested'];
      if (!allowed.includes(status)) return res.status(400).json({ error: 'invalid status' });
      const userId = req.user.user_id ?? req.user.id;
      const u = await pool.query(
        `UPDATE bank_pledges SET status = $3, updated_at = NOW()
         WHERE user_id = $1 AND institution_name = $2`,
        [userId, institution_name, status]
      );
      if (u.rowCount === 0) return res.status(404).json({ error: 'no pledge for institution' });
      const stats = await bankPledgeStatsPayload(pool, institution_name, userId);
      return res.json(stats);
    } catch (e) {
      console.error('❌ PATCH /api/bank/pledge:', e.message);
      return res.status(500).json({ error: 'Could not update pledge' });
    }
  });

  app.delete('/api/bank/pledge', requireAuth(pool), async (req, res) => {
    try {
      let institution_name = String(req.body && req.body.institution_name || '').trim().toLowerCase();
      if (!institution_name && req.query && req.query.institution) {
        institution_name = String(req.query.institution).trim().toLowerCase();
      }
      if (!isValidBankPledgeInstitutionKey(institution_name)) {
        return res.status(400).json({ error: 'invalid institution_name' });
      }
      const userId = req.user.user_id ?? req.user.id;
      await pool.query(
        `DELETE FROM bank_pledges WHERE user_id = $1 AND institution_name = $2`,
        [userId, institution_name]
      );
      const stats = await bankPledgeStatsPayload(pool, institution_name, userId);
      return res.json({
        pledged: false,
        pledger_count: stats.pledger_count,
        total_pledged: stats.total_pledged,
        threshold_met: stats.threshold_met,
        user_pledge_status: stats.user_pledge_status,
        user_pressure_actions: stats.user_pressure_actions,
        pressure_action_counts: stats.pressure_action_counts,
      });
    } catch (e) {
      console.error('❌ DELETE /api/bank/pledge:', e.message);
      return res.status(500).json({ error: 'Could not remove pledge' });
    }
  });

  app.get('/api/financial-rep/pledge-stats', async (req, res) => {
    try {
      const institution_key = String(req.query.institution_key || '').trim();
      if (!isValidFinancialRepKey(institution_key)) {
        return res.status(400).json({ error: 'institution_key required (must start with fiduciary:)' });
      }
      const userId = req.user ? (req.user.user_id ?? req.user.id) : null;
      const stats = await financialRepPledgeStatsPayload(pool, institution_key, userId);
      return res.json(stats);
    } catch (e) {
      console.error('❌ GET /api/financial-rep/pledge-stats:', e.message);
      return res.status(500).json({ error: 'Could not load pledge stats' });
    }
  });

  app.post('/api/financial-rep/pledge', requireAuth(pool), async (req, res) => {
    try {
      const institution_key = String(req.body && req.body.institution_key || '').trim();
      if (!isValidFinancialRepKey(institution_key)) {
        return res.status(400).json({ error: 'invalid institution_key' });
      }
      const commitment_note = req.body && req.body.commitment_note
        ? String(req.body.commitment_note).trim().slice(0, 500) || null
        : null;
      const userId = req.user.user_id ?? req.user.id;
      await pool.query(
        `INSERT INTO financial_rep_pledges (user_id, institution_key, commitment_note, status, updated_at)
         VALUES ($1, $2, $3, 'committed', NOW())
         ON CONFLICT (user_id, institution_key)
         DO UPDATE SET commitment_note = EXCLUDED.commitment_note,
                       status = 'committed',
                       updated_at = NOW()`,
        [userId, institution_key, commitment_note]
      );
      const stats = await financialRepPledgeStatsPayload(pool, institution_key, userId);
      return res.json({ pledged: true, ...stats });
    } catch (e) {
      console.error('❌ POST /api/financial-rep/pledge:', e.message);
      return res.status(500).json({ error: 'Could not save pledge' });
    }
  });

  app.patch('/api/financial-rep/pledge', requireAuth(pool), async (req, res) => {
    try {
      const institution_key = String(req.body && req.body.institution_key || '').trim();
      if (!isValidFinancialRepKey(institution_key)) {
        return res.status(400).json({ error: 'invalid institution_key' });
      }
      const status = String(req.body && req.body.status || '').trim();
      if (!['committed', 'acted', 'withdrawn'].includes(status)) {
        return res.status(400).json({ error: 'invalid status' });
      }
      const userId = req.user.user_id ?? req.user.id;
      const u = await pool.query(
        `UPDATE financial_rep_pledges SET status = $3, updated_at = NOW()
         WHERE user_id = $1 AND institution_key = $2`,
        [userId, institution_key, status]
      );
      if (u.rowCount === 0) return res.status(404).json({ error: 'no pledge for institution' });
      const stats = await financialRepPledgeStatsPayload(pool, institution_key, userId);
      return res.json(stats);
    } catch (e) {
      console.error('❌ PATCH /api/financial-rep/pledge:', e.message);
      return res.status(500).json({ error: 'Could not update pledge' });
    }
  });

  app.delete('/api/financial-rep/pledge', requireAuth(pool), async (req, res) => {
    try {
      const institution_key = String(
        (req.body && req.body.institution_key) || req.query.institution_key || ''
      ).trim();
      if (!isValidFinancialRepKey(institution_key)) {
        return res.status(400).json({ error: 'invalid institution_key' });
      }
      const userId = req.user.user_id ?? req.user.id;
      await pool.query(
        `DELETE FROM financial_rep_pledges WHERE user_id = $1 AND institution_key = $2`,
        [userId, institution_key]
      );
      const stats = await financialRepPledgeStatsPayload(pool, institution_key, userId);
      return res.json({ pledged: false, ...stats });
    } catch (e) {
      console.error('❌ DELETE /api/financial-rep/pledge:', e.message);
      return res.status(500).json({ error: 'Could not remove pledge' });
    }
  });

  // "I'll act on [fund] if it hasn't changed by [date]" — sets/extends the dated promise.
  app.post('/api/financial-rep/pledge/condition', requireAuth(pool), async (req, res) => {
    try {
      const institution_key = String(req.body && req.body.institution_key || '').trim();
      if (!isValidFinancialRepKey(institution_key)) {
        return res.status(400).json({ error: 'invalid institution_key' });
      }
      const parsed = parseConditionDeadline(req.body && req.body.condition_deadline);
      if (!parsed.ok || !parsed.value) {
        return res.status(400).json({ error: 'condition_deadline must be a valid, present-or-future date' });
      }
      const condition_note = req.body && req.body.condition_note
        ? String(req.body.condition_note).trim().slice(0, 500) || null
        : null;
      const userId = req.user.user_id ?? req.user.id;
      await pool.query(
        `INSERT INTO financial_rep_pledges (user_id, institution_key, status, condition_deadline, condition_note, updated_at)
         VALUES ($1, $2, 'committed', $3, $4, NOW())
         ON CONFLICT (user_id, institution_key)
         DO UPDATE SET condition_deadline = EXCLUDED.condition_deadline,
                       condition_note = EXCLUDED.condition_note,
                       updated_at = NOW()`,
        [userId, institution_key, parsed.value, condition_note]
      );
      const stats = await financialRepPledgeStatsPayload(pool, institution_key, userId);
      return res.json(stats);
    } catch (e) {
      console.error('❌ POST /api/financial-rep/pledge/condition:', e.message);
      return res.status(500).json({ error: 'Could not save promise' });
    }
  });

  // "I'll move my money if [bank] hasn't changed by [date]" — sets/extends the dated promise.
  // Upserts the pledge row without touching `status` on conflict, so extending a promise never
  // silently downgrades an existing pledged/divested state.
  app.post('/api/bank/pledge/condition', requireAuth(pool), async (req, res) => {
    try {
      const institution_name = String(req.body && req.body.institution_name || '').trim().toLowerCase();
      if (!isValidBankPledgeInstitutionKey(institution_name)) {
        return res.status(400).json({ error: 'invalid institution_name' });
      }
      const parsed = parseConditionDeadline(req.body && req.body.condition_deadline);
      if (!parsed.ok || !parsed.value) {
        return res.status(400).json({ error: 'condition_deadline must be a valid, present-or-future date' });
      }
      const condition_note = req.body && req.body.condition_note
        ? String(req.body.condition_note).trim().slice(0, 500) || null
        : null;
      const userId = req.user.user_id ?? req.user.id;
      await pool.query(
        `INSERT INTO bank_pledges (user_id, institution_name, status, condition_deadline, condition_note, updated_at)
         VALUES ($1, $2, 'pledged', $3, $4, NOW())
         ON CONFLICT (user_id, institution_name)
         DO UPDATE SET condition_deadline = EXCLUDED.condition_deadline,
                       condition_note = EXCLUDED.condition_note,
                       updated_at = NOW()`,
        [userId, institution_name, parsed.value, condition_note]
      );
      const stats = await bankPledgeStatsPayload(pool, institution_name, userId);
      return res.json(stats);
    } catch (e) {
      console.error('❌ POST /api/bank/pledge/condition:', e.message);
      return res.status(500).json({ error: 'Could not save promise' });
    }
  });

  app.post('/api/bank/pressure-action', requireAuth(pool), async (req, res) => {
    try {
      const institution_name = String(req.body && req.body.institution_name || '').trim().toLowerCase();
      if (!isValidBankPledgeInstitutionKey(institution_name)) {
        return res.status(400).json({ error: 'invalid institution_name' });
      }
      const action_type = String(req.body && req.body.action_type || '').trim();
      if (!['c4cj', 'bankgreen', 'third_act'].includes(action_type)) {
        return res.status(400).json({ error: 'invalid action_type' });
      }
      const userId = req.user.user_id ?? req.user.id;
      await pool.query(
        `INSERT INTO bank_pressure_actions (user_id, institution_name, action_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, institution_name, action_type) DO NOTHING`,
        [userId, institution_name, action_type]
      );
      const stats = await bankPledgeStatsPayload(pool, institution_name, userId);
      return res.json({ ok: true, pressure_action_counts: stats.pressure_action_counts, user_pressure_actions: stats.user_pressure_actions });
    } catch (e) {
      console.error('❌ POST /api/bank/pressure-action:', e.message);
      return res.status(500).json({ error: 'Could not record pressure action' });
    }
  });

  app.delete('/api/bank/bank', requireAuth(pool), async (req, res) => {
    try {
      let segment = String(req.body && req.body.institution_display || '').trim();
      if (!segment && req.query && req.query.institution_display) {
        segment = String(req.query.institution_display).trim();
      }
      if (!segment) return res.status(400).json({ error: 'institution_display required' });
      const userId = req.user.user_id ?? req.user.id;
      const cur = await pool.query('SELECT bank FROM users WHERE id = $1', [userId]);
      const next = removeBankSegmentFromCsv(cur.rows[0]?.bank, segment);
      await pool.query('UPDATE users SET bank = $1 WHERE id = $2', [next, userId]);
      const { flag_key: flagKey } = getFlagKeyAndData(segment);
      if (flagKey) {
        await pool.query('DELETE FROM bank_pledges WHERE user_id = $1 AND institution_name = $2', [userId, flagKey]);
        await pool.query('DELETE FROM bank_pressure_actions WHERE user_id = $1 AND institution_name = $2', [userId, flagKey]);
      }
      return res.json({ ok: true, bank: next || '' });
    } catch (e) {
      console.error('❌ DELETE /api/bank/bank:', e.message);
      return res.status(500).json({ error: 'Could not update banks' });
    }
  });

  app.get('/api/bank/alternatives-suggestions', requireAuth(pool), async (req, res) => {
    try {
      const cc = String(req.user.location_country || '').trim().toUpperCase();
      const region = String(req.query.region || (cc === 'US' ? 'US' : cc)).trim().toUpperCase();

      if (region !== 'US') {
        return res.json({
          banks: [],
          links: [
            { label: 'Bank for Good (EU)', url: 'https://bankforgoodeu.com/' },
            { label: 'Bank.Green', url: 'https://bank.green' },
          ],
        });
      }

      const zip = String(req.user.location_zip || '').trim();
      const state = extractUsStateFromAddress(zip);

      // fossilFreeAlliance membership (see bank-alternatives.js) is a real,
      // independently-vetted signal — https://bank.green/certification/ —
      // so those entries show to everyone regardless of location; they're the
      // flagship recommendations and it's wrong to hide them just because we don't
      // know the user's state (2026-08 fix — that had been silently hiding
      // Amalgamated Bank, Climate First Bank, etc. for any user without a ZIP on
      // file). Everything else only shows once its real, verified state list
      // matches the user's ZIP — this matters most for credit unions, which have
      // genuine membership-eligibility restrictions tied to geography.
      const matched = BANK_ALTERNATIVES.filter((b) => {
        if (b.country !== 'US') return false;
        if (b.fossilFreeAlliance) return true;
        if (!state) return false;
        return b.states.includes(state);
      }).sort((a, b) => {
        if (a.fossilFreeAlliance !== b.fossilFreeAlliance) return a.fossilFreeAlliance ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const banks = matched.slice(0, 8).map((b) => ({
        name: b.name,
        type: b.type || 'bank',
        website: b.website,
        fossilFreeAlliance: !!b.fossilFreeAlliance,
        stateSpecific: state ? b.states.includes(state) : false,
      }));

      const bfg = state
        ? `https://bankforgood.org/search/?institution_type=bank&state=${encodeURIComponent(state.toLowerCase())}&location_preference=none&address=&designation%5B%5D=92#results`
        : 'https://bankforgood.org/search/?institution_type=bank&location_preference=none&address=&designation%5B%5D=92#results';

      return res.json({
        banks,
        links: [
          { label: state ? `More banks in ${state} (Bank for Good)` : 'Search values-aligned banks (Bank for Good)', url: bfg },
          { label: 'Bank.Green directory', url: 'https://bank.green/banks/' },
        ],
      });
    } catch (e) {
      console.error('❌ GET /api/bank/alternatives-suggestions:', e.message);
      return res.status(500).json({ error: 'Could not load alternatives' });
    }
  });

  // Dated conditional pledges (bank + financial-rep) with a deadline set — feeds the Moves
  // feed's Move money "your promise comes due" reminder cards. Client filters by proximity.
  app.get('/api/user/pledge-reminders', requireAuth(pool), async (req, res) => {
    try {
      const userId = req.user.user_id ?? req.user.id;
      const [bankRows, finRows] = await Promise.all([
        pool.query(
          `SELECT institution_name, status, condition_deadline, condition_note
           FROM bank_pledges
           WHERE user_id = $1 AND condition_deadline IS NOT NULL AND status != 'divested'`,
          [userId]
        ),
        pool.query(
          `SELECT institution_key, status, condition_deadline, condition_note
           FROM financial_rep_pledges
           WHERE user_id = $1 AND condition_deadline IS NOT NULL AND status != 'withdrawn'`,
          [userId]
        ),
      ]);
      const reminders = [];
      bankRows.rows.forEach((r) => {
        const flagData = BANK_FLAG_DATA[r.institution_name] || null;
        reminders.push({
          kind: 'bank',
          institution_key: r.institution_name,
          institution_display: (flagData && flagData.display) || r.institution_name,
          condition_deadline: r.condition_deadline,
          condition_note: r.condition_note,
        });
      });
      finRows.rows.forEach((r) => {
        reminders.push({
          kind: 'financial_rep',
          institution_key: r.institution_key,
          institution_display: r.institution_key.replace(/^fiduciary:/, ''),
          condition_deadline: r.condition_deadline,
          condition_note: r.condition_note,
        });
      });
      return res.json(reminders);
    } catch (e) {
      console.error('❌ GET /api/user/pledge-reminders:', e.message);
      return res.status(500).json({ error: 'Could not load pledge reminders' });
    }
  });

}

module.exports = { registerBankRoutes };
