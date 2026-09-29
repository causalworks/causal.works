'use strict';

const { invalidateOrganizationalSummaryCache } = require('./OrganizationalSummaryService');
const { clearComputedLines, writeComputedLine } = require('./scenarioRecalcTarget');

/**
 * Writes grant revenue to org_budget_lines with source_type='grant_allocation'.
 *
 * Only processes grants that have revenue_account_id set and are not declined/closed.
 * Distributes each FY allocation evenly across the 12 calendar months of that year.
 *
 * Each grant writes its own budget lines (keyed by grant_id) so multiple grants
 * sharing the same revenue account + program remain distinguishable on the grid.
 * source_ref_id is populated with the org_grant_allocations row id for traceability.
 *
 * Returns { grants_processed, lines_written }.
 */
async function recalcGrantBudget(pool, orgId, fiscalYear, { scenarioId = null } = {}) {
  // Grant identity/status/revenue_account_id always stays live -- a detailed scenario can
  // only model allocation changes against existing live grants, not hypothetical new ones.
  // See "Explicitly deferred" in the v2 spec.
  const grantsRes = await pool.query(
    `SELECT id, revenue_account_id
     FROM org_grants
     WHERE org_id = $1
       AND revenue_account_id IS NOT NULL
       AND status NOT IN ('declined', 'closed')`,
    [orgId]
  );

  const grants = grantsRes.rows;
  const grantIds = grants.map(g => g.id);

  const client = await pool.connect();
  let written = 0;
  try {
    await client.query('BEGIN');

    await clearComputedLines(client, { orgId, fiscalYear, scenarioId, sourceType: 'grant_allocation' });

    if (grantIds.length === 0) {
      await client.query('COMMIT');
      return { grants_processed: 0, lines_written: 0 };
    }

    // Fetch allocation ID alongside amounts for source_ref_id traceability
    const allocsRes = await client.query(
      `SELECT id, grant_id, coop_program_id, amount_cents
       FROM org_grant_allocations
       WHERE org_id = $1 AND fiscal_year = $2 AND grant_id = ANY($3::int[])
         AND scenario_id IS NOT DISTINCT FROM $4`,
      [orgId, fiscalYear, grantIds, scenarioId]
    );

    const grantById = {};
    for (const g of grants) grantById[g.id] = g;

    // Key includes grant_id so each grant writes separate budget lines.
    // This preserves revenue attribution when multiple grants share an account + program.
    const aggMap = new Map();
    for (const alloc of allocsRes.rows) {
      const g = grantById[alloc.grant_id];
      if (!g) continue;
      const accountId = g.revenue_account_id;
      const programId = alloc.coop_program_id ?? null;
      const grantId = alloc.grant_id;
      const allocId = alloc.id;
      const total = Number(alloc.amount_cents) || 0;
      const base = Math.floor(total / 12);
      const remainder = total - base * 12;

      for (let m = 1; m <= 12; m++) {
        const cents = base + (m === 12 ? remainder : 0);
        if (!cents) continue;
        const k = `${accountId}:${programId ?? 'null'}:${grantId}:${m}`;
        if (!aggMap.has(k)) {
          aggMap.set(k, {
            account_id: accountId,
            program_id: programId,
            grant_id: grantId,
            source_ref_id: allocId,
            month: m,
            amount_cents: 0,
          });
        }
        aggMap.get(k).amount_cents += cents;
      }
    }

    for (const entry of aggMap.values()) {
      if (!entry.amount_cents) continue;
      await writeComputedLine(client, {
        orgId, accountId: entry.account_id, programId: entry.program_id, grantId: entry.grant_id,
        fiscalYear, month: entry.month, amountCents: entry.amount_cents,
        scenarioId, sourceType: 'grant_allocation', sourceRefId: entry.source_ref_id, sourceRefType: 'org_grant_allocations',
      });
      written++;
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  if (scenarioId == null) await invalidateOrganizationalSummaryCache(pool, orgId);
  return { grants_processed: grants.length, lines_written: written };
}

module.exports = { recalcGrantBudget };
