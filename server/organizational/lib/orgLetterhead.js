'use strict';

// Organization details printed on documents (receipts, reports, acknowledgments). One place so every document shows the same details.

function addressLines(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

async function loadOrgDocInfo(pool, orgId) {
  const r = await pool.query(
    `SELECT o.display_name, s.legal_name, s.ein, s.mailing_address, s.phone, s.contact_email,
            s.org_profile_data->>'website' AS website
       FROM coop_members o LEFT JOIN org_settings s ON s.org_id = o.id
      WHERE o.id = $1 LIMIT 1`, [orgId]);
  const row = r.rows[0] || {};
  return {
    name: row.legal_name || row.display_name || 'Organization',
    displayName: row.display_name || 'Organization',
    ein: row.ein || null,
    addressLines: addressLines(row.mailing_address),
    phone: row.phone || null,
    email: row.contact_email || null,
    website: row.website || null,
  };
}

function oneLine(info) {
  const parts = [info.name];
  if (info.ein) parts.push('EIN ' + info.ein);
  if (info.addressLines.length) parts.push(info.addressLines.join(', '));
  if (info.phone) parts.push(info.phone);
  if (info.email) parts.push(info.email);
  return parts.join(' · ');
}

function detailLines(info) {
  return [].concat(info.addressLines, [info.phone, info.email, info.website].filter(Boolean), info.ein ? ['EIN ' + info.ein] : []);
}

module.exports = { loadOrgDocInfo, oneLine, detailLines, addressLines };
