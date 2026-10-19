'use strict';

// Dues member CSV import on the reusable preview: rows match existing contacts by email; a match only fills blank phone
// and address and adds a term when that contact has none on the same dates. Nothing is saved until confirmed.

const { parseCsvRecords } = require('./csvParse');
const { classifyImport } = require('./importPreview');
const { addContactRoles } = require('./contactRoles');
const { logAudit } = require('./auditLog');
const M = require('./membership');
const S = require('./membershipStatus');

const MAX_ROWS = 5000;
const COLUMNS = ['display_name', 'first_name', 'last_name', 'kind', 'email', 'phone', 'mailing_address', 'tier', 'starts_on', 'ends_on', 'amount_paid'];

function normalize(raw) {
  const r = {};
  for (const [k, v] of Object.entries(raw || {})) r[String(k).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')] = String(v == null ? '' : v).trim();
  const name = r.display_name || r.name || [r.first_name, r.last_name].filter(Boolean).join(' ');
  return {
    display_name: name, first_name: r.first_name || null, last_name: r.last_name || null,
    kind: /^org/i.test(r.kind || r.type || '') ? 'organization' : 'individual',
    email: (r.email || '').toLowerCase() || null, phone: r.phone || null, mailing_address: r.mailing_address || r.address || null,
    tier: r.tier || r.level || null, starts_on: M.day(r.starts_on || r.start_date || r.start) || null, ends_on: M.day(r.ends_on || r.end_date || r.end) || null,
    amount_paid: r.amount_paid || r.paid || null,
  };
}

async function buildPreview(pool, orgId, csv) {
  let parsed;
  try { parsed = parseCsvRecords(csv); } catch (e) { return { error: 'The file could not be read as CSV: ' + e.message }; }
  if (!parsed.rows.length) return { error: 'The file has no rows.' };
  if (parsed.rows.length > MAX_ROWS) return { error: 'Import up to ' + MAX_ROWS + ' rows at a time.' };
  const rows = parsed.rows.map(normalize);
  const tiers = await M.listTiers(pool, orgId);
  const tierByName = new Map(tiers.map((t) => [t.name.toLowerCase(), t]));
  const contacts = await pool.query(
    `SELECT c.id, c.display_name, c.kind, lower(c.email) AS email, c.additional_emails, c.phone, c.mailing_address FROM org_constituents c WHERE c.org_id = $1 AND c.is_active`, [orgId]);
  const byEmail = new Map();
  for (const c of contacts.rows) {
    if (c.email) byEmail.set(c.email, c);
    for (const e of c.additional_emails || []) if (!byEmail.has(String(e).toLowerCase())) byEmail.set(String(e).toLowerCase(), c);
  }
  const terms = await pool.query(`SELECT constituent_id, starts_on, ends_on FROM org_membership_terms WHERE org_id = $1`, [orgId]);
  const termKeys = new Set(terms.rows.map((t) => t.constituent_id + ':' + S.toDay(t.starts_on) + ':' + S.toDay(t.ends_on)));
  const result = classifyImport(rows, {
    keyOf: (r) => r.email,
    validate: (r) => {
      if (!r.display_name) return 'Name is missing.';
      if (r.email && !/^[^\s@]+@[^\s@]+$/.test(r.email)) return 'The email address does not look right.';
      if (!r.tier || !tierByName.has(r.tier.toLowerCase())) return 'Tier "' + (r.tier || '') + '" does not match a current tier.';
      if (!r.starts_on) return 'Start date is missing or not a date (use YYYY-MM-DD).';
      if (r.ends_on && r.ends_on < r.starts_on) return 'The end date is before the start date.';
      if (r.amount_paid && M.cents({ a: r.amount_paid }, 'a').error) return 'Amount paid is not an amount.';
      return null;
    },
    existingFor: (key) => byEmail.get(key) || null,
    compare: (r, c) => {
      const changes = [];
      if (!c.phone && r.phone) changes.push('phone');
      if (!c.mailing_address && r.mailing_address) changes.push('mailing_address');
      const ends = r.ends_on || S.addDays(S.addMonths(r.starts_on, 12), -1);
      if (!termKeys.has(c.id + ':' + r.starts_on + ':' + ends)) changes.push('term');
      return changes;
    },
  });
  return { ...result, tierByName };
}

function summary(p) {
  const strip = (list) => list.slice(0, 200).map((x) => ({ line: x.line, name: x.row.display_name, email: x.row.email, tier: x.row.tier, starts_on: x.row.starts_on, changes: x.changes, error: x.error, first_line: x.first_line }));
  return { counts: p.counts, new: strip(p.new), changed: strip(p.changed), unchanged: strip(p.unchanged), duplicates: strip(p.duplicates), errors: strip(p.errors) };
}

async function applyImport(pool, { orgId, userId, csv }) {
  const p = await buildPreview(pool, orgId, csv);
  if (p.error) return { httpStatus: 400, body: { error: p.error } };
  if (p.counts.errors) return { httpStatus: 400, body: { error: 'Fix the rows with errors before importing.', ...summary(p) } };
  const client = await pool.connect();
  const done = { contacts_created: 0, contacts_updated: 0, terms_created: 0, payments_created: 0 };
  try {
    await client.query('BEGIN');
    const addTerm = async (contactId, r) => {
      const tier = p.tierByName.get(r.tier.toLowerCase());
      const ends = r.ends_on || S.addDays(S.addMonths(r.starts_on, 12), -1);
      const price = (await M.tierPriceOn(client, tier.id, r.starts_on)) || 0;
      const t = await client.query(
        `INSERT INTO org_membership_terms (org_id, constituent_id, tier_id, starts_on, ends_on, price_cents, source, created_by) VALUES ($1, $2, $3, $4, $5, $6, 'import', $7) RETURNING id`,
        [orgId, contactId, tier.id, r.starts_on, ends, price, userId || null]);
      await addContactRoles(client, orgId, contactId, ['dues_member']);
      done.terms_created++;
      const paid = r.amount_paid ? M.cents({ a: r.amount_paid }, 'a').value : 0;
      if (paid > 0) {
        await client.query(
          `INSERT INTO org_membership_payments (org_id, term_id, constituent_id, kind, method, amount_cents, payment_date, notes, recorded_by_user_id, posting_status)
           VALUES ($1, $2, $3, 'payment', 'other', $4, $5, 'Imported', $6, 'unposted')`, [orgId, t.rows[0].id, contactId, paid, r.starts_on, userId || null]);
        done.payments_created++;
      }
    };
    for (const { row } of p.new) {
      const c = await client.query(
        `INSERT INTO org_constituents (org_id, display_name, first_name, last_name, email, phone, mailing_address, kind) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [orgId, row.display_name, row.kind === 'individual' ? row.first_name : null, row.kind === 'individual' ? row.last_name : null, row.email, row.phone, row.mailing_address, row.kind]);
      done.contacts_created++;
      await addTerm(c.rows[0].id, row);
    }
    for (const { row, existing, changes } of p.changed) {
      if (changes.includes('phone') || changes.includes('mailing_address')) {
        await client.query('UPDATE org_constituents SET phone = COALESCE(phone, $1), mailing_address = COALESCE(mailing_address, $2) WHERE id = $3', [row.phone, row.mailing_address, existing.id]);
        done.contacts_updated++;
      }
      if (changes.includes('term')) await addTerm(existing.id, row);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_membership_terms', recordId: orgId, metadata: { via: 'CSV import', ...done, skipped_unchanged: p.counts.unchanged, skipped_duplicates: p.counts.duplicates } });
  return { httpStatus: 200, body: { ...done, skipped_unchanged: p.counts.unchanged, skipped_duplicates: p.counts.duplicates } };
}

module.exports = { COLUMNS, normalize, buildPreview, summary, applyImport };
