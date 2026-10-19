'use strict';

// Directory, benefits, gated documents and seats. A contact appears in the directory only after opting in, and only
// the fields they chose that the workspace allows; email and phone appear only when chosen. Gated documents and the
// private directory are for dues members whose membership is active, either their own or through a seat.

const path = require('path');
const M = require('./membership');
const S = require('./membershipStatus');

const DIRECTORY_FIELDS = ['name', 'tier', 'kind', 'website', 'mailing_address', 'email', 'phone'];
const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../../uploads'));

// --- Seats ---

async function openSeats(pool, termId, day) {
  const r = await pool.query(
    `SELECT s.*, c.display_name, c.email FROM org_membership_seats s JOIN org_constituents c ON c.id = s.constituent_id
      WHERE s.term_id = $1 AND (s.ends_on IS NULL OR s.ends_on > $2::date) ORDER BY s.starts_on, s.id`, [termId, day || M.today()]);
  return r.rows;
}

// The membership a contact has through a seat on another dues member's current term, if any.
async function seatMembership(pool, orgId, contactId, day) {
  const today = day || M.today();
  const r = await pool.query(
    `SELECT s.id AS seat_id, s.term_id, s.label, t.constituent_id AS holder_id, c.display_name AS holder_name, tr.name AS tier_name, tr.benefits
       FROM org_membership_seats s JOIN org_membership_terms t ON t.id = s.term_id
       JOIN org_constituents c ON c.id = t.constituent_id LEFT JOIN org_membership_tiers tr ON tr.id = t.tier_id
      WHERE s.org_id = $1 AND s.constituent_id = $2 AND s.starts_on <= $3::date AND (s.ends_on IS NULL OR s.ends_on > $3::date)
      ORDER BY s.id DESC`, [orgId, contactId, today]);
  for (const seat of r.rows) {
    const st = (await M.statusByContact(pool, orgId, { contactIds: [seat.holder_id], today })).get(seat.holder_id);
    if (st && st.term && st.term.id === seat.term_id && st.status === 'active') {
      return { holder_name: seat.holder_name, tier_name: seat.tier_name, benefits: seat.benefits || [], ends_on: st.term.ends_on, label: seat.label };
    }
  }
  return null;
}

// 'active' when the contact's own membership is active, or they hold a seat on an active membership.
async function effectiveActive(pool, orgId, contactId) {
  const own = (await M.statusByContact(pool, orgId, { contactIds: [contactId] })).get(contactId);
  if (own && own.status === 'active') return { active: true, own, seat: null };
  const seat = await seatMembership(pool, orgId, contactId);
  return { active: !!seat, own: own || null, seat };
}

// --- Directory ---

async function optinFor(pool, orgId, contactId) {
  const r = await pool.query('SELECT fields, visibility FROM org_membership_directory_optin WHERE org_id = $1 AND constituent_id = $2', [orgId, contactId]);
  return r.rows[0] ? { listed: true, fields: r.rows[0].fields || [], visibility: r.rows[0].visibility } : { listed: false, fields: [], visibility: 'private' };
}

async function saveOptin(pool, orgId, contactId, { listed, fields, visibility }) {
  if (!listed) {
    await pool.query('DELETE FROM org_membership_directory_optin WHERE org_id = $1 AND constituent_id = $2', [orgId, contactId]);
    return { listed: false, fields: [], visibility: 'private' };
  }
  const settings = await M.getSettings(pool, orgId);
  const allowed = new Set(settings.directory_fields || []);
  const chosen = [...new Set((Array.isArray(fields) ? fields : []).map(String))].filter((f) => DIRECTORY_FIELDS.includes(f) && allowed.has(f));
  if (!chosen.includes('name')) chosen.unshift('name');
  const vis = visibility === 'public' ? 'public' : 'private';
  await pool.query(
    `INSERT INTO org_membership_directory_optin (org_id, constituent_id, fields, visibility, updated_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (constituent_id) DO UPDATE SET fields = EXCLUDED.fields, visibility = EXCLUDED.visibility, updated_at = now()`,
    [orgId, contactId, chosen, vis]);
  return { listed: true, fields: chosen, visibility: vis };
}

// Entries for the directory. Public lists only public entries; the private directory adds the private ones.
async function listDirectory(pool, orgId, { includePrivate }) {
  const settings = await M.getSettings(pool, orgId);
  if (!settings.directory_enabled) return null;
  const allowed = new Set(['name', ...(settings.directory_fields || [])]);
  const r = await pool.query(
    `SELECT o.constituent_id, o.fields, o.visibility, c.display_name, c.kind, c.website, c.mailing_address, c.email, c.phone
       FROM org_membership_directory_optin o JOIN org_constituents c ON c.id = o.constituent_id
      WHERE o.org_id = $1 AND c.is_active ${includePrivate ? '' : "AND o.visibility = 'public'"}`, [orgId]);
  if (!r.rows.length) return [];
  const statuses = await M.statusByContact(pool, orgId, { contactIds: r.rows.map((x) => x.constituent_id), settings });
  const out = [];
  for (const row of r.rows) {
    let tier = null;
    const st = statuses.get(row.constituent_id);
    if (st && st.status === 'active') tier = st.term.tier_name;
    else {
      const seat = await seatMembership(pool, orgId, row.constituent_id);
      if (!seat) continue;
      tier = seat.tier_name;
    }
    const show = (f) => (row.fields || []).includes(f) && allowed.has(f);
    const e = { name: row.display_name };
    if (show('tier')) e.tier = tier;
    if (show('kind')) e.kind = row.kind === 'organization' ? 'Organization' : 'Person';
    if (show('website') && row.website) e.website = row.website;
    if (show('mailing_address') && row.mailing_address) e.mailing_address = row.mailing_address;
    if (show('email') && row.email) e.email = row.email;
    if (show('phone') && row.phone) e.phone = row.phone;
    out.push(e);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// --- Gated documents ---

async function gatedDocuments(pool, orgId) {
  const r = await pool.query(
    `SELECT id, title, description, original_filename, mime_type FROM org_documents
      WHERE org_id = $1 AND visibility = 'dues_members' AND is_current AND archived_at IS NULL ORDER BY title`, [orgId]);
  return r.rows;
}

async function gatedDocumentFile(pool, orgId, id) {
  const r = await pool.query(
    `SELECT id, title, original_filename, mime_type, stored_path, local_copy_purged_at FROM org_documents
      WHERE id = $1 AND org_id = $2 AND visibility = 'dues_members' AND is_current AND archived_at IS NULL`, [id, orgId]);
  const doc = r.rows[0];
  if (!doc) return { status: 404, error: 'That document was not found.' };
  if (doc.local_copy_purged_at) return { status: 409, error: 'This document is kept in the workspace\'s archive. Ask the workspace for a copy.' };
  const resolved = path.resolve(UPLOADS_ROOT, doc.stored_path);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) return { status: 400, error: 'That document cannot be opened.' };
  return { doc, file: resolved };
}

module.exports = {
  DIRECTORY_FIELDS, openSeats, seatMembership, effectiveActive, optinFor, saveOptin, listDirectory, gatedDocuments, gatedDocumentFile,
};
