'use strict';

const crypto = require('crypto');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { importJWK, jwtVerify, decodeProtectedHeader } = require('jose');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { enterOrgContext } = require('../lib/orgContext');

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
}));

// Plaid amount convention is the opposite of this schema's: Plaid's Transaction.amount is
// positive for money LEAVING the account and negative for money coming IN. org_bank_statement_
// lines instead stores an unsigned amount_cents plus credit_debit_indicator (credit = money in,
// debit = money out, migration 218). Getting this backwards silently flips every synced line's
// direction -- exactly the sign-ambiguity bug this schema was built to eliminate -- so the
// mapping is centralized here, once, rather than left for each call site to remember.
function plaidTransactionToStatementLine(t) {
  return {
    amountCents: Math.round(Math.abs(t.amount) * 100),
    creditDebitIndicator: t.amount > 0 ? 'debit' : 'credit',
    statementDate: t.date,
    payeeRaw: t.merchant_name || t.name || null,
    descriptionRaw: t.name || null,
    pending: !!t.pending,
    plaidTransactionId: t.transaction_id,
    plaidPendingTransactionId: t.pending_transaction_id || null,
  };
}

/**
 * One sync pass for one org_plaid_items row: calls /transactions/sync with the stored cursor,
 * applies added/modified/removed, advances the cursor, and loops while has_more -- the exact
 * incremental pattern Plaid's docs describe (added/modified/removed are the only three things
 * that can happen to a transaction; a posted transaction replacing a pending one shows up as
 * the pending one's id in `removed` plus a new row in `added`, never an in-place update).
 */
async function syncPlaidItem(pool, itemRow) {
  let cursor = itemRow.cursor;
  let hasMore = true;
  let totalAdded = 0;

  while (hasMore) {
    const resp = await plaidClient.transactionsSync({
      access_token: itemRow.access_token,
      cursor: cursor || undefined,
    });
    const { added, modified, removed, next_cursor, has_more } = resp.data;

    for (const t of [...added, ...modified]) {
      const acctR = await pool.query('SELECT org_account_id FROM org_plaid_accounts WHERE plaid_account_id = $1 AND org_id = $2', [t.account_id, itemRow.org_id]);
      if (!acctR.rows.length) continue; // account not yet mapped to an org_accounts row -- skip until it is
      const orgAccountId = acctR.rows[0].org_account_id;
      const mapped = plaidTransactionToStatementLine(t);

      if (mapped.plaidPendingTransactionId) {
        await pool.query(
          `DELETE FROM org_bank_statement_lines WHERE org_id = $1 AND plaid_transaction_id = $2 AND status = 'unconfirmed'`,
          [itemRow.org_id, mapped.plaidPendingTransactionId]
        );
      }

      await pool.query(
        `INSERT INTO org_bank_statement_lines
           (org_id, bank_account_id, statement_date, amount_cents, credit_debit_indicator, payee_raw, description_raw,
            import_fingerprint, source, plaid_transaction_id, plaid_pending_transaction_id, pending, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'plaid',$9,$10,$11,'unconfirmed')
         ON CONFLICT (org_id, plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL
         DO UPDATE SET amount_cents = EXCLUDED.amount_cents, credit_debit_indicator = EXCLUDED.credit_debit_indicator,
                        pending = EXCLUDED.pending, payee_raw = EXCLUDED.payee_raw, description_raw = EXCLUDED.description_raw
         WHERE org_bank_statement_lines.status = 'unconfirmed'`,
        [itemRow.org_id, orgAccountId, mapped.statementDate, mapped.amountCents, mapped.creditDebitIndicator,
         mapped.payeeRaw, mapped.descriptionRaw, 'plaid:' + mapped.plaidTransactionId, mapped.plaidTransactionId,
         mapped.plaidPendingTransactionId, mapped.pending]
      );
      totalAdded += 1;
    }

    for (const r of removed) {
      await pool.query(
        `DELETE FROM org_bank_statement_lines WHERE org_id = $1 AND plaid_transaction_id = $2 AND status = 'unconfirmed'`,
        [itemRow.org_id, r.transaction_id]
      );
    }

    cursor = next_cursor;
    hasMore = has_more;
  }

  await pool.query(`UPDATE org_plaid_items SET cursor = $1, updated_at = NOW(), status = 'active', error_message = NULL WHERE id = $2`, [cursor, itemRow.id]);

  // Refresh balances + last-synced timestamp for every mapped account on this item -- feeds the
  // account-strip UI's per-account balance/status display directly, not derived from anything
  // else.
  const balancesResp = await plaidClient.accountsBalanceGet({ access_token: itemRow.access_token });
  for (const a of balancesResp.data.accounts) {
    await pool.query(
      `UPDATE org_plaid_accounts SET
         plaid_account_name = $1, plaid_account_mask = $2,
         current_balance_cents = $3, available_balance_cents = $4, last_synced_at = NOW()
       WHERE plaid_account_id = $5 AND org_id = $6`,
      [a.name, a.mask,
       a.balances.current != null ? Math.round(a.balances.current * 100) : null,
       a.balances.available != null ? Math.round(a.balances.available * 100) : null,
       a.account_id, itemRow.org_id]
    );
  }

  return totalAdded;
}

function registerPlaidRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const npAdmin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  app.post('/api/organizational/orgs/:slug/plaid/link-token', ...npAdmin, async (req, res) => {
    try {
      const resp = await plaidClient.linkTokenCreate({
        client_name: 'Causal',
        language: 'en',
        country_codes: ['US'],
        user: { client_user_id: 'org-' + req.orgId },
        products: ['transactions'],
        webhook: (process.env.CAUSAL_DOMAIN ? 'https://' + process.env.CAUSAL_DOMAIN : '') + '/api/plaid/webhook',
      });
      return res.json({ link_token: resp.data.link_token });
    } catch (e) {
      console.error('POST plaid/link-token:', e.response ? e.response.data : e.message);
      return res.status(500).json({ error: 'Could not create Plaid link token' });
    }
  });

  /**
   * After Link succeeds client-side: exchange the public token, create the org_plaid_items row,
   * pull the accounts Plaid returned, and return them unmapped -- the caller (frontend) still
   * needs to map each one to an org_accounts row (existing account or "create new"), same
   * account-mapping step Xero's own connect flow already requires. No org_plaid_accounts rows
   * are created here; that happens via the separate map-account endpoint below.
   */
  app.post('/api/organizational/orgs/:slug/plaid/exchange-public-token', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const publicToken = req.body && req.body.public_token;
    if (!publicToken) return res.status(400).json({ error: 'public_token is required' });

    try {
      const exch = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
      const { access_token: accessToken, item_id: itemId } = exch.data;

      let institutionId = null;
      let institutionName = null;
      const accountsResp = await plaidClient.accountsGet({ access_token: accessToken });
      if (accountsResp.data.item && accountsResp.data.item.institution_id) {
        institutionId = accountsResp.data.item.institution_id;
      }
      if (institutionId) {
        try {
          const instResp = await plaidClient.institutionsGetById({ institution_id: institutionId, country_codes: ['US'] });
          institutionName = instResp.data.institution.name;
        } catch (_) { /* non-fatal -- institution name is cosmetic */ }
      }

      const itemR = await pool.query(
        `INSERT INTO org_plaid_items (org_id, item_id, access_token, institution_id, institution_name, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [orgId, itemId, accessToken, institutionId, institutionName, userId]
      );

      const accounts = accountsResp.data.accounts.map((a) => ({
        plaid_account_id: a.account_id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        current_balance_cents: a.balances.current != null ? Math.round(a.balances.current * 100) : null,
      }));
      return res.status(201).json({ plaid_item_id: itemR.rows[0].id, institution_name: institutionName, accounts });
    } catch (e) {
      console.error('POST plaid/exchange-public-token:', e.response ? e.response.data : e.message);
      return res.status(500).json({ error: 'Could not connect this bank account' });
    }
  });

  /** Maps one Plaid account to an existing org_accounts row (must be is_cash_account) and runs the first sync immediately, so the account shows real data right away rather than waiting for the next webhook. */
  app.post('/api/organizational/orgs/:slug/plaid/accounts/map', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const plaidItemId = Number.parseInt(String(req.body.plaid_item_id), 10);
    const plaidAccountId = req.body.plaid_account_id;
    const orgAccountId = Number.parseInt(String(req.body.org_account_id), 10);
    if (!Number.isInteger(plaidItemId) || !plaidAccountId || !Number.isInteger(orgAccountId)) {
      return res.status(400).json({ error: 'plaid_item_id, plaid_account_id, and org_account_id are all required' });
    }
    try {
      const mapR = await pool.query(
        `INSERT INTO org_plaid_accounts (org_id, plaid_item_id, plaid_account_id, org_account_id)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [orgId, plaidItemId, plaidAccountId, orgAccountId]
      );
      const itemR = await pool.query('SELECT * FROM org_plaid_items WHERE id = $1 AND org_id = $2', [plaidItemId, orgId]);
      if (itemR.rows.length) await syncPlaidItem(pool, itemR.rows[0]).catch((e) => console.error('initial sync after mapping:', e.message));
      return res.status(201).json({ id: mapR.rows[0].id });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'That org account is already mapped to a Plaid account', code: 'already_mapped' });
      console.error('POST plaid/accounts/map:', e.message);
      return res.status(500).json({ error: 'Could not map this account' });
    }
  });

  app.get('/api/organizational/orgs/:slug/plaid/status', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    try {
      const r = await pool.query(
        `SELECT pa.org_account_id, pa.plaid_account_name, pa.last_synced_at, pa.current_balance_cents,
                pi.institution_name, pi.status AS item_status
         FROM org_plaid_accounts pa JOIN org_plaid_items pi ON pi.id = pa.plaid_item_id
         WHERE pa.org_id = $1`,
        [orgId]
      );
      return res.json({ accounts: r.rows });
    } catch (e) {
      console.error('GET plaid/status:', e.message);
      return res.status(500).json({ error: 'Could not load Plaid connection status' });
    }
  });

  /** Manual sync trigger -- lets a user (or, in this environment, testing) pull fresh transactions without waiting for a webhook, and is exactly what the webhook handler itself calls. */
  app.post('/api/organizational/orgs/:slug/plaid/sync-now', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    try {
      const itemsR = await pool.query(`SELECT * FROM org_plaid_items WHERE org_id = $1 AND status = 'active'`, [orgId]);
      let total = 0;
      for (const item of itemsR.rows) total += await syncPlaidItem(pool, item);
      return res.json({ synced: total });
    } catch (e) {
      console.error('POST plaid/sync-now:', e.response ? e.response.data : e.message);
      return res.status(500).json({ error: 'Could not sync' });
    }
  });

  app.post('/api/organizational/orgs/:slug/plaid/disconnect', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const plaidItemId = Number.parseInt(String(req.body.plaid_item_id), 10);
    if (!Number.isInteger(plaidItemId)) return res.status(400).json({ error: 'plaid_item_id is required' });
    try {
      const r = await pool.query('SELECT * FROM org_plaid_items WHERE id = $1 AND org_id = $2', [plaidItemId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
      await plaidClient.itemRemove({ access_token: r.rows[0].access_token }).catch((e) => console.error('itemRemove:', e.message));
      await pool.query(`UPDATE org_plaid_items SET status = 'revoked', access_token = '', updated_at = NOW() WHERE id = $1`, [plaidItemId]);
      return res.json({ id: plaidItemId, status: 'revoked' });
    } catch (e) {
      console.error('POST plaid/disconnect:', e.message);
      return res.status(500).json({ error: 'Could not disconnect' });
    }
  });
}

const webhookKeyCache = new Map();

/**
 * Plaid's documented webhook verification algorithm, implemented in full -- not skipped by
 * matching the existing (unverified) Postmark inbound webhook's precedent. A forged webhook
 * body could otherwise be used to trigger a sync against an arbitrary item_id.
 * https://plaid.com/docs/api/webhooks/webhook-verification/
 */
async function verifyPlaidWebhook(req) {
  const jwt = req.headers['plaid-verification'];
  if (!jwt || !req.rawBody) return false;
  const header = decodeProtectedHeader(jwt);
  if (header.alg !== 'ES256') return false;

  let jwk = webhookKeyCache.get(header.kid);
  if (!jwk) {
    const resp = await plaidClient.webhookVerificationKeyGet({ key_id: header.kid });
    jwk = resp.data.key;
    webhookKeyCache.set(header.kid, jwk);
  }
  const key = await importJWK(jwk, 'ES256');
  const { payload } = await jwtVerify(jwt, key, { maxTokenAge: '5 min' });

  const bodyHash = crypto.createHash('sha256').update(req.rawBody).digest('hex');
  return bodyHash === payload.request_body_sha256;
}

function handlePlaidWebhook(pool) {
  return async (req, res) => {
    res.status(200).json({ status: 'received' });
    try {
      const verified = await verifyPlaidWebhook(req);
      if (!verified) { console.error('Plaid webhook: signature verification failed, ignoring'); return; }
      const { webhook_type: type, webhook_code: code, item_id: itemId } = req.body;
      if (type !== 'TRANSACTIONS' || code !== 'SYNC_UPDATES_AVAILABLE') return;

      // No user session on this path (signature-verified instead), so org_id isn't known yet --
      // routed through a SECURITY DEFINER function (migration 253) the same way
      // resolve_member_org_id() bootstraps org_users lookups, since org_plaid_items' own
      // fail-closed RLS policy can't be satisfied before this exact lookup discovers org_id.
      const itemR = await pool.query(`SELECT * FROM resolve_plaid_item_by_item_id($1)`, [itemId]);
      if (!itemR.rows.length || itemR.rows[0].id == null) { console.error('Plaid webhook: unknown item_id', itemId); return; }
      const itemRow = itemR.rows[0];
      enterOrgContext(itemRow.org_id);
      await syncPlaidItem(pool, itemRow);
    } catch (e) {
      console.error('Plaid webhook handling error:', e.message);
    }
  };
}

module.exports = { registerPlaidRoutes, handlePlaidWebhook, syncPlaidItem, plaidClient };
