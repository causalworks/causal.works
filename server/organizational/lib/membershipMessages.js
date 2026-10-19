'use strict';

// Membership email: default templates and the workspace's edits, merge fields, which scheduled messages are due on a
// day (welcome, renewal notices, grace, win-back, failed payment), sending through the message log first so a rerun
// never sends twice, unsubscribe handling, status history, and bulk email to a segment.

const M = require('./membership');
const S = require('./membershipStatus');
const { createLink } = require('./publicLinks');
const { loadOrgDocInfo } = require('./orgLetterhead');
const mailer = require('./sendPlainEmail');
const { logAudit } = require('./auditLog');

const CATCH_UP_DAYS = 7;
const UNSUBSCRIBE = 'email_unsubscribe';
const MERGE_FIELDS = ['name', 'first_name', 'workspace', 'tier', 'starts_on', 'ends_on', 'amount_due', 'renew_link', 'unsubscribe_link'];

// anchor: join (the term was created), end (the term's end date), failed (the failed payment). transactional messages
// ignore the unsubscribe flag.
const DEFAULT_TEMPLATES = [
  { key: 'welcome', anchor: 'join', offset_days: 0, transactional: false,
    subject: 'Welcome to {{workspace}}',
    body: 'Hello {{first_name}},\n\nThank you for joining {{workspace}}. Your {{tier}} membership runs from {{starts_on}} to {{ends_on}}.\n\nYou can see your membership and update your details here: {{renew_link}}' },
  { key: 'renewal_60', anchor: 'end', offset_days: -60, transactional: false,
    subject: 'Your {{workspace}} membership ends on {{ends_on}}',
    body: 'Hello {{first_name}},\n\nYour {{tier}} membership ends on {{ends_on}}. You can renew now: {{renew_link}}' },
  { key: 'renewal_30', anchor: 'end', offset_days: -30, transactional: false,
    subject: 'Renew your {{workspace}} membership',
    body: 'Hello {{first_name}},\n\nYour membership ends on {{ends_on}}, in a month. Renew here: {{renew_link}}' },
  { key: 'renewal_0', anchor: 'end', offset_days: 0, transactional: false,
    subject: 'Your {{workspace}} membership ends today',
    body: 'Hello {{first_name}},\n\nYour membership ends today. Renew to keep it going: {{renew_link}}' },
  { key: 'grace_15', anchor: 'end', offset_days: 15, transactional: false,
    subject: 'Your {{workspace}} membership has ended',
    body: 'Hello {{first_name}},\n\nYour membership ended on {{ends_on}}. There is still time to renew without a gap: {{renew_link}}' },
  { key: 'win_back_60', anchor: 'end', offset_days: 60, transactional: false,
    subject: 'We miss you at {{workspace}}',
    body: 'Hello {{first_name}},\n\nYour membership ended on {{ends_on}}. We would be glad to have you back: {{renew_link}}' },
  { key: 'failed_payment_0', anchor: 'failed', offset_days: 0, transactional: true,
    subject: 'Your {{workspace}} membership payment did not go through',
    body: 'Hello {{first_name}},\n\nYour card payment for your membership did not go through. Update your card or pay another way here: {{renew_link}}' },
  { key: 'failed_payment_3', anchor: 'failed', offset_days: 3, transactional: true,
    subject: 'Reminder: your {{workspace}} membership payment',
    body: 'Hello {{first_name}},\n\nWe still could not take your membership payment. Update your card here: {{renew_link}}' },
  { key: 'failed_payment_7', anchor: 'failed', offset_days: 7, transactional: true,
    subject: 'Last reminder: your {{workspace}} membership payment',
    body: 'Hello {{first_name}},\n\nYour membership payment is still outstanding. Update your card or pay another way here: {{renew_link}}' },
];

function defaultOf(key) {
  return DEFAULT_TEMPLATES.find((t) => t.key === key) || null;
}

async function loadTemplates(pool, orgId) {
  const r = await pool.query('SELECT key, subject, body, offset_days, enabled, updated_at FROM org_membership_templates WHERE org_id = $1', [orgId]);
  const saved = new Map(r.rows.map((x) => [x.key, x]));
  return DEFAULT_TEMPLATES.map((d) => {
    const s = saved.get(d.key);
    return s ? { ...d, subject: s.subject, body: s.body, offset_days: Number(s.offset_days), enabled: !!s.enabled, edited: true, updated_at: s.updated_at }
      : { ...d, enabled: true, edited: false };
  });
}

function render(text, fields) {
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (fields[k] != null ? String(fields[k]) : ''));
}

function money(cents) {
  return '$' + (Number(cents || 0) / 100).toFixed(2);
}

function baseUrl() {
  return (process.env.BASE_URL || '').replace(/\/$/, '');
}

// --- Which scheduled messages are due ---

// Pure: for one dues member's terms on `today`, the messages due, as { term, template }.
function dueMessages(terms, today, settings, templates) {
  const day = S.toDay(today);
  const out = [];
  if (!terms || !terms.length) return out;
  const st = S.memberStatus(terms, day, settings);
  const enabled = templates.filter((t) => t.enabled);
  const inWindow = (sendOn) => day >= sendOn && S.dayDiff(day, sendOn) <= CATCH_UP_DAYS;
  const sorted = S.sortTermsNewestFirst(terms);

  for (const tpl of enabled.filter((t) => t.anchor === 'join')) {
    const first = sorted[sorted.length - 1];
    if (first.status_override === 'ended' || first.source === 'import' || !first.created_at) continue;
    if (inWindow(S.addDays(S.toDay(first.created_at), tpl.offset_days))) out.push({ term: first, template: tpl });
  }

  for (const tpl of enabled.filter((t) => t.anchor === 'failed')) {
    for (const t of terms) {
      if (!t.payment_failed_at || t.status_override === 'ended') continue;
      if (inWindow(S.addDays(S.toDay(t.payment_failed_at), tpl.offset_days))) out.push({ term: t, template: tpl });
    }
  }

  if (!st || st.status === 'ended') return out;
  const cur = st.term;
  if (cur.status_override === 'ended' || !S.isSettled(cur, day)) return out;
  const renewed = sorted.some((t) => S.toDay(t.starts_on) > S.toDay(cur.ends_on) && t.status_override !== 'ended' && S.isSettled(t, day));
  if (renewed) return out;
  const autoRenewing = cur.auto_renew && cur.processor_subscription_ref;
  for (const tpl of enabled.filter((t) => t.anchor === 'end')) {
    const winBack = tpl.key.startsWith('win_back');
    if (autoRenewing && !winBack) continue;
    if (!inWindow(S.addDays(S.toDay(cur.ends_on), tpl.offset_days))) continue;
    if (winBack && st.status !== 'lapsed') continue;
    if (!winBack && tpl.offset_days > 0 && st.status !== 'grace') continue;
    if (!winBack && tpl.offset_days <= 0 && st.status !== 'active') continue;
    out.push({ term: cur, template: tpl });
  }
  return out;
}

// --- Sending ---

async function unsubscribed(pool, orgId, contactId) {
  const r = await pool.query(`SELECT 1 FROM org_contact_email_prefs WHERE org_id = $1 AND constituent_id = $2 AND scope IN ('membership', 'all') LIMIT 1`, [orgId, contactId]);
  return r.rows.length > 0;
}

async function fieldsFor(pool, ws, contact, term, opts) {
  const tier = term && term.tier_id ? (await pool.query('SELECT name FROM org_membership_tiers WHERE id = $1', [term.tier_id])).rows[0] : null;
  const owed = term ? Math.max(0, Number(term.price_cents) - Number(term.covered_cents || 0)) : 0;
  let unsub = '';
  if (opts && opts.withUnsubscribe) {
    const link = await createLink(pool, { orgId: ws.id, purpose: UNSUBSCRIBE, constituentId: contact.id, days: 365 });
    unsub = baseUrl() + '/p/' + encodeURIComponent(ws.slug) + '/unsubscribe#t=' + link.token;
  }
  return {
    name: contact.display_name || '', first_name: contact.first_name || contact.display_name || '', workspace: ws.display_name,
    tier: (tier && tier.name) || 'membership', starts_on: term ? S.toDay(term.starts_on) : '', ends_on: term ? S.toDay(term.ends_on) : '',
    amount_due: money(owed), renew_link: baseUrl() + '/p/' + encodeURIComponent(ws.slug) + '/account', unsubscribe_link: unsub,
  };
}

// Writes the log row first (unique on term, key and offset), then sends. Returns 'sent', 'failed', 'skipped' or 'already'.
async function sendLogged(pool, ws, { term, contact, key, offsetDays, subject, body, transactional, userId, send }) {
  const ins = await pool.query(
    `INSERT INTO org_membership_messages (org_id, term_id, constituent_id, template_key, offset_days, to_email, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7) ON CONFLICT (term_id, template_key, offset_days) DO NOTHING RETURNING id`,
    [ws.id, term.id, contact.id, key, offsetDays, contact.email || null, userId || null]);
  if (!ins.rows.length) return 'already';
  const id = ins.rows[0].id;
  const skip = async () => { await pool.query(`UPDATE org_membership_messages SET status = 'skipped' WHERE id = $1`, [id]); return 'skipped'; };
  if (!contact.email) return skip();
  if (!transactional && await unsubscribed(pool, ws.id, contact.id)) return skip();
  const fields = await fieldsFor(pool, ws, contact, term, { withUnsubscribe: !transactional });
  const subj = render(subject, fields);
  let text = render(body, fields);
  if (!transactional) text += '\n\n--\nTo stop these emails from ' + ws.display_name + ': ' + fields.unsubscribe_link;
  const info = await loadOrgDocInfo(pool, ws.id);
  let res;
  try {
    res = await (send || mailer.sendPlainEmail)({ to: contact.email, subject: subj, text: text + '\n\n' + info.displayName, fromName: info.displayName, replyTo: info.replyTo || undefined, trackOpens: true, details: true });
  } catch (e) {
    res = { ok: false };
  }
  const ok = res === true || (res && res.ok);
  await pool.query(`UPDATE org_membership_messages SET status = $1, sent_at = CASE WHEN $1 = 'sent' THEN now() END, provider_message_id = $2, subject = $3 WHERE id = $4`,
    [ok ? 'sent' : 'failed', (res && res.messageId) || null, subj.slice(0, 300), id]);
  return ok ? 'sent' : 'failed';
}

// --- Daily work for one workspace ---

async function logStatusChanges(pool, orgId, statuses) {
  const prev = await pool.query(
    `SELECT DISTINCT ON (record_id) record_id, new_value FROM org_audit_log
      WHERE org_id = $1 AND table_name = 'org_membership_status' ORDER BY record_id, occurred_at DESC, id DESC`, [orgId]);
  const last = new Map(prev.rows.map((r) => [Number(r.record_id), r.new_value]));
  let n = 0;
  for (const [cid, s] of statuses) {
    if (!s.status || last.get(Number(cid)) === s.status) continue;
    await logAudit(pool, { orgId, userId: null, action: 'update', tableName: 'org_membership_status', recordId: cid,
      fields: [{ fieldName: 'status', oldValue: last.get(Number(cid)) || null, newValue: s.status }], metadata: { via: 'daily membership job' } });
    n++;
  }
  return n;
}

async function clearOldJoinRequests(pool, orgId) {
  const r = await pool.query(
    `UPDATE org_membership_join_requests SET status = 'declined', decision_reason = 'Email address not confirmed in time', details = '{}'::jsonb, decided_at = now()
      WHERE org_id = $1 AND status = 'unconfirmed' AND created_at < now() - interval '3 days' RETURNING id`, [orgId]);
  return r.rows.length;
}

async function runDailyForWorkspace(pool, ws, opts) {
  const o = opts || {};
  const today = o.today || M.today();
  const settings = await M.getSettings(pool, ws.id);
  const out = { status_changes: 0, sent: 0, skipped: 0, failed: 0, join_requests_cleared: 0 };
  out.join_requests_cleared = await clearOldJoinRequests(pool, ws.id);
  const statuses = await M.statusByContact(pool, ws.id, { today, settings });
  out.status_changes = await logStatusChanges(pool, ws.id, statuses);
  const templates = await loadTemplates(pool, ws.id);
  const contacts = new Map((await pool.query(
    `SELECT id, display_name, first_name, email FROM org_constituents WHERE org_id = $1 AND id = ANY($2::int[]) AND is_active`,
    [ws.id, [...statuses.keys()]])).rows.map((c) => [c.id, c]));
  for (const [cid, s] of statuses) {
    const contact = contacts.get(cid);
    if (!contact) continue;
    for (const due of dueMessages(s.terms, today, settings, templates)) {
      const r = await sendLogged(pool, ws, {
        term: due.term, contact, key: due.template.key, offsetDays: due.template.offset_days,
        subject: due.template.subject, body: due.template.body, transactional: due.template.transactional, send: o.send,
      });
      if (r === 'sent') out.sent++; else if (r === 'skipped') out.skipped++; else if (r === 'failed') out.failed++;
    }
  }
  return out;
}

// --- Bulk email to a segment ---

async function segment(pool, orgId, filters) {
  const f = filters || {};
  let rows = await M.listDuesMembers(pool, orgId, M.parseListFilters({ status: f.status, tier_id: f.tier_id, tags: f.tags, kind: f.kind }));
  if (f.location) {
    const loc = String(f.location).toLowerCase();
    rows = rows.filter((r) => String(r.mailing_address || '').toLowerCase().includes(loc));
  }
  return rows.filter((r) => r.term);
}

async function bulkSend(pool, ws, { filters, subject, body, key, userId, send }) {
  const rows = await segment(pool, ws.id, filters);
  const out = { sent: 0, skipped: 0, failed: 0, already: 0, total: rows.length };
  const terms = new Map((await M.loadTerms(pool, ws.id, rows.map((r) => r.id))).map((t) => [t.id, t]));
  for (const r of rows) {
    const term = terms.get(r.term.id);
    const res = await sendLogged(pool, ws, { term, contact: r, key: 'bulk_' + key, offsetDays: 0, subject, body, transactional: false, userId, send });
    out[res] = (out[res] || 0) + 1;
  }
  return out;
}

module.exports = {
  CATCH_UP_DAYS, UNSUBSCRIBE, MERGE_FIELDS, DEFAULT_TEMPLATES, defaultOf, loadTemplates, render, dueMessages,
  unsubscribed, fieldsFor, sendLogged, runDailyForWorkspace, segment, bulkSend,
};
