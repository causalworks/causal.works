'use strict';

const { calculateWorkerProjections, resolveFringeAccountIds } = require('./personnelCalculator');
const { invalidateOrganizationalSummaryCache } = require('./OrganizationalSummaryService');
const { clearComputedLines, writeComputedLine } = require('./scenarioRecalcTarget');

async function recalcPersonnelBudget(pool, orgId, fiscalYear, { scenarioId = null } = {}) {
  let fringeRow = (await pool.query(
    `SELECT * FROM org_fringe_settings WHERE org_id = $1 LIMIT 1`, [orgId]
  )).rows[0];
  if (!fringeRow) {
    fringeRow = (await pool.query(
      `INSERT INTO org_fringe_settings (org_id) VALUES ($1) RETURNING *`, [orgId]
    )).rows[0];
  }

  const workersRes = await pool.query(
    `SELECT * FROM org_personnel WHERE org_id = $1 AND fiscal_year = $2 AND scenario_id IS NOT DISTINCT FROM $3 ORDER BY id`,
    [orgId, fiscalYear, scenarioId]
  );
  const workers = workersRes.rows;
  if (workers.length === 0) {
    await clearComputedLines(pool, { orgId, fiscalYear, scenarioId, sourceType: 'personnel' });
    return { workers_processed: 0, lines_written: 0 };
  }

  const workerIds = workers.map(w => w.id);
  const allocsRes = await pool.query(
    `SELECT * FROM org_personnel_allocations WHERE coop_personnel_id = ANY($1::bigint[]) ORDER BY coop_personnel_id, id`,
    [workerIds]
  );
  const allocsByWorker = {};
  for (const a of allocsRes.rows) {
    const key = String(a.coop_personnel_id);
    (allocsByWorker[key] = allocsByWorker[key] || []).push(a);
  }

  const fringeAccountIds = resolveFringeAccountIds(fringeRow);

  const aggMap = new Map();
  for (const w of workers) {
    const allocations = allocsByWorker[String(w.id)] || [];
    const lines = calculateWorkerProjections(w, allocations, fringeRow, fringeAccountIds);
    for (const line of lines) {
      const k = `${line.account_id}:${line.program_id ?? 'null'}:${line.month}`;
      if (!aggMap.has(k)) aggMap.set(k, { ...line, amount_cents: 0 });
      aggMap.get(k).amount_cents += line.amount_cents;
    }
  }

  const client = await pool.connect();
  let written = 0;
  try {
    await client.query('BEGIN');

    await clearComputedLines(client, { orgId, fiscalYear, scenarioId, sourceType: 'personnel' });

    const personnelAccountIds = new Set();
    for (const entry of aggMap.values()) {
      if (!entry.amount_cents) continue;
      await writeComputedLine(client, {
        orgId, accountId: entry.account_id, programId: entry.program_id ?? null, grantId: null,
        fiscalYear, month: entry.month, amountCents: entry.amount_cents,
        scenarioId, sourceType: 'personnel', sourceRefId: null, sourceRefType: 'org_personnel',
      });
      personnelAccountIds.add(entry.account_id);
      written++;
    }

    if (scenarioId == null && personnelAccountIds.size > 0) {
      await client.query(
        `UPDATE org_accounts SET budget_source = 'personnel'
         WHERE org_id = $1 AND id = ANY($2::int[])
           AND budget_source != 'personnel'`,
        [orgId, [...personnelAccountIds]]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  if (scenarioId == null) await invalidateOrganizationalSummaryCache(pool, orgId);
  return { workers_processed: workers.length, lines_written: written };
}

module.exports = { recalcPersonnelBudget };
