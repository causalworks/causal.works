'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { isXeroConfigured, xeroRedirectUri } = require('../xero/config');
const { signOAuthState } = require('../xero/oauth-state');
const { buildAuthorizeUrl, xeroGetJson, xeroPutJson } = require('../xero/xero-http');
const { getValidAccessToken, clearXeroConnection } = require('../xero/org-tokens');
const { importProfitAndLossActualsForOrg, parseISODateBoundary } = require('../xero/import-pl-actuals');
const { importBalanceSheetForOrg } = require('../xero/import-balance-sheet');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { requireImportedActuals } = require('../lib/requireImportedActuals');

const XERO_GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeXeroAccount(a) {
  if (!a || typeof a !== 'object') return null;
  const bal = a.Balance != null ? Number(a.Balance) : null;
  return {
    account_id: a.AccountID || a.accountID || null,
    code: a.Code != null ? String(a.Code) : '',
    name: a.Name != null ? String(a.Name) : '',
    type: a.Type != null ? String(a.Type) : '',
    status: a.Status != null ? String(a.Status) : '',
    tax_type: a.TaxType != null ? String(a.TaxType) : '',
    balance: Number.isFinite(bal) ? bal : null,
  };
}

function isXeroAccountArchived(x) {
  return String(x.status || '')
    .trim()
    .toUpperCase() === 'ARCHIVED';
}

/** P&L + bank/cash — enough for budget + liquidity without full balance-sheet clutter. */
const ONBOARDING_XERO_TYPES = new Set([
  'REVENUE',
  'SALES',
  'OTHERINCOME',
  'EXPENSE',
  'OVERHEADS',
  'DIRECTCOSTS',
  'BANK',
  'WAGESEXPENSE',
  'SUPERANNUATIONEXPENSE',
]);

/**
 * @param {ReturnType<typeof normalizeXeroAccount>[]} normalized
 * @param {'full' | 'onboarding'} mode
 */
function filterXeroAccountsForCoop(normalized, mode) {
  let list = (normalized || []).filter((x) => x && !isXeroAccountArchived(x));
  if (mode === 'onboarding') {
    list = list.filter((x) => {
      const t = String(x.type || '')
        .trim()
        .toUpperCase();
      return ONBOARDING_XERO_TYPES.has(t);
    });
  }
  return list;
}

function normalizeTrackingCategory(tc) {
  if (!tc || typeof tc !== 'object') return null;
  const opts = Array.isArray(tc.Options) ? tc.Options : [];
  return {
    tracking_category_id: tc.TrackingCategoryID || tc.trackingCategoryID || null,
    name: tc.Name != null ? String(tc.Name) : '',
    status: tc.Status != null ? String(tc.Status) : '',
    options: opts.map((o) => ({
      tracking_option_id: o.TrackingOptionID || o.trackingOptionID || null,
      name: o.Name != null ? String(o.Name) : '',
      status: o.Status != null ? String(o.Status) : '',
    })),
  };
}

function registerOrganizationalXeroRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const npAdmin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  app.get('/api/organizational/orgs/:slug/xero/connect', ...npAdmin, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    if (!isXeroConfigured()) {
      return res.redirect(302, `/organizational/o/${encodeURIComponent(slug)}?xero=error&reason=not_configured`);
    }
    const returnTo =
      String(req.query.return || '').toLowerCase() === 'onboarding' ? 'onboarding' : undefined;
    let state;
    try {
      state = signOAuthState({ uid: Number(userId), slug, ...(returnTo ? { return_to: returnTo } : {}) });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('xero sign state:', e.message);
      return res.redirect(302, `/organizational/o/${encodeURIComponent(slug)}?xero=error&reason=state`);
    }
    const url = buildAuthorizeUrl(state);
    return res.redirect(302, url);
  });

  app.post('/api/organizational/orgs/:slug/xero/disconnect', ...npAdmin, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      await clearXeroConnection(pool, orgId);
      return res.json({ ok: true });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST xero/disconnect:', e.message);
      return res.status(500).json({ error: 'Could not disconnect Xero' });
    }
  });

  app.get('/api/organizational/orgs/:slug/xero/status', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const row = await pool.query(
        `SELECT s.xero_tenant_id, s.xero_token_data,
                (SELECT MAX(a.created_at) FROM org_actuals a WHERE a.org_id = o.id) AS actuals_last_created
         FROM coop_members o
         LEFT JOIN org_settings s ON s.org_id = o.id
         WHERE o.id = $1
         LIMIT 1`,
        [orgId]
      );
      const orgRow = row.rows[0] || {};
      const tenantId = orgRow.xero_tenant_id;
      let tokenPersist = null;
      const td = orgRow.xero_token_data;
      if (td && typeof td === 'object' && !Array.isArray(td) && td.last_token_persist_at) {
        const t = new Date(String(td.last_token_persist_at));
        if (!Number.isNaN(t.getTime())) tokenPersist = t.toISOString();
      }
      const actualsIso =
        orgRow.actuals_last_created instanceof Date
          ? orgRow.actuals_last_created.toISOString()
          : orgRow.actuals_last_created
            ? String(orgRow.actuals_last_created)
            : null;
      const times = [actualsIso, tokenPersist].filter(Boolean).map((s) => new Date(s).getTime());
      const lastXeroTouchAt =
        times.length > 0 ? new Date(Math.max.apply(null, times)).toISOString() : null;
      return res.json({
        configured: isXeroConfigured(),
        redirect_uri: xeroRedirectUri(),
        connected: !!(tenantId && String(tenantId).trim()),
        tenant_id: tenantId || null,
        actuals_last_sync_at: actualsIso,
        token_last_persist_at: tokenPersist,
        last_xero_touch_at: lastXeroTouchAt,
      });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET xero/status:', e.message);
      return res.status(500).json({ error: 'Could not load Xero status' });
    }
  });

  app.post('/api/organizational/orgs/:slug/xero/push-account-names', ...npAdmin, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const tok = await getValidAccessToken(pool, orgId);
      if (tok.error) {
        const status = tok.error === 'refresh_failed' ? 502 : 400;
        return res.status(status).json({ error: 'Xero is not connected or token refresh failed' });
      }
      const list = await pool.query(
        `SELECT code, name, xero_account_id
         FROM org_accounts
         WHERE org_id = $1
           AND xero_account_id IS NOT NULL
           AND trim(xero_account_id) <> ''`,
        [orgId]
      );
      const errors = [];
      let updated = 0;
      let unchanged = 0;
      for (const row of list.rows) {
        const guid = String(row.xero_account_id || '').trim().toLowerCase();
        if (!XERO_GUID.test(guid)) continue;
        try {
          const data = await xeroGetJson(tok.accessToken, tok.tenantId, `/api.xro/2.0/Accounts/${guid}`);
          const acc = data.Accounts && data.Accounts[0];
          if (!acc) {
            errors.push({ code: row.code, error: 'Account not found in Xero' });
            continue;
          }
          const curName = acc.Name != null ? String(acc.Name) : '';
          const nextName = String(row.name || '').trim();
          if (curName === nextName) {
            unchanged += 1;
            continue;
          }
          const merged = { ...acc, Name: nextName };
          await xeroPutJson(tok.accessToken, tok.tenantId, `/api.xro/2.0/Accounts/${guid}`, {
            Accounts: [merged],
          });
          updated += 1;
        } catch (e) {
          if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
          errors.push({ code: row.code, error: e.message || 'Xero update failed' });
        }
      }
      return res.json({
        ok: errors.length === 0,
        updated,
        unchanged,
        errors,
      });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST xero/push-account-names:', e.message);
      return res.status(502).json({ error: e.message || 'Xero push failed' });
    }
  });

  app.get('/api/organizational/orgs/:slug/xero/accounts', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const tok = await getValidAccessToken(pool, orgId);
      if (tok.error) {
        const status = tok.error === 'refresh_failed' ? 502 : 400;
        return res.status(status).json({ error: 'Xero is not connected or token refresh failed' });
      }
      const data = await xeroGetJson(tok.accessToken, tok.tenantId, '/api.xro/2.0/Accounts');
      const raw = Array.isArray(data.Accounts) ? data.Accounts : [];
      const mapped = raw.map(normalizeXeroAccount).filter((x) => x && x.account_id);
      const purpose = String(req.query.purpose || '')
        .trim()
        .toLowerCase();
      const mode = purpose === 'onboarding' ? 'onboarding' : 'full';
      let accounts = filterXeroAccountsForCoop(mapped, mode);
      if (mode === 'onboarding') {
        const anyBalance = accounts.some((x) => x.balance != null);
        if (anyBalance) {
          accounts = accounts.filter((x) => {
            if (x.balance == null) return true;
            return Math.abs(Number(x.balance)) >= 0.005;
          });
        }
      }
      const out = accounts.map((x) => {
        const { balance, ...rest } = x;
        return rest;
      });
      return res.json({ accounts: out });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET xero/accounts:', e.message);
      return res.status(502).json({ error: 'Could not load Xero accounts' });
    }
  });

  app.get('/api/organizational/orgs/:slug/xero/tracking', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const tok = await getValidAccessToken(pool, orgId);
      if (tok.error) {
        const status = tok.error === 'refresh_failed' ? 502 : 400;
        return res.status(status).json({ error: 'Xero is not connected or token refresh failed' });
      }
      const data = await xeroGetJson(tok.accessToken, tok.tenantId, '/api.xro/2.0/TrackingCategories');
      const raw = Array.isArray(data.TrackingCategories) ? data.TrackingCategories : [];
      const tracking_categories = raw.map(normalizeTrackingCategory).filter((x) => x && x.tracking_category_id);
      return res.json({ tracking_categories });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET xero/tracking:', e.message);
      return res.status(502).json({ error: 'Could not load Xero tracking categories' });
    }
  });

  app.post('/api/organizational/orgs/:slug/xero/import-actuals', ...npAdmin, requireImportedActuals(pool), async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const from = String(body.from_date || body.from || '').trim();
    const to = String(body.to_date || body.to || '').trim();
    if (!parseISODateBoundary(from) || !parseISODateBoundary(to)) {
      return res.status(400).json({ error: 'from_date and to_date are required (YYYY-MM-DD)' });
    }
    try {
      const orgId = req.orgId;
      const tok = await getValidAccessToken(pool, orgId);
      if (tok.error) {
        const status = tok.error === 'refresh_failed' ? 502 : 400;
        return res.status(status).json({ error: 'Xero is not connected or token refresh failed' });
      }
      const result = await importProfitAndLossActualsForOrg(
        pool,
        orgId,
        tok.accessToken,
        tok.tenantId,
        from,
        to
      );
      return res.json(result);
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST xero/import-actuals:', e.message);
      return res.status(502).json({ error: e.message || 'Import failed' });
    }
  });

  // Live Xero balance sheet + bank-balance pull (Phase 2 of multi-year
  // budget planning) — writes into the same org_balance_sheet_snapshots
  // table the manual CSV importer uses, so Schedule D and any other
  // existing consumer get live data with no changes on their end.
  app.post('/api/organizational/orgs/:slug/xero/sync-balance-sheet', ...npAdmin, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const asOfDate = body.as_of_date ? String(body.as_of_date).trim() : null;
    try {
      const orgId = req.orgId;
      const tok = await getValidAccessToken(pool, orgId);
      if (tok.error) {
        const status = tok.error === 'refresh_failed' ? 502 : 400;
        return res.status(status).json({ error: 'Xero is not connected or token refresh failed' });
      }

      const bsResult = await importBalanceSheetForOrg(pool, orgId, tok.accessToken, tok.tenantId, asOfDate);

      // Backfill is_cash_account for any linked account Xero classifies as
      // BANK that isn't already flagged — never clears an existing TRUE, so
      // a staff override always wins going forward.
      const data = await xeroGetJson(tok.accessToken, tok.tenantId, '/api.xro/2.0/Accounts');
      const raw = Array.isArray(data.Accounts) ? data.Accounts : [];
      const bankGuids = raw
        .filter((a) => String(a.Type || '').trim().toUpperCase() === 'BANK')
        .map((a) => String(a.AccountID || '').trim().toLowerCase())
        .filter(Boolean);
      let cashAccountsFlagged = 0;
      if (bankGuids.length) {
        const upd = await pool.query(
          `UPDATE org_accounts SET is_cash_account = TRUE, updated_at = NOW()
           WHERE org_id = $1 AND is_cash_account = FALSE
             AND lower(xero_account_id) = ANY($2::text[])`,
          [orgId, bankGuids]
        );
        cashAccountsFlagged = upd.rowCount || 0;
      }

      return res.json({ ...bsResult, cash_accounts_flagged: cashAccountsFlagged });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST xero/sync-balance-sheet:', e.message);
      return res.status(502).json({ error: e.message || 'Balance sheet sync failed' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/actuals/all', ...npAdmin, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const d = await pool.query(`DELETE FROM org_actuals WHERE org_id = $1`, [orgId]);
      return res.json({ deleted: d.rowCount || 0 });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('DELETE actuals/all:', e.message);
      return res.status(500).json({ error: 'Could not delete actuals' });
    }
  });

  app.post('/api/organizational/orgs/:slug/xero/reimport-actuals', ...npAdmin, requireImportedActuals(pool), async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const from = String(body.from_date || body.from || '').trim();
    const to = String(body.to_date || body.to || '').trim();
    if (!parseISODateBoundary(from) || !parseISODateBoundary(to)) {
      return res.status(400).json({ error: 'from_date and to_date are required (YYYY-MM-DD)' });
    }
    try {
      const orgId = req.orgId;
      const tok = await getValidAccessToken(pool, orgId);
      if (tok.error) {
        const status = tok.error === 'refresh_failed' ? 502 : 400;
        return res.status(status).json({ error: 'Xero is not connected or token refresh failed' });
      }
      const d = await pool.query(`DELETE FROM org_actuals WHERE org_id = $1`, [orgId]);
      const result = await importProfitAndLossActualsForOrg(
        pool,
        orgId,
        tok.accessToken,
        tok.tenantId,
        from,
        to
      );
      return res.json({ deleted: d.rowCount || 0, ...result });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST xero/reimport-actuals:', e.message);
      return res.status(502).json({ error: e.message || 'Reimport failed' });
    }
  });

  app.post('/api/organizational/orgs/:slug/xero/map-account', ...npAdmin, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const xeroAccountId = String(body.xero_account_id || '').trim().toLowerCase();
    const coopAccountIdRaw = body.coop_account_id;

    if (!XERO_GUID.test(xeroAccountId)) {
      return res.status(400).json({ error: 'xero_account_id must be a Xero account GUID' });
    }

    let coopAccountId = null;
    if (coopAccountIdRaw !== undefined && coopAccountIdRaw !== null && coopAccountIdRaw !== '') {
      coopAccountId = Number.parseInt(String(coopAccountIdRaw), 10);
      if (!Number.isInteger(coopAccountId) || coopAccountId < 1) {
        return res.status(400).json({ error: 'coop_account_id must be a positive integer or null' });
      }
    }

    const client = await pool.connect();
    try {
      const orgId = req.orgId;

      await client.query('BEGIN');

      await client.query(
        `UPDATE org_accounts SET xero_account_id = NULL, updated_at = NOW()
         WHERE org_id = $1 AND lower(xero_account_id) = $2`,
        [orgId, xeroAccountId]
      );

      if (coopAccountId != null) {
        const acc = await client.query(
          `SELECT id FROM org_accounts WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [coopAccountId, orgId]
        );
        if (acc.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Coop account not found' });
        }

        await client.query(
          `UPDATE org_accounts SET xero_account_id = $2, updated_at = NOW()
           WHERE id = $1 AND org_id = $3`,
          [coopAccountId, xeroAccountId, orgId]
        );
      }

      await client.query('COMMIT');
      return res.json({ ok: true });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      if (e && e.code === '23505') {
        return res.status(409).json({ error: 'That Xero account is already mapped to another row' });
      }
      console.error('POST xero/map-account:', e.message);
      return res.status(500).json({ error: 'Could not save mapping' });
    } finally {
      client.release();
    }
  });

  // --- XERO CONTACTS (for constituent linking) ---
  app.get('/api/organizational/orgs/:slug/xero/contacts', ...orgAuth, async (req, res) => {
    try {
      const orgId = req.orgId;
      const tok = await getValidAccessToken(pool, orgId);
      if (tok.error) {
        const status = tok.error === 'refresh_failed' ? 502 : 400;
        return res.status(status).json({ error: 'Xero is not connected or token refresh failed' });
      }
      const data = await xeroGetJson(tok.accessToken, tok.tenantId, '/api.xro/2.0/Contacts?includeArchived=false');
      const raw = Array.isArray(data.Contacts) ? data.Contacts : [];
      const contacts = raw
        .filter((c) => c && c.ContactID)
        .map((c) => ({
          contact_id: c.ContactID,
          name: String(c.Name || '').trim(),
          email_address: String(c.EmailAddress || '').trim() || null,
          is_supplier: Boolean(c.IsSupplier),
          is_customer: Boolean(c.IsCustomer),
        }))
        .filter((c) => c.name);
      return res.json({ contacts });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET xero/contacts:', e.message);
      return res.status(502).json({ error: 'Could not load Xero contacts' });
    }
  });
}

module.exports = { registerOrganizationalXeroRoutes };
