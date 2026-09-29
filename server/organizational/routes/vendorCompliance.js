'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { encryptTaxId } = require('../lib/vendorTaxIdCrypto');

/**
 * Vendor compliance data (tax ID, W-9 status) -- split from org_constituents into its own table
 * (migration 204) specifically so donor-facing consumers of the contact list never see it.
 * Gated admin-only: the real role model today is admin/staff only ('board' is a DB enum value
 * with no code path that can ever assign it, confirmed against orgs.js's invite/role-change
 * endpoints), so requireOrgRole('admin') is the honest gate, not a placeholder for
 * finer-grained roles that don't exist yet.
 */
function registerVendorComplianceRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  app.get('/api/organizational/orgs/:slug/constituents/:id/vendor-compliance', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const constituentId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const c = await pool.query('SELECT id, is_vendor FROM org_constituents WHERE id = $1 AND org_id = $2 LIMIT 1', [constituentId, orgId]);
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
      const c = await pool.query('SELECT id, is_vendor FROM org_constituents WHERE id = $1 AND org_id = $2 LIMIT 1', [constituentId, orgId]);
      if (!c.rows.length) return res.status(404).json({ error: 'Constituent not found' });
      if (!c.rows[0].is_vendor) return res.status(400).json({ error: 'Constituent must have is_vendor = true before vendor compliance data can be set' });

      const existing = await pool.query(
        'SELECT tax_id_encrypted, tax_id_iv, tax_id_auth_tag, tin_type, tax_entity_type, is_1099_eligible, w9_received, w9_received_at, payment_terms FROM org_vendor_compliance WHERE constituent_id = $1 AND org_id = $2 LIMIT 1',
        [constituentId, orgId]
      );
      const prev = existing.rows[0] || {};

      const w9Received = body.w9_received !== undefined ? Boolean(body.w9_received) : Boolean(prev.w9_received);

      // tax_id is write-only (GET never returns the decrypted value, only has_tax_id) -- if the
      // caller didn't send it on this request, keep whatever is already encrypted rather than
      // wiping it out on every unrelated field update (e.g. just flipping w9_received).
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
          // Explicit empty string/null clears it deliberately.
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
      return res.json({ vendor_compliance: r.rows[0] });
    } catch (e) {
      console.error('PUT vendor-compliance:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not save vendor compliance data' });
    }
  });

  // 1099-NEC/MISC nonemployee-compensation reporting threshold, by the CALENDAR year the
  // payment was made in (not the filing year). Historically $600 for decades; the "One Big
  // Beautiful Bill Act" (OBBBA), Section 70433, raised it to $2,000 for payments made on or
  // after 2026-01-01 -- so a 2025 payment (filed in early 2026) still uses $600, while a 2026
  // payment (filed in 2027) uses $2,000. The threshold is also indexed for inflation starting
  // 2027, so $2,000 will not be the last number either. Keyed by year rather than a bare
  // constant specifically so a future year's payment can't silently reuse today's figure.
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
    return 60000; // Pre-2025: $600, unchanged for decades before OBBBA.
  }

  // GET /vendor-compliance/1099-summary?year=YYYY[&format=csv] -- per-vendor 1099-NEC/MISC
  // threshold tracking. 1099 reporting is by CALENDAR year (payment_date), not fiscal year,
  // regardless of the org's own fiscal_year_end_month -- deliberately not reusing this
  // module's usual fiscal-year filtering.
  //
  // A bill can mix reportable and non-reportable lines (e.g. a vendor invoice with both
  // contracted-services and reimbursed-materials lines), and a payment is recorded against
  // the whole bill, not per line. Checked externally before picking an allocation rule (no
  // proportional-split convention is actually in use anywhere): the IRS's own mixed-payment
  // guidance reports the full amount unless a non-incidental item is separately itemized: a
  // real state government AP system's 1099 procedures state outright that a voucher cannot
  // be split -- any reportable component makes the whole payment reportable; QBO sidesteps
  // the question entirely by working at the account level, closer to what this schema
  // already does via is_1099_reportable. No source endorses a proportional dollar-split.
  // So: each payment against a bill is capped at (not fractionally discounted by) that
  // bill's own reportable-line total -- MIN(payment amount, bill's reportable_cents), not
  // amount * reportable_cents/total_cents. This can modestly over-count a bill paid via
  // several partial payments that individually stay under the reportable total but sum
  // above it (rare in practice, and the IRS's own bias toward over-inclusion in ambiguous
  // cases makes over-flagging the safer direction for a threshold-tracking tool that a human
  // reviews, not one that files automatically) -- worth knowing about, not worth the added
  // complexity of a cross-payment running-total allocation for a v1 tracking feature.
  // Line-level is_1099_reportable overrides the account's own default when set (NULL means
  // "inherit from account", matching how bills.js already treats this field).
  //
  // Tracking + export only, per the 2026-09-13 plan -- no in-house e-filing (even Bill.com
  // and Ramp don't file 1099s themselves).
  app.get('/api/organizational/orgs/:slug/vendor-compliance/1099-summary', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const year = Number.parseInt(String(req.query.year || ''), 10);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      return res.status(400).json({ error: 'year is required (e.g. 2026)' });
    }
    const format = String(req.query.format || 'json').toLowerCase();
    const thresholdCents = thresholdCentsForYear(year);

    try {
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
        const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
        const thresholdLabel = `Over $${(thresholdCents / 100).toLocaleString()} threshold`;
        const rows = [
          ['Vendor', 'Amount paid (reportable)', thresholdLabel, 'W-9 received', 'TIN type', 'Tax ID on file'].map(esc).join(','),
          ...vendors.map((v) => [
            esc(v.display_name),
            (v.reportable_paid_cents / 100).toFixed(2),
            v.over_threshold ? 'Yes' : 'No',
            v.w9_received ? 'Yes' : 'No',
            esc(v.tin_type || ''),
            v.has_tax_id ? 'Yes' : 'No',
          ].join(',')),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="1099-summary-${year}.csv"`);
        return res.send(rows);
      }

      return res.json({ year, threshold_cents: thresholdCents, vendors });
    } catch (e) {
      console.error('GET /vendor-compliance/1099-summary:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not load 1099 summary' });
    }
  });
}

module.exports = { registerVendorComplianceRoutes };
