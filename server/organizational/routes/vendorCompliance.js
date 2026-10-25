'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole, FINANCE_ROLES } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess } = require('../middleware/requireAccountingAccess');
const { encryptTaxId } = require('../lib/vendorTaxIdCrypto');
const { logAudit, reqMeta } = require('../lib/auditLog');
const { csvCell } = require('../lib/csvCell');

function registerVendorComplianceRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole(['admin', ...FINANCE_ROLES])];

  app.get('/api/organizational/orgs/:slug/constituents/:id/vendor-compliance', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const constituentId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const c = await pool.query(`SELECT id, org_contact_has_role(id, org_id, 'vendor') AS is_vendor FROM org_constituents WHERE id = $1 AND org_id = $2 LIMIT 1`, [constituentId, orgId]);
      if (!c.rows.length) return res.status(404).json({ error: 'Constituent not found' });

      const r = await pool.query(
        `SELECT id, constituent_id, tin_type, tax_entity_type, is_1099_eligible, w9_received, w9_received_at,
                payment_terms, (tax_id_encrypted IS NOT NULL) AS has_tax_id, created_at, updated_at
         FROM org_vendor_compliance WHERE constituent_id = $1 AND org_id = $2 LIMIT 1`,
        [constituentId, orgId]
      );
      return res.json({ vendor_compliance: r.rows[0] || null });
    } catch (e) {
      console.error('GET vendor-compliance:', e.message);
      return res.status(500).json({ error: 'Could not load vendor compliance data' });
    }
  });

  app.put('/api/organizational/orgs/:slug/constituents/:id/vendor-compliance', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};

    const tinType = body.tin_type != null ? String(body.tin_type).trim() : null;
    if (tinType && !['ein', 'ssn'].includes(tinType)) return res.status(400).json({ error: 'tin_type must be ein or ssn' });

    try {
      const c = await pool.query(`SELECT id, org_contact_has_role(id, org_id, 'vendor') AS is_vendor FROM org_constituents WHERE id = $1 AND org_id = $2 LIMIT 1`, [constituentId, orgId]);
      if (!c.rows.length) return res.status(404).json({ error: 'Constituent not found' });
      if (!c.rows[0].is_vendor) return res.status(400).json({ error: 'Contact must have the vendor role before vendor compliance data can be set' });

      const existing = await pool.query(
        'SELECT tax_id_encrypted, tax_id_iv, tax_id_auth_tag, tin_type, tax_entity_type, is_1099_eligible, w9_received, w9_received_at, payment_terms FROM org_vendor_compliance WHERE constituent_id = $1 AND org_id = $2 LIMIT 1',
        [constituentId, orgId]
      );
      const prev = existing.rows[0] || {};

      const w9Received = body.w9_received !== undefined ? Boolean(body.w9_received) : Boolean(prev.w9_received);

      let taxIdEncrypted = prev.tax_id_encrypted || null;
      let taxIdIv = prev.tax_id_iv || null;
      let taxIdAuthTag = prev.tax_id_auth_tag || null;
      if (body.tax_id !== undefined) {
        const rawTaxId = body.tax_id != null ? String(body.tax_id).trim() : '';
        if (rawTaxId) {
          const enc = encryptTaxId(rawTaxId);
          taxIdEncrypted = enc.encrypted;
          taxIdIv = enc.iv;
          taxIdAuthTag = enc.authTag;
        } else {
          taxIdEncrypted = null; taxIdIv = null; taxIdAuthTag = null;
        }
      }

      const r = await pool.query(
        `INSERT INTO org_vendor_compliance
           (org_id, constituent_id, tax_id_encrypted, tax_id_iv, tax_id_auth_tag, tin_type, tax_entity_type, is_1099_eligible, w9_received, w9_received_at, payment_terms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (constituent_id) DO UPDATE SET
           tax_id_encrypted = EXCLUDED.tax_id_encrypted, tax_id_iv = EXCLUDED.tax_id_iv, tax_id_auth_tag = EXCLUDED.tax_id_auth_tag,
           tin_type = EXCLUDED.tin_type, tax_entity_type = EXCLUDED.tax_entity_type, is_1099_eligible = EXCLUDED.is_1099_eligible,
           w9_received = EXCLUDED.w9_received, w9_received_at = EXCLUDED.w9_received_at,
           payment_terms = EXCLUDED.payment_terms, updated_at = NOW()
         RETURNING id, constituent_id, tin_type, tax_entity_type, is_1099_eligible, w9_received, w9_received_at,
                   payment_terms, (tax_id_encrypted IS NOT NULL) AS has_tax_id, created_at, updated_at`,
        [
          orgId, constituentId, taxIdEncrypted, taxIdIv, taxIdAuthTag,
          body.tin_type !== undefined ? tinType : (prev.tin_type || null),
          body.tax_entity_type !== undefined ? (String(body.tax_entity_type || '').trim() || null) : (prev.tax_entity_type || null),
          body.is_1099_eligible !== undefined ? Boolean(body.is_1099_eligible) : Boolean(prev.is_1099_eligible),
          w9Received,
          w9Received ? (body.w9_received_at || prev.w9_received_at || new Date().toISOString()) : null,
          body.payment_terms !== undefined ? (String(body.payment_terms || '').trim() || null) : (prev.payment_terms || null),
        ]
      );
      const fields = [];
      const note = (name, o, n) => { if ((o == null ? '' : String(o)) !== (n == null ? '' : String(n))) fields.push({ fieldName: name, oldValue: o == null || o === '' ? '(none)' : String(o), newValue: n == null || n === '' ? '(none)' : String(n) }); };
      const now = r.rows[0];
      note('Vendor 1099 eligible', existing.rows.length ? Boolean(prev.is_1099_eligible) : null, now.is_1099_eligible);
      note('Vendor W-9 received', existing.rows.length ? Boolean(prev.w9_received) : null, now.w9_received);
      note('Vendor TIN type', prev.tin_type, now.tin_type);
      note('Vendor tax entity type', prev.tax_entity_type, now.tax_entity_type);
      note('Vendor payment terms', prev.payment_terms, now.payment_terms);
      const hadTin = Boolean(prev.tax_id_encrypted);
      if (body.tax_id !== undefined && (hadTin || now.has_tax_id)) {
        if (now.has_tax_id) fields.push({ fieldName: 'Vendor tax ID', oldValue: hadTin ? '(on file)' : '(none)', newValue: '(updated)' });
        else if (hadTin) fields.push({ fieldName: 'Vendor tax ID', oldValue: '(on file)', newValue: '(cleared)' });
      }
      if (fields.length) logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_constituents', recordId: constituentId, fields, metadata: reqMeta(req) }).catch(() => {});
      return res.json({ vendor_compliance: r.rows[0] });
    } catch (e) {
      console.error('PUT vendor-compliance:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not save vendor compliance data' });
    }
  });

  const THRESHOLD_CENTS_BY_YEAR = { 2025: 60000, 2026: 200000 };
  const LAST_KNOWN_THRESHOLD_YEAR = 2026;
  function thresholdCentsForYear(year) {
    if (THRESHOLD_CENTS_BY_YEAR[year] != null) return THRESHOLD_CENTS_BY_YEAR[year];
    if (year > LAST_KNOWN_THRESHOLD_YEAR) {
      console.warn(
        `1099 threshold for ${year} is not yet in THRESHOLD_CENTS_BY_YEAR (inflation-indexed ` +
        `since 2027, next figure not yet published as of this writing) -- falling back to ` +
        `${LAST_KNOWN_THRESHOLD_YEAR}'s $${THRESHOLD_CENTS_BY_YEAR[LAST_KNOWN_THRESHOLD_YEAR] / 100}. ` +
        `Update this table once the IRS publishes ${year}'s indexed amount.`
      );
      return THRESHOLD_CENTS_BY_YEAR[LAST_KNOWN_THRESHOLD_YEAR];
    }
    return 60000;
  }

  async function load1099Settings(orgId) {
    const r = await pool.query('SELECT reports_1099, threshold_1099_cents FROM org_settings WHERE org_id = $1', [orgId]);
    const row = r.rows[0] || {};
    return { reports: row.reports_1099 !== false, overrideCents: row.threshold_1099_cents == null ? null : Number(row.threshold_1099_cents) };
  }
  function effectiveThresholdCents(legalCents, overrideCents) {
    return overrideCents == null ? legalCents : Math.min(legalCents, overrideCents);
  }
  const settingsReadAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool), requireAccountingAccess(pool, 'accounting_read')];
  app.get('/api/organizational/orgs/:slug/settings-1099', ...settingsReadAuth, async (req, res) => {
    try {
      const st = await load1099Settings(req.orgId);
      const year = new Date().getFullYear();
      return res.json({
        reports_1099: st.reports, threshold_override_cents: st.overrideCents,
        legal_thresholds: Object.keys(THRESHOLD_CENTS_BY_YEAR).map((y) => ({ year: Number(y), cents: THRESHOLD_CENTS_BY_YEAR[y] })),
        legal_threshold_cents: thresholdCentsForYear(year), year,
        can_change: ['admin', ...FINANCE_ROLES].includes(req.coopOrgRole),
      });
    } catch (e) {
      console.error('GET settings-1099:', e.message);
      return res.status(500).json({ error: 'Could not load 1099 settings' });
    }
  });
  app.put('/api/organizational/orgs/:slug/settings-1099', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    try {
      const before = await load1099Settings(orgId);
      const reports = body.reports_1099 !== undefined ? body.reports_1099 === true : before.reports;
      let override = before.overrideCents;
      if (body.threshold_override_cents !== undefined) {
        if (body.threshold_override_cents === null || body.threshold_override_cents === '') override = null;
        else {
          const n = Number(body.threshold_override_cents);
          const legal = thresholdCentsForYear(new Date().getFullYear());
          if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'The reporting amount must be a whole number of cents, zero or more.' });
          if (n > legal) return res.status(400).json({ error: 'The reporting amount cannot be higher than the legal amount ($' + (legal / 100).toLocaleString() + '); that would leave payments unreported.' });
          override = n;
        }
      }
      await pool.query('UPDATE org_settings SET reports_1099 = $2, threshold_1099_cents = $3, updated_at = NOW() WHERE org_id = $1', [orgId, reports, override]);
      const fields = [];
      if (reports !== before.reports) fields.push({ fieldName: '1099 reporting', oldValue: before.reports ? 'on' : 'off', newValue: reports ? 'on' : 'off' });
      if (override !== before.overrideCents) fields.push({ fieldName: '1099 reporting amount', oldValue: before.overrideCents == null ? '(legal amount)' : '$' + (before.overrideCents / 100).toFixed(2), newValue: override == null ? '(legal amount)' : '$' + (override / 100).toFixed(2) });
      if (fields.length) logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_settings', recordId: orgId, fields, metadata: reqMeta(req) }).catch(() => {});
      return res.json({ reports_1099: reports, threshold_override_cents: override });
    } catch (e) {
      console.error('PUT settings-1099:', e.message);
      return res.status(500).json({ error: 'Could not save 1099 settings' });
    }
  });

  app.get('/api/organizational/orgs/:slug/vendor-compliance/1099-summary', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const year = Number.parseInt(String(req.query.year || ''), 10);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      return res.status(400).json({ error: 'year is required (e.g. 2026)' });
    }
    const format = String(req.query.format || 'json').toLowerCase();
    const legalThresholdCents = thresholdCentsForYear(year);

    try {
      const settings = await load1099Settings(orgId);
      const thresholdCents = effectiveThresholdCents(legalThresholdCents, settings.overrideCents);
      if (!settings.reports) {
        if (format === 'csv') return res.status(409).json({ error: '1099 reporting is switched off in Settings.' });
        return res.json({ year, reports_1099: false, threshold_cents: thresholdCents, legal_threshold_cents: legalThresholdCents, vendors: [] });
      }
      const r = await pool.query(
        `WITH bill_reportable AS (
           SELECT bl.bill_id,
                  SUM(CASE WHEN COALESCE(bl.is_1099_reportable, a.is_1099_reportable) THEN bl.amount_cents ELSE 0 END)::bigint AS reportable_cents
             FROM org_bill_lines bl
             JOIN org_accounts a ON a.id = bl.account_id
            GROUP BY bl.bill_id
         ),
         payments_reportable AS (
           SELECT b.constituent_id,
                  LEAST(bp.amount_cents, br.reportable_cents)::bigint AS reportable_paid_cents
             FROM org_bill_payments bp
             JOIN org_bills b ON b.id = bp.bill_id
             JOIN bill_reportable br ON br.bill_id = bp.bill_id
            WHERE bp.org_id = $1 AND bp.status = 'posted'
              AND EXTRACT(YEAR FROM bp.payment_date) = $2
         )
         SELECT c.id AS constituent_id, c.display_name,
                vc.tin_type, vc.tax_entity_type, vc.w9_received,
                (vc.tax_id_encrypted IS NOT NULL) AS has_tax_id,
                COALESCE(SUM(pr.reportable_paid_cents), 0)::bigint AS reportable_paid_cents
           FROM org_constituents c
           JOIN org_vendor_compliance vc ON vc.constituent_id = c.id
      LEFT JOIN payments_reportable pr ON pr.constituent_id = c.id
          WHERE c.org_id = $1 AND vc.is_1099_eligible = true
       GROUP BY c.id, c.display_name, vc.tin_type, vc.tax_entity_type, vc.w9_received, vc.tax_id_encrypted
       ORDER BY reportable_paid_cents DESC, c.display_name ASC`,
        [orgId, year]
      );

      const vendors = r.rows.map((row) => ({
        constituent_id: row.constituent_id,
        display_name: row.display_name,
        tin_type: row.tin_type,
        tax_entity_type: row.tax_entity_type,
        w9_received: row.w9_received,
        has_tax_id: row.has_tax_id,
        reportable_paid_cents: Number(row.reportable_paid_cents),
        over_threshold: Number(row.reportable_paid_cents) >= thresholdCents,
      }));

      if (format === 'csv') {
        const esc = csvCell;
        const thresholdLabel = `Over $${(thresholdCents / 100).toLocaleString()} threshold`;
        const rows = [
          ['Vendor', 'Amount paid (reportable)', thresholdLabel, 'W-9 received', 'TIN type', 'Tax ID on file', 'Entity type'].map(esc).join(','),
          ...vendors.map((v) => [
            esc(v.display_name),
            (v.reportable_paid_cents / 100).toFixed(2),
            v.over_threshold ? 'Yes' : 'No',
            v.w9_received ? 'Yes' : 'No',
            esc(v.tin_type || ''),
            v.has_tax_id ? 'Yes' : 'No',
            esc(String(v.tax_entity_type || '').replace(/_/g, ' ')),
          ].join(',')),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="1099-summary-${year}.csv"`);
        return res.send(rows);
      }

      return res.json({ year, reports_1099: true, threshold_cents: thresholdCents, legal_threshold_cents: legalThresholdCents, vendors });
    } catch (e) {
      console.error('GET /vendor-compliance/1099-summary:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not load 1099 summary' });
    }
  });
}

module.exports = { registerVendorComplianceRoutes };
