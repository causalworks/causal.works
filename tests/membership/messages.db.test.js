'use strict';

// Membership email against a throwaway database: the daily run sends each scheduled message once and logs it first,
// honours unsubscribe (except payment notices), records status changes, clears unconfirmed join requests; templates
// are edited, previewed and reset; bulk email reaches a segment once; delivery reports update the log.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');
const S = require('../../server/organizational/lib/membershipStatus');
const M = require('../../server/organizational/lib/membership');
const Msg = require('../../server/organizational/lib/membershipMessages');
const { runMembershipDailyJob } = require('../../server/jobs/membership-daily-job');

const opts = { skip: h.SKIP };
const B = '/api/organizational/orgs/:slug/membership';
const TODAY = M.today();

async function setup(pool, asApp) {
  const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Housing Cooperative', 'msg-memb-' || floor(random() * 1e9)::text) RETURNING id, slug, display_name`);
  await pool.query('INSERT INTO org_settings (org_id, fiscal_year_end_month, membership_enabled, reply_to_email) VALUES ($1, 12, true, $2)', [org.id, 'office@example.test']);
  const users = {};
  for (const role of ['admin', 'fundraising', 'board']) {
    const u = await h.one(pool, `INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id`, [role + '-' + Math.floor(Math.random() * 1e9) + '@example.test']);
    await pool.query(`INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, $3::org_member_role)`, [org.id, u.id, role]);
    users[role] = u.id;
  }
  await asApp(org.id);
  const staff = h.loadRoutes('routes/membership.js', 'registerMembershipRoutes', pool);
  const as = (role, extra) => ({ user: users[role], role, orgId: org.id, ...(extra || {}), params: { slug: org.slug, ...((extra && extra.params) || {}) } });
  const call = async (method, path, role, extra, expect) => {
    const res = await staff.call(method, B + path, as(role, extra));
    if (expect) assert.equal(res.statusCode, expect, method + ' ' + path + ' ' + JSON.stringify(res.body));
    return res;
  };
  const tier = (await call('POST', '/tiers', 'admin', { body: { name: 'Free', price: '0' } }, 201)).body.tier;
  const add = async (name, email, startsOn) => (await call('POST', '/dues-members', 'fundraising', { body: { tier_id: tier.id, starts_on: startsOn, contact: { display_name: name, email } } }, 201)).body;
  const sent = [];
  const send = async (m) => { sent.push(m); return { ok: true, messageId: 'pm-' + sent.length }; };
  const ws = { id: org.id, slug: org.slug, display_name: org.display_name };
  return { org, ws, users, call, tier, add, sent, send };
}

// A term that started this many days ago ends in 365 - days - 1 days (rolling year).
const startedAgo = (days) => S.addDays(TODAY, -days);

test('daily run: each due message is logged first and sent once; a rerun sends nothing', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const due = await s.add('Due soon', 'due@example.test', S.addDays(S.addMonths(TODAY, -12), 31));
    await s.add('Not due', 'later@example.test', startedAgo(100));
    await pool.query(`UPDATE org_membership_terms SET created_at = now() - interval '200 days' WHERE org_id = $1`, [s.org.id]);
    const out = await Msg.runDailyForWorkspace(pool, s.ws, { send: s.send });
    assert.equal(out.sent, 1, JSON.stringify(out));
    assert.equal(s.sent[0].to, 'due@example.test');
    assert.match(s.sent[0].subject, /^Renew your Housing Cooperative membership/);
    assert.match(s.sent[0].text, /\/p\/[^/]+\/account/);
    assert.match(s.sent[0].text, /\/unsubscribe#t=/);
    assert.equal(s.sent[0].replyTo, 'office@example.test');
    const again = await Msg.runDailyForWorkspace(pool, s.ws, { send: s.send });
    assert.equal(again.sent, 0);
    assert.equal(s.sent.length, 1);
    const log = await pool.query(`SELECT template_key, status, provider_message_id, subject FROM org_membership_messages WHERE constituent_id = $1`, [due.constituent_id]);
    assert.deepEqual(log.rows.map((r) => [r.template_key, r.status, r.provider_message_id]), [['renewal_30', 'sent', 'pm-1']]);
  });
});

test('welcome goes to a new dues member; unsubscribed contacts get no reminders but still get payment notices; no email is skipped', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    await s.add('New joiner', 'new@example.test');
    const quiet = await s.add('Quiet one', 'quiet@example.test', S.addDays(S.addMonths(TODAY, -12), 31));
    const noMail = await s.add('No email', null, S.addDays(S.addMonths(TODAY, -12), 31));
    await pool.query(`UPDATE org_membership_terms SET created_at = now() - interval '200 days' WHERE constituent_id = ANY($1::int[])`, [[quiet.constituent_id, noMail.constituent_id]]);
    await pool.query(`INSERT INTO org_contact_email_prefs (org_id, constituent_id, scope) VALUES ($1, $2, 'membership')`, [s.org.id, quiet.constituent_id]);
    await pool.query(`UPDATE org_membership_terms SET payment_failed_at = now() WHERE id = $1`, [quiet.term_id]);
    const out = await Msg.runDailyForWorkspace(pool, s.ws, { send: s.send });
    assert.deepEqual(s.sent.map((m) => [m.to, m.subject.split(' ')[0]]).sort(), [['new@example.test', 'Welcome'], ['quiet@example.test', 'Your']]);
    assert.doesNotMatch(s.sent.find((m) => m.to === 'quiet@example.test').text, /unsubscribe/);
    assert.equal(out.skipped, 2);
    const skipped = await pool.query(`SELECT c.display_name, m.template_key FROM org_membership_messages m JOIN org_constituents c ON c.id = m.constituent_id WHERE m.status = 'skipped' AND m.org_id = $1 ORDER BY 1`, [s.org.id]);
    assert.deepEqual(skipped.rows.map((r) => [r.display_name, r.template_key]), [['No email', 'renewal_30'], ['Quiet one', 'renewal_30']]);
  });
});

test('status changes go into the history once; join requests never confirmed are cleared after three days', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const j = await s.add('History holder', 'hist@example.test');
    await pool.query(`INSERT INTO org_membership_join_requests (org_id, email, details, tier_id, created_at) VALUES ($1, 'old@example.test', '{"display_name":"Old"}', $2, now() - interval '5 days')`, [s.org.id, s.tier.id]);
    const first = await Msg.runDailyForWorkspace(pool, s.ws, { send: s.send });
    assert.equal(first.status_changes, 1);
    assert.equal(first.join_requests_cleared, 1);
    assert.equal((await Msg.runDailyForWorkspace(pool, s.ws, { send: s.send })).status_changes, 0);
    await s.call('POST', '/terms/:id/end', 'fundraising', { params: { id: String(j.term_id) }, body: { reason: 'Moved away' } }, 200);
    assert.equal((await Msg.runDailyForWorkspace(pool, s.ws, { send: s.send })).status_changes, 1);
    const hist = await pool.query(`SELECT old_value, new_value FROM org_audit_log WHERE org_id = $1 AND table_name = 'org_membership_status' ORDER BY id`, [s.org.id]);
    assert.deepEqual(hist.rows.map((r) => [r.old_value, r.new_value]), [[null, 'active'], ['active', 'ended']]);
    const rq = await h.one(pool, `SELECT status, details FROM org_membership_join_requests WHERE org_id = $1`, [s.org.id]);
    assert.deepEqual([rq.status, rq.details], ['declined', {}]);
  });
});

test('templates: edits change the next send and its timing, preview fills merge fields, reset restores the default', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const j = await s.add('Template holder', 'tpl@example.test', S.addDays(S.addMonths(TODAY, -12), 45));
    await pool.query(`UPDATE org_membership_terms SET created_at = now() - interval '200 days' WHERE org_id = $1`, [s.org.id]);
    assert.equal((await s.call('PUT', '/templates/:key', 'fundraising', { params: { key: 'renewal_30' }, body: { subject: 'x', body: 'y', offset_days: 400 } })).statusCode, 400);
    assert.equal((await s.call('PUT', '/templates/:key', 'fundraising', { params: { key: 'failed_payment_0' }, body: { subject: 'x', body: 'y', offset_days: -2 } })).statusCode, 400);
    assert.equal((await s.call('PUT', '/templates/:key', 'board', { params: { key: 'renewal_30' }, body: { subject: 'x', body: 'y' } })).statusCode, 403);
    await s.call('PUT', '/templates/:key', 'fundraising', { params: { key: 'renewal_30' }, body: { subject: 'Time to renew, {{first_name}}', body: 'Your {{tier}} membership ends {{ends_on}}.', offset_days: -45 } }, 200);
    const pv = await s.call('POST', '/templates/preview', 'fundraising', { body: { subject: 'Hi {{name}}', body: 'Ends {{ends_on}} for {{workspace}}', constituent_id: j.constituent_id } }, 200);
    assert.equal(pv.body.subject, 'Hi Template holder');
    assert.match(pv.body.body, /^Ends \d{4}-\d{2}-\d{2} for Housing Cooperative$/);
    await Msg.runDailyForWorkspace(pool, s.ws, { send: s.send });
    assert.deepEqual(s.sent.map((m) => m.subject), ['Time to renew, Template holder']);
    const reset = await s.call('POST', '/templates/:key/reset', 'fundraising', { params: { key: 'renewal_30' } }, 200);
    const t = reset.body.templates.find((x) => x.key === 'renewal_30');
    assert.deepEqual([t.offset_days, t.edited], [-30, false]);
    const log = await s.call('GET', '/messages', 'fundraising', { query: { constituent_id: String(j.constituent_id) } }, 200);
    assert.deepEqual(log.body.messages.map((m) => [m.template_key, m.status, m.subject]), [['renewal_30', 'sent', 'Time to renew, Template holder']]);
  });
});

test('bulk email reaches the chosen segment once per key and honours unsubscribe; board members cannot send it', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const a = await s.add('North holder', 'north@example.test');
    const b = await s.add('South holder', 'south@example.test');
    await s.add('Lapsed holder', 'lapsed@example.test', startedAgo(500));
    await pool.query(`UPDATE org_constituents SET mailing_address = '1 Main St, Northtown' WHERE id = $1`, [a.constituent_id]);
    await pool.query(`UPDATE org_constituents SET mailing_address = '2 High St, Southville' WHERE id = $1`, [b.constituent_id]);
    const mailer = require('../../server/organizational/lib/sendPlainEmail');
    const keep = mailer.sendPlainEmail;
    mailer.sendPlainEmail = s.send;
    try {
      const pv = await s.call('POST', '/bulk-email/preview', 'fundraising', { body: { filters: { status: 'active' } } }, 200);
      assert.equal(pv.body.total, 2);
      assert.equal((await s.call('POST', '/bulk-email', 'board', { body: { subject: 'x', body: 'y', key: 'abcdef1' } })).statusCode, 403);
      const one = await s.call('POST', '/bulk-email', 'fundraising', { body: { filters: { status: 'active', location: 'northtown' }, subject: 'Annual meeting, {{first_name}}', body: 'See you there.', key: 'meeting01' } }, 200);
      assert.equal(one.body.sent, 1);
      assert.deepEqual(s.sent.map((m) => [m.to, m.subject]), [['north@example.test', 'Annual meeting, North holder']]);
      assert.match(s.sent[0].text, /unsubscribe#t=/);
      await pool.query(`INSERT INTO org_contact_email_prefs (org_id, constituent_id, scope) VALUES ($1, $2, 'all')`, [s.org.id, b.constituent_id]);
      const all = await s.call('POST', '/bulk-email', 'fundraising', { body: { filters: { status: 'active' }, subject: 'Annual meeting', body: 'See you there.', key: 'meeting01' } }, 200);
      assert.deepEqual([all.body.sent, all.body.already, all.body.skipped], [0, 1, 1]);
      assert.equal(s.sent.length, 1);
    } finally {
      mailer.sendPlainEmail = keep;
    }
  });
});

test('unsubscribe link turns off reminders for that one contact; delivery reports need the token', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const j = await s.add('Leaving list', 'leave@example.test', S.addDays(S.addMonths(TODAY, -12), 31));
    await pool.query(`UPDATE org_membership_terms SET created_at = now() - interval '200 days' WHERE org_id = $1`, [s.org.id]);
    await Msg.runDailyForWorkspace(pool, s.ws, { send: s.send });
    const token = s.sent[0].text.match(/unsubscribe#t=([A-Za-z0-9_-]+)/)[1];
    const pub = h.loadRoutes('public/membership.js', 'registerPublicMembershipRoutes', pool);
    const res = await pub.call('POST', '/api/public/:slug/membership/unsubscribe', { params: { slug: s.org.slug }, headers: { 'x-link-token': token }, ip: '10.3.3.3' });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(await Msg.unsubscribed(pool, s.org.id, j.constituent_id));
    const bad = await pub.call('POST', '/api/public/:slug/membership/unsubscribe', { params: { slug: s.org.slug }, headers: { 'x-link-token': 'x'.repeat(43) }, ip: '10.3.3.4' });
    assert.equal(bad.statusCode, 401);

    process.env.POSTMARK_WEBHOOK_TOKEN = 'tok-' + 'q'.repeat(20);
    const email = h.loadRoutes('public/email.js', 'registerEmailWebhookRoutes', pool);
    const noTok = await email.call('POST', '/api/public/email/postmark/webhook', { body: { RecordType: 'Open', MessageID: 'pm-1' } });
    assert.equal(noTok.statusCode, 401);
    const ok = await email.call('POST', '/api/public/email/postmark/webhook', { headers: { 'x-webhook-token': process.env.POSTMARK_WEBHOOK_TOKEN }, body: { RecordType: 'Open', MessageID: 'pm-1', ReceivedAt: '2026-10-19T10:00:00Z' } });
    assert.equal(ok.body.used, true);
    const m = await h.one(pool, `SELECT delivered_at, opened_at FROM org_membership_messages WHERE provider_message_id = 'pm-1'`);
    assert.ok(m.delivered_at && m.opened_at);
    delete process.env.POSTMARK_WEBHOOK_TOKEN;
  });
});

test('the daily job runs every workspace with membership on', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp);
    await s.add('Job holder', 'job@example.test');
    await asOwner();
    const totals = await runMembershipDailyJob(pool, { send: s.send });
    assert.ok(totals.workspaces >= 1);
    assert.ok(s.sent.some((m) => m.to === 'job@example.test' && /^Welcome/.test(m.subject)));
  });
});
