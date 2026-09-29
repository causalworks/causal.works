'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { recalcScheduleItems, removeScheduleItemLines } = require('../lib/scheduleRecalc');
const { syncInsuranceCarryforward, removeAllCarryforwardChildren } = require('../lib/scheduleCarryforward');
const { logAudit, diffFields, reqMeta } = require('../lib/auditLog');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');

function rowToItem(row) {
  return {
    id:                Number(row.id),
    org_id:       row.org_id,
    account_id:        row.account_id,
    program_id:        row.program_id,
    grant_id:          row.grant_id,
    named_schedule_id: row.named_schedule_id ? Number(row.named_schedule_id) : null,
    fiscal_year:       row.fiscal_year,
    label:             row.label,
    schedule_type:     row.schedule_type,
    quantity:          Number(row.quantity),
    unit_amount_cents: Number(row.unit_amount_cents),
    frequency:         row.frequency,
    active_months:     row.active_months || null,
    start_month:       row.start_month,
    end_month:         row.end_month,
    policy_start_date: row.policy_start_date || null,
    policy_end_date:   row.policy_end_date   || null,
    origin_item_id:    row.origin_item_id ? Number(row.origin_item_id) : null,
    auto_generated:    !!row.auto_generated,
    source_ref_id:     row.source_ref_id,
    source_ref_type:   row.source_ref_type,
    notes:             row.notes,
    sort_order:        row.sort_order,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
    allocations:       row.allocations || [],
  };
}

function parseInt10(v) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

async function loadAllocations(pool, itemIds) {
  const byItem = new Map();
  if (!itemIds.length) return byItem;
  const { rows } = await pool.query(
    `SELECT sa.*, p.name AS program_name FROM org_schedule_item_allocations sa
     LEFT JOIN org_programs p ON p.id = sa.coop_program_id
     WHERE sa.coop_schedule_item_id = ANY($1::bigint[]) ORDER BY sa.coop_schedule_item_id, sa.id`,
    [itemIds]
  );
  for (const a of rows) {
    const key = String(a.coop_schedule_item_id);
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push(a);
  }
  return byItem;
}

// Replaces an item's allocations with the given list (delete-then-insert,
// mirroring org_personnel_allocations PATCH semantics). Returns the fresh rows.
async function replaceAllocations(pool, orgId, itemId, allocations) {
  await pool.query(`DELETE FROM org_schedule_item_allocations WHERE coop_schedule_item_id = $1`, [itemId]);
  for (const a of allocations) {
    const programId = parseInt10(a.coop_program_id ?? a.program_id);
    const bps = parseInt10(a.percent_bps);
    if (!programId || !bps) continue;
    await pool.query(
      `INSERT INTO org_schedule_item_allocations (coop_schedule_item_id, org_id, coop_program_id, percent_bps)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [itemId, orgId, programId, bps]
    );
  }
  return (await loadAllocations(pool, [itemId])).get(String(itemId)) || [];
}

function registerOrganizationalScheduleItemRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  // GET all schedule items for org + fiscal_year
  app.get('/api/organizational/orgs/:slug/schedule-items', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy)) return res.status(400).json({ error: 'fiscal_year required' });

    try {

      const scheduleType = req.query.schedule_type || null;
      const q = scheduleType
        ? `SELECT s.*, a.name AS account_name, a.code AS account_code,
                  p.name AS program_name, g.name AS grant_name
           FROM org_schedule_items s
           LEFT JOIN org_accounts a ON a.id = s.account_id
           LEFT JOIN org_programs p ON p.id = s.program_id
           LEFT JOIN org_grants   g ON g.id = s.grant_id
           WHERE s.org_id=$1 AND s.fiscal_year=$2 AND s.schedule_type=$3
           ORDER BY s.sort_order, s.id`
        : `SELECT s.*, a.name AS account_name, a.code AS account_code,
                  p.name AS program_name, g.name AS grant_name
           FROM org_schedule_items s
           LEFT JOIN org_accounts a ON a.id = s.account_id
           LEFT JOIN org_programs p ON p.id = s.program_id
           LEFT JOIN org_grants   g ON g.id = s.grant_id
           WHERE s.org_id=$1 AND s.fiscal_year=$2
           ORDER BY s.schedule_type, s.sort_order, s.id`;

      const params = scheduleType ? [orgId, fy, scheduleType] : [orgId, fy];
      const { rows } = await pool.query(q, params);
      const allocsByItem = await loadAllocations(pool, rows.map(r => r.id));
      const items = rows.map(r => {
        const item = rowToItem(r);
        item.allocations = allocsByItem.get(String(r.id)) || [];
        return item;
      });
      res.json({ items });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /schedule-items:', e.message);
      res.status(500).json({ error: 'Could not load schedule items' });
    }
  });

  // POST — create item, then recalc
  app.post('/api/organizational/orgs/:slug/schedule-items', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;

    const {
      fiscal_year, label, schedule_type = 'custom',
      account_id, program_id = null, grant_id = null,
      quantity = 1, unit_amount_cents = 0,
      frequency = 'monthly', active_months = null,
      start_month = 1, end_month = 12, notes = null, sort_order = 0,
      policy_start_date = null, policy_end_date = null, named_schedule_id = null,
    } = req.body;

    if (!fiscal_year) return res.status(400).json({ error: 'fiscal_year required' });
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'label required' });
    if (!account_id) return res.status(400).json({ error: 'account_id required' });

    try {

      const { rows } = await pool.query(
        `INSERT INTO org_schedule_items
           (org_id, account_id, program_id, grant_id, named_schedule_id, fiscal_year,
            label, schedule_type, quantity, unit_amount_cents,
            frequency, active_months, start_month, end_month,
            notes, sort_order, policy_start_date, policy_end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [orgId, account_id, program_id, grant_id,
         named_schedule_id ? Number(named_schedule_id) : null,
         fiscal_year, String(label).trim(), schedule_type,
         Number(quantity), Math.round(Number(unit_amount_cents)),
         frequency, active_months, start_month, end_month,
         notes, sort_order,
         policy_start_date || null, policy_end_date || null]
      );

      const item = rows[0];
      await logAudit(pool, {
        orgId: orgId, userId, action: 'create',
        tableName: 'org_schedule_items', recordId: item.id,
        metadata: reqMeta(req),
      });

      let allocations = [];
      if (Array.isArray(req.body.allocations) && req.body.allocations.length > 0) {
        allocations = await replaceAllocations(pool, orgId, item.id, req.body.allocations);
      }

      // Push computed monthly lines into budget_lines (not logged — recalc write)
      const recalc = await recalcScheduleItems(pool, orgId, fiscal_year, item.id);

      // Insurance items with a policy_end_date crossing into next FY spawn
      // sibling rows there automatically (see scheduleCarryforward.js).
      const carryforward = await syncInsuranceCarryforward(pool, orgId, item);

      const out = rowToItem(item);
      out.allocations = allocations;
      res.status(201).json({ item: out, recalc, carryforward });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST /schedule-items:', e.message);
      res.status(500).json({ error: 'Could not create schedule item' });
    }
  });

  // PATCH — update item, then recalc
  app.patch('/api/organizational/orgs/:slug/schedule-items/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const itemId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid id' });

    const allowed = [
      'label','schedule_type','account_id','program_id','grant_id',
      'quantity','unit_amount_cents','frequency','active_months',
      'start_month','end_month','notes','sort_order',
      'policy_start_date','policy_end_date','named_schedule_id',
    ];

    const updates = [];
    const vals = [];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field}=$${vals.length + 3}`);
        vals.push(req.body[field]);
      }
    }
    // The allocations UI fully supersedes the legacy single program_id column —
    // once an item is saved through it, clear the stale column so recalc (which
    // falls back to program_id only when there are no allocation rows) doesn't
    // keep applying an old program after the user cleared/replaced allocations.
    if (Array.isArray(req.body.allocations) && req.body.program_id === undefined) {
      updates.push(`program_id=$${vals.length + 3}`);
      vals.push(null);
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    try {

      const beforeR = await pool.query(
        `SELECT * FROM org_schedule_items WHERE id=$1 AND org_id=$2`,
        [itemId, orgId]
      );
      if (!beforeR.rows.length) return res.status(404).json({ error: 'Item not found' });
      const beforeRow = beforeR.rows[0];

      // A human directly editing an auto-carried-forward row claims it —
      // the carryforward engine will never touch it again after this.
      if (beforeRow.auto_generated) {
        updates.push(`auto_generated=$${vals.length + 3}`);
        vals.push(false);
      }

      updates.push(`updated_at=NOW()`);
      const { rows } = await pool.query(
        `UPDATE org_schedule_items SET ${updates.join(',')}
         WHERE id=$1 AND org_id=$2 RETURNING *`,
        [itemId, orgId, ...vals]
      );
      if (!rows.length) return res.status(404).json({ error: 'Item not found' });

      const item = rows[0];
      await logAudit(pool, {
        orgId: orgId, userId, action: 'update',
        tableName: 'org_schedule_items', recordId: itemId,
        fields: diffFields(beforeRow, item, allowed),
        metadata: reqMeta(req),
      });

      // Replace allocations if provided (mirrors org_personnel_allocations PATCH
      // semantics) — an explicit empty array clears allocations entirely
      // (unrestricted/no program), since program_id was just nulled above too.
      let allocations = (await loadAllocations(pool, [itemId])).get(String(itemId)) || [];
      if (Array.isArray(req.body.allocations)) {
        allocations = await replaceAllocations(pool, orgId, itemId, req.body.allocations);
      }

      const recalc = await recalcScheduleItems(pool, orgId, item.fiscal_year, item.id);

      // Only a true origin item (no origin_item_id of its own) drives
      // carryforward — a claimed sibling doesn't spawn further siblings.
      const carryforward = item.origin_item_id
        ? { touchedFYs: [] }
        : await syncInsuranceCarryforward(pool, orgId, item);

      const out = rowToItem(item);
      out.allocations = allocations;
      res.json({ item: out, recalc, carryforward });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('PATCH /schedule-items:', e.message);
      res.status(500).json({ error: 'Could not update schedule item' });
    }
  });

  // DELETE — remove item and its budget lines (unless overridden)
  app.delete('/api/organizational/orgs/:slug/schedule-items/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const itemId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid id' });

    try {

      // If this is an origin item with auto-carried-forward children in future
      // FYs, remove those too — they exist only because this item did.
      const children = await removeAllCarryforwardChildren(pool, orgId, itemId);
      const childFYs = new Set();
      for (const child of children) {
        const childScope = await removeScheduleItemLines(pool, orgId, child.id);
        await pool.query(`DELETE FROM org_schedule_items WHERE id=$1 AND org_id=$2`, [child.id, orgId]);
        if (childScope && childScope.fiscal_year) childFYs.add(childScope.fiscal_year);
      }

      // Remove sourced budget lines; capture account/FY for sibling re-aggregate.
      const deletedScope = await removeScheduleItemLines(pool, orgId, itemId);

      const { rowCount } = await pool.query(
        `DELETE FROM org_schedule_items WHERE id=$1 AND org_id=$2`,
        [itemId, orgId]
      );
      if (!rowCount) return res.status(404).json({ error: 'Item not found' });

      // After deletion, re-aggregate remaining sibling items for the same account
      // so the budget line correctly reflects their combined total.
      if (deletedScope && deletedScope.fiscal_year) {
        await recalcScheduleItems(pool, orgId, deletedScope.fiscal_year);
      }
      for (const fy of childFYs) {
        await recalcScheduleItems(pool, orgId, fy);
      }

      await logAudit(pool, {
        orgId: orgId, userId, action: 'delete',
        tableName: 'org_schedule_items', recordId: itemId,
        metadata: reqMeta(req),
      });
      res.json({ ok: true });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('DELETE /schedule-items:', e.message);
      res.status(500).json({ error: 'Could not delete schedule item' });
    }
  });

  // POST recalc-all — rebuild all schedule-sourced budget lines for org/year
  app.post('/api/organizational/orgs/:slug/schedule-items/recalc', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = Number.parseInt(String(req.body.fiscal_year || req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy)) return res.status(400).json({ error: 'fiscal_year required' });

    try {

      const result = await recalcScheduleItems(pool, orgId, fy);
      res.json(result);
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST /schedule-items/recalc:', e.message);
      res.status(500).json({ error: 'Recalc failed' });
    }
  });
}

module.exports = { registerOrganizationalScheduleItemRoutes };
