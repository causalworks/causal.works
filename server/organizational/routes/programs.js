'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { getProgramUsage } = require('../lib/programUsage');
const { previewRecode, executeRecode } = require('../lib/programRecode');
const { logAudit, reqMeta } = require('../lib/auditLog');

const NAME_MAX = 300;
const DESC_MAX = 8000;
const CODE_MAX = 64;

function rowToProgram(row) {
  if (!row) return null;
  const isActivity = row.parent_id != null;
  return {
    id: row.id,
    org_id: row.org_id,
    code: row.code || null,
    name: row.name,
    parent_id: row.parent_id != null ? row.parent_id : null,
    parent_name: row.parent_name || null,
    is_default: !!row.is_default,
    is_active: !!row.active,
    dimension: isActivity ? 'activity' : 'program',
    // Backward-compatible field for existing UI callers.
    active: !!row.active,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function registerOrganizationalProgramRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const npAdmin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  app.get('/api/organizational/orgs/:slug/programs', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const dimension = String(req.query.dimension || '')
      .trim()
      .toLowerCase();
    const parentIdRaw = req.query.parent_id;
    try {
      const conds = ['p.org_id = $1'];
      const params = [orgId];
      let i = 2;

      if (dimension) {
        if (dimension !== 'program' && dimension !== 'activity') {
          return res.status(400).json({ error: 'dimension must be program or activity' });
        }
        if (dimension === 'program') conds.push('p.parent_id IS NULL');
        else conds.push('p.parent_id IS NOT NULL');
      }

      if (parentIdRaw !== undefined && parentIdRaw !== null && String(parentIdRaw).trim() !== '') {
        const parentId = Number.parseInt(String(parentIdRaw), 10);
        if (!Number.isInteger(parentId) || parentId < 1) {
          return res.status(400).json({ error: 'parent_id must be a positive integer' });
        }
        conds.push(`p.parent_id = $${i}`);
        params.push(parentId);
        i += 1;
      }

      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const r = await pool.query(
        `SELECT
           p.id, p.org_id, p.code, p.name, p.description, p.active, p.parent_id, p.is_default,
           p.created_at, p.updated_at, parent.name AS parent_name
         FROM org_programs p
         LEFT JOIN org_programs parent ON parent.id = p.parent_id
         ${where}
         ORDER BY p.parent_id NULLS FIRST, p.code ASC NULLS LAST, lower(p.name) ASC, p.id ASC`,
        params
      );
      const meta = await pool.query(
        `SELECT MAX(p2.updated_at) AS programs_last_updated_at
         FROM org_programs p2
         WHERE p2.org_id = $1`,
        [orgId]
      );
      return res.json({
        programs: r.rows.map(rowToProgram),
        programs_last_updated_at: meta.rows[0] && meta.rows[0].programs_last_updated_at,
      });
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug/programs:', e.message);
      return res.status(500).json({ error: 'Could not load programs' });
    }
  });

  app.post('/api/organizational/orgs/:slug/programs', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const name = String(body.name ?? '').trim();
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (name.length > NAME_MAX) {
      return res.status(400).json({ error: `name must be at most ${NAME_MAX} characters` });
    }

    const description =
      body.description !== undefined && body.description !== null
        ? String(body.description).slice(0, DESC_MAX)
        : '';
    const code =
      body.code !== undefined && body.code !== null && String(body.code).trim() !== ''
        ? String(body.code).trim().slice(0, CODE_MAX)
        : null;
    const active =
      body.active === false || body.active === 'false' || body.active === 0 ? false : true;
    let parentId = null;
    if (body.parent_id !== undefined && body.parent_id !== null && body.parent_id !== '') {
      parentId = Number.parseInt(String(body.parent_id), 10);
      if (!Number.isInteger(parentId) || parentId < 1) {
        return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
      }
    }
    if (body.is_default === true || body.is_default === 'true' || body.is_default === 1) {
      return res.status(400).json({ error: 'is_default cannot be set when creating programs' });
    }

    try {
      if (parentId != null) {
        const p = await pool.query(
          `SELECT id, parent_id FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [parentId, orgId]
        );
        if (p.rows.length === 0) {
          return res.status(400).json({ error: 'parent_id is not a program in this workspace' });
        }
        if (p.rows[0].parent_id != null) {
          return res.status(400).json({ error: 'parent_id must point to a top-level program' });
        }
      }

      const ins = await pool.query(
        `INSERT INTO org_programs (org_id, code, name, description, active, parent_id, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE)
         RETURNING id, org_id, code, name, description, active, parent_id, is_default, created_at, updated_at`,
        [orgId, code, name, description, active, parentId]
      );
      return res.status(201).json({ program: rowToProgram(ins.rows[0]) });
    } catch (e) {
      console.error('POST /api/organizational/orgs/:slug/programs:', e.message);
      return res.status(500).json({ error: 'Could not create program' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/programs/:id', ...npAdmin, async (req, res) => {
    const programId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(programId) || programId < 1) {
      return res.status(400).json({ error: 'Invalid program id' });
    }
    const orgId = req.orgId;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    try {
      const existing = await pool.query(
        `SELECT * FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [programId, orgId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Program not found' });
      }

      const cur = existing.rows[0];
      let name = cur.name;
      let description = cur.description;
      let active = !!cur.active;
      let parentId = cur.parent_id;
      let code = cur.code || null;

      if (body.name !== undefined) {
        const v = String(body.name ?? '').trim();
        if (!v) return res.status(400).json({ error: 'name cannot be empty' });
        if (v.length > NAME_MAX) {
          return res.status(400).json({ error: `name must be at most ${NAME_MAX} characters` });
        }
        name = v;
      }
      if (body.description !== undefined) {
        description =
          body.description === null ? '' : String(body.description).slice(0, DESC_MAX);
      }
      if (body.active !== undefined) {
        active = !(body.active === false || body.active === 'false' || body.active === 0);
      }
      if (body.code !== undefined) {
        code =
          body.code === null || String(body.code).trim() === ''
            ? null
            : String(body.code).trim().slice(0, CODE_MAX);
      }
      if (body.parent_id !== undefined) {
        if (body.parent_id === null || body.parent_id === '') {
          parentId = null;
        } else {
          const n = Number.parseInt(String(body.parent_id), 10);
          if (!Number.isInteger(n) || n < 1) {
            return res.status(400).json({ error: 'parent_id must be a positive integer or null' });
          }
          parentId = n;
        }
      }
      if (body.is_default !== undefined) {
        return res.status(400).json({ error: 'is_default cannot be modified via this endpoint' });
      }
      if (cur.is_default && !active) {
        return res.status(400).json({ error: 'Default programs cannot be deactivated' });
      }

      // A program/activity with real recorded data (budget lines, actuals, ledger postings,
      // allocations, etc.) can't be deactivated -- doing so would hide history someone still
      // needs to see -- and can only be renamed otherwise, not reparented or re-coded. Diffed
      // against `cur` rather than checked by body-key presence, so re-submitting the edit form
      // with unchanged fields doesn't trip this. Reactivating (active: true) is always allowed
      // regardless of usage, since it doesn't lose anything.
      const noun = cur.parent_id != null ? 'activity' : 'program';
      const attemptingDeactivate = !!cur.active && !active;
      const otherFieldsChanged =
        description !== (cur.description || '') ||
        code !== (cur.code || null) ||
        Number(parentId || 0) !== Number(cur.parent_id || 0);
      if (attemptingDeactivate || otherFieldsChanged) {
        const usage = await getProgramUsage(pool, orgId, programId);
        if (usage.hasUsage) {
          const msg = attemptingDeactivate
            ? `This ${noun} has recorded data (${usage.categories.join(', ')}) and cannot be deactivated. Move its data to another ${noun} first, or leave it active.`
            : `This ${noun} has recorded data (${usage.categories.join(', ')}) -- only its name can be changed. Move its data to another ${noun} first if you need to change anything else.`;
          return res.status(400).json({ error: msg, code: 'program_has_usage' });
        }
      }

      const reparenting = Number(cur.parent_id || 0) !== Number(parentId || 0);
      if (reparenting) {
        const childCount = await pool.query(
          `SELECT COUNT(*)::int AS n FROM org_programs WHERE org_id = $1 AND parent_id = $2`,
          [orgId, programId]
        );
        if ((childCount.rows[0] && childCount.rows[0].n) > 0) {
          return res.status(400).json({ error: 'Cannot change parent_id while this program has activities' });
        }
      }
      if (parentId != null) {
        if (parentId === programId) {
          return res.status(400).json({ error: 'parent_id cannot equal id' });
        }
        const p = await pool.query(
          `SELECT id, parent_id FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [parentId, orgId]
        );
        if (p.rows.length === 0) {
          return res.status(400).json({ error: 'parent_id is not a program in this workspace' });
        }
        if (p.rows[0].parent_id != null) {
          return res.status(400).json({ error: 'parent_id must point to a top-level program' });
        }
      }

      const up = await pool.query(
        `UPDATE org_programs
         SET code = $1,
             name = $2,
             description = $3,
             active = $4,
             parent_id = $5,
             updated_at = NOW()
         WHERE id = $6 AND org_id = $7
         RETURNING id, org_id, code, name, description, active, parent_id, is_default, created_at, updated_at`,
        [code, name, description, active, parentId, programId, orgId]
      );
      return res.json({ program: rowToProgram(up.rows[0]) });
    } catch (e) {
      console.error('PATCH /api/organizational/orgs/:slug/programs/:id:', e.message);
      return res.status(500).json({ error: 'Could not update program' });
    }
  });

  // Shared validation for both recode endpoints: loads source + target rows, checks same org,
  // different id, same dimension, both active, and (for activities) the same parent -- required
  // because org_budget_lines' `program_id` column holds the parent and is left untouched when
  // only `activity_id` is recoded, so a cross-parent activity move would leave that column
  // pointing at the wrong parent. See programRecode.js's file header for the fuller rationale.
  async function loadRecodePair(orgId, sourceId, targetId) {
    if (!Number.isInteger(targetId) || targetId < 1) {
      return { error: 'target_program_id must be a positive integer' };
    }
    if (targetId === sourceId) {
      return { error: 'Source and target must be different' };
    }
    const r = await pool.query(
      `SELECT id, parent_id, active, name FROM org_programs WHERE org_id = $1 AND id = ANY($2::int[])`,
      [orgId, [sourceId, targetId]]
    );
    const source = r.rows.find((x) => x.id === sourceId);
    const target = r.rows.find((x) => x.id === targetId);
    if (!source) return { error: 'Source program not found' };
    if (!target) return { error: 'target_program_id is not a program/activity in this workspace' };
    const isActivity = source.parent_id != null;
    if (isActivity !== (target.parent_id != null)) {
      return { error: 'Source and target must both be programs, or both be activities' };
    }
    if (isActivity && Number(source.parent_id) !== Number(target.parent_id)) {
      return { error: 'Activities can only be recoded to another activity under the same parent program' };
    }
    if (!target.active) {
      return { error: 'Target must be active' };
    }
    return { source, target, isActivity };
  }

  app.get('/api/organizational/orgs/:slug/programs/:id/recode-preview', ...npAdmin, async (req, res) => {
    const programId = Number.parseInt(String(req.params.id || ''), 10);
    const targetId = Number.parseInt(String(req.query.target_program_id || ''), 10);
    if (!Number.isInteger(programId) || programId < 1) {
      return res.status(400).json({ error: 'Invalid program id' });
    }
    const orgId = req.orgId;
    try {
      const pair = await loadRecodePair(orgId, programId, targetId);
      if (pair.error) return res.status(400).json({ error: pair.error });
      const preview = await previewRecode(pool, orgId, programId, targetId, pair.isActivity);
      return res.json(preview);
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug/programs/:id/recode-preview:', e.message);
      return res.status(500).json({ error: 'Could not preview recode' });
    }
  });

  app.post('/api/organizational/orgs/:slug/programs/:id/recode', ...npAdmin, async (req, res) => {
    const programId = Number.parseInt(String(req.params.id || ''), 10);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const targetId = Number.parseInt(String(body.target_program_id || ''), 10);
    if (!Number.isInteger(programId) || programId < 1) {
      return res.status(400).json({ error: 'Invalid program id' });
    }
    const orgId = req.orgId;
    const userId = req.user && req.user.id;
    let client;
    try {
      const pair = await loadRecodePair(orgId, programId, targetId);
      if (pair.error) return res.status(400).json({ error: pair.error });

      // Re-check conflicts server-side even though the UI already ran the preview -- data can
      // change between the two calls, and this is the only check that actually blocks execution.
      const preview = await previewRecode(pool, orgId, programId, targetId, pair.isActivity);
      if (preview.hasConflicts) {
        return res.status(409).json({
          error: 'Some rows would collide with existing data on the target and were not moved. Resolve the conflicts (edit or remove one side) and try again.',
          code: 'recode_conflicts',
          categories: preview.categories,
        });
      }
      if (preview.totalRecodable === 0 && preview.configRefs.length === 0) {
        return res.status(400).json({ error: 'Nothing to recode -- this program/activity has no recodable data.' });
      }

      client = await pool.connect();
      await client.query('BEGIN');
      const counts = await executeRecode(client, orgId, programId, targetId, pair.isActivity);
      await client.query('COMMIT');

      // org_audit_log.action is CHECK-constrained to create/update/delete (migration 088) -- no
      // 'recode' value exists, so this logs as an 'update' with the recode shape in metadata.
      logAudit(pool, {
        orgId,
        userId,
        action: 'update',
        tableName: 'org_programs',
        recordId: programId,
        fields: [{ fieldName: 'recode_target', oldValue: pair.source.name, newValue: pair.target.name }],
        metadata: { ...reqMeta(req), operation: 'recode', counts },
      }).catch(() => {});

      return res.json({ ok: true, source: pair.source.name, target: pair.target.name, counts });
    } catch (e) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      }
      if (e.code === 'CA001') {
        return res.status(400).json({ error: e.message, code: 'fiscal_year_locked' });
      }
      console.error('POST /api/organizational/orgs/:slug/programs/:id/recode:', e.message);
      return res.status(500).json({ error: 'Could not recode' });
    } finally {
      if (client) client.release();
    }
  });
}

module.exports = { registerOrganizationalProgramRoutes };
