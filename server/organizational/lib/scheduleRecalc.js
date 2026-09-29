'use strict';

const { invalidateOrganizationalSummaryCache } = require('./OrganizationalSummaryService');
const { clearComputedLines, writeComputedLine } = require('./scenarioRecalcTarget');

/**
 * Computes monthly budget_line amounts from org_schedule_items and upserts
 * into org_budget_lines with source_type='schedule'.
 *
 * Skips rows where is_override=TRUE (user manually overrode the calculated value).
 *
 * Distribution model:
 *   Insurance items with policy_start_date + policy_end_date:
 *     Day-accurate proration — premium × (days_in_month_covered / total_policy_days)
 *
 *   All other items (Intacct timing model):
 *     monthly       — one payment per month in [start_month, end_month]
 *     quarterly     — months that are (month - start_month) % 3 === 0
 *     annual        — single payment in start_month
 *     one_time      — single payment in start_month
 *     custom_months — only in active_months[] array
 *
 * Total per item = quantity × unit_amount_cents, divided equally across active months.
 * Remainder cents go to the last active month.
 */

/**
 * Day-accurate insurance proration.
 * Returns [{month, amount_cents}, ...] for months in fiscalYear covered by the policy.
 * Rounding error (from integer arithmetic) goes to the last covered month.
 */
function prorateByDay(item, fiscalYear) {
  const pStart = new Date(item.policy_start_date + 'T00:00:00');
  const pEnd   = new Date(item.policy_end_date   + 'T00:00:00');
  if (isNaN(pStart.getTime()) || isNaN(pEnd.getTime()) || pEnd < pStart) return [];

  const totalDays  = Math.round((pEnd - pStart) / 86400000) + 1;
  const totalCents = Math.round(Number(item.quantity) * Number(item.unit_amount_cents));
  const result     = [];

  for (let m = 1; m <= 12; m++) {
    const mStart = new Date(fiscalYear, m - 1, 1);
    const mEnd   = new Date(fiscalYear, m, 0);       // last calendar day of month
    const oStart = pStart > mStart ? pStart : mStart;
    const oEnd   = pEnd   < mEnd   ? pEnd   : mEnd;
    if (oEnd < oStart) continue;
    const days         = Math.round((oEnd - oStart) / 86400000) + 1;
    const amount_cents = Math.round(totalCents * days / totalDays);
    if (amount_cents > 0) result.push({ month: m, amount_cents });
  }

  // Correct any cent-rounding so the FY portion sums exactly
  if (result.length) {
    const sum  = result.reduce((s, r) => s + r.amount_cents, 0);
    const diff = totalCents - sum;
    if (diff) result[result.length - 1].amount_cents += diff;
  }

  return result;
}

function computeActiveMonths(item) {
  const start = item.start_month || 1;
  const end   = item.end_month   || 12;

  switch (item.frequency) {
    case 'monthly':
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);

    case 'quarterly': {
      const months = [];
      for (let m = start; m <= end; m++) {
        if ((m - start) % 3 === 0) months.push(m);
      }
      return months;
    }

    case 'annual':
    case 'one_time':
      return [start];

    case 'custom_months':
      return Array.isArray(item.active_months)
        ? item.active_months.slice().sort((a, b) => a - b)
        : [];

    default:
      return [];
  }
}

function distributeAmount(totalCents, months) {
  if (!months.length) return [];
  const base = Math.floor(totalCents / months.length);
  const remainder = totalCents - base * months.length;
  return months.map((m, i) => ({
    month: m,
    amount_cents: i === months.length - 1 ? base + remainder : base,
  }));
}

/**
 * Splits a single month's amount across an item's program allocations
 * (percent_bps), same rounding convention as distributeAmount — floor per
 * allocation, remainder cents to the last one (sorted by id for determinism).
 */
function splitByAllocations(amountCents, allocations) {
  if (!allocations.length) return [];
  const sorted = allocations.slice().sort((a, b) => a.id - b.id);
  let assigned = 0;
  const out = sorted.map((a, i) => {
    if (i === sorted.length - 1) return { coop_program_id: a.coop_program_id, amount_cents: amountCents - assigned };
    const cents = Math.floor(amountCents * a.percent_bps / 10000);
    assigned += cents;
    return { coop_program_id: a.coop_program_id, amount_cents: cents };
  });
  return out;
}

/**
 * Find an existing budget_lines row matching the composite key.
 * activity_id is always NULL for schedule-sourced lines.
 */
async function findExistingLine(client, orgId, accountId, programId, grantId, fiscalYear, month) {
  const { rows } = await client.query(
    `SELECT id, is_override FROM org_budget_lines
     WHERE org_id=$1
       AND account_id=$2
       AND program_id=$3
       AND (grant_id IS NOT DISTINCT FROM $4)
       AND activity_id IS NULL
       AND fiscal_year=$5
       AND month=$6
     LIMIT 1`,
    [orgId, accountId, programId, grantId, fiscalYear, month]
  );
  return rows[0] || null;
}

/**
 * Recalculate and upsert budget lines for schedule items belonging to an org/year.
 *
 * Aggregates ALL items that share the same (account_id, program_id, grant_id, month)
 * before writing — so the budget line always equals the sum of all sub-row items for
 * that slot, not just the last one processed.
 *
 * If scheduleItemId is provided, loads ALL items for the same account(s) so the
 * aggregate is still correct after a single-item edit.
 */
async function recalcScheduleItems(pool, orgId, fiscalYear, scheduleItemId = null, { scenarioId = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let itemsQuery, params;
    if (scheduleItemId) {
      // Load all items for the same account(s) so the aggregate stays correct.
      itemsQuery = `
        SELECT si.* FROM org_schedule_items si
        WHERE si.org_id = $1 AND si.fiscal_year = $2 AND si.scenario_id IS NOT DISTINCT FROM $4
          AND si.account_id IN (
            SELECT account_id FROM org_schedule_items
            WHERE org_id = $1 AND fiscal_year = $2 AND id = $3
          )`;
      params = [orgId, fiscalYear, scheduleItemId, scenarioId];
    } else {
      itemsQuery = `SELECT * FROM org_schedule_items WHERE org_id=$1 AND fiscal_year=$2 AND scenario_id IS NOT DISTINCT FROM $3`;
      params = [orgId, fiscalYear, scenarioId];
    }

    const { rows: items } = await client.query(itemsQuery, params);

    // Multi-program allocations (percent_bps), same pattern as
    // org_personnel_allocations. Items with no allocation rows fall back to
    // their single program_id column — no backfill needed for existing items.
    const allocsByItem = new Map();
    if (items.length) {
      const { rows: allocRows } = await client.query(
        `SELECT * FROM org_schedule_item_allocations WHERE coop_schedule_item_id = ANY($1::bigint[])`,
        [items.map(i => i.id)]
      );
      for (const a of allocRows) {
        const key = String(a.coop_schedule_item_id);
        if (!allocsByItem.has(key)) allocsByItem.set(key, []);
        allocsByItem.get(key).push(a);
      }
    }

    // Aggregate all items' contributions per (account, program, grant, month).
    // Key: 'accountId|programId|grantId|month'
    const aggMap = new Map();

    for (const item of items) {
      if (!item.account_id) continue;
      const totalCents = Math.round(Number(item.quantity) * Number(item.unit_amount_cents));

      const useProrate = item.schedule_type === 'insurance'
        && item.policy_start_date && item.policy_end_date;
      const distribution = useProrate
        ? prorateByDay(item, fiscalYear)
        : distributeAmount(totalCents, computeActiveMonths(item));

      const allocations = allocsByItem.get(String(item.id)) || [];

      for (const { month, amount_cents } of distribution) {
        const programSplits = allocations.length
          ? splitByAllocations(amount_cents, allocations)
          : [{ coop_program_id: item.program_id ?? null, amount_cents }];

        for (const split of programSplits) {
          if (!split.amount_cents) continue;
          const k = `${item.account_id}|${split.coop_program_id ?? 'null'}|${item.grant_id ?? 'null'}|${month}`;
          const slot = aggMap.get(k) || {
            accountId: item.account_id,
            programId: split.coop_program_id ?? null,
            grantId:   item.grant_id   ?? null,
            month,
            total: 0,
            sourceIds: [],
          };
          slot.total += split.amount_cents;
          slot.sourceIds.push(item.id);
          aggMap.set(k, slot);
        }
      }
    }

    const counts = { inserted: 0, updated: 0, skipped: 0, cleared: 0 };

    // Collect every (account, program, grant) scope that schedule items cover.
    // We'll wipe all non-override budget lines for these scopes before writing
    // fresh ones, preventing stale manual or prior-recalc lines from doubling totals.
    const scopes = new Map();
    for (const slot of aggMap.values()) {
      const scopeKey = `${slot.accountId}|${slot.programId ?? 'null'}|${slot.grantId ?? 'null'}`;
      if (!scopes.has(scopeKey)) {
        scopes.set(scopeKey, {
          accountId: slot.accountId,
          programId: slot.programId ?? null,
          grantId:   slot.grantId   ?? null,
        });
      }
    }

    // Delete all non-override lines for every affected scope so the fresh INSERT
    // below is the single source of truth for each (account, program, grant) slot.
    for (const scope of scopes.values()) {
      let rowCount;
      if (scenarioId == null) {
        ({ rowCount } = await client.query(
          `DELETE FROM org_budget_lines
           WHERE org_id=$1
             AND account_id=$2
             AND (program_id IS NOT DISTINCT FROM $3)
             AND (grant_id   IS NOT DISTINCT FROM $4)
             AND activity_id IS NULL
             AND fiscal_year=$5
             AND is_override IS NOT TRUE`,
          [orgId, scope.accountId, scope.programId, scope.grantId, fiscalYear]
        ));
      } else {
        ({ rowCount } = await client.query(
          `DELETE FROM org_budget_scenario_lines
           WHERE scenario_id=$1
             AND account_id=$2
             AND (program_id IS NOT DISTINCT FROM $3)
             AND (grant_id   IS NOT DISTINCT FROM $4)
             AND source_type='schedule'
             AND is_override IS NOT TRUE`,
          [scenarioId, scope.accountId, scope.programId, scope.grantId]
        ));
      }
      counts.cleared += (rowCount || 0);
    }

    // Insert fresh schedule-sourced lines for every slot in the aggregate map.
    for (const slot of aggMap.values()) {
      const { accountId, programId, grantId, month, total, sourceIds } = slot;
      const sourceRefId = sourceIds.length === 1 ? sourceIds[0] : null;

      await writeComputedLine(client, {
        orgId, accountId, programId, grantId, fiscalYear, month, amountCents: total,
        scenarioId, sourceType: 'schedule', sourceRefId, sourceRefType: 'org_schedule_items',
      });
      counts.inserted++;
    }

    await client.query('COMMIT');
    if (scenarioId == null) await invalidateOrganizationalSummaryCache(pool, orgId);
    return { ok: true, items: items.length, ...counts };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Remove budget lines sourced from a specific schedule item (respects is_override).
 * Returns the item's fiscal_year and account_id so callers can trigger a sibling
 * re-recalc after the item itself is deleted.
 */
async function removeScheduleItemLines(pool, orgId, scheduleItemId) {
  // Capture scope before deletion so the caller can re-aggregate siblings.
  const { rows: [item] } = await pool.query(
    `SELECT account_id, fiscal_year, scenario_id FROM org_schedule_items
     WHERE org_id=$1 AND id=$2 LIMIT 1`,
    [orgId, scheduleItemId]
  );

  if (item && item.scenario_id != null) {
    await pool.query(
      `DELETE FROM org_budget_scenario_lines
       WHERE scenario_id=$1 AND source_type='schedule'
         AND source_ref_id=$2 AND source_ref_type='org_schedule_items'
         AND is_override IS NOT TRUE`,
      [item.scenario_id, scheduleItemId]
    );
  } else {
    await pool.query(
      `DELETE FROM org_budget_lines
       WHERE org_id=$1
         AND source_type='schedule'
         AND source_ref_id=$2
         AND source_ref_type='org_schedule_items'
         AND is_override IS NOT TRUE`,
      [orgId, scheduleItemId]
    );
  }

  return item || null;
}

module.exports = { recalcScheduleItems, removeScheduleItemLines, computeActiveMonths };
