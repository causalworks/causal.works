'use strict';

const { complianceItems: sponsorComplianceItems } = require('../lib/sponsorReports');

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { requireWriteAccess, leadMayTouch } = require('../middleware/requireWriteAccess');

function registerComplianceRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/compliance/dashboard', ...orgAuth, async (req, res) => {
    try {
      const orgId = req.orgId;

      const r = await pool.query(
        `SELECT id,
                source,
                template_item_id,
                category,
                title,
                description,
                frequency,
                next_due_date,
                last_completed_date,
                status,
                notes_markdown,
                (SELECT COUNT(*)::int FROM org_documents d WHERE d.obligation_id = org_compliance_obligations.id AND d.archived_at IS NULL) AS document_count
         FROM org_compliance_obligations
         WHERE org_id = $1
         ORDER BY
           CASE status
             WHEN 'overdue' THEN 1
             WHEN 'due_soon' THEN 2
             WHEN 'upcoming' THEN 3
             WHEN 'completed_this_cycle' THEN 4
             WHEN 'not_applicable' THEN 5
           END,
           next_due_date ASC NULLS LAST`,
        [orgId]
      );

      const templateIds = r.rows.filter(row => row.template_item_id).map(row => row.template_item_id);
      let templateData = {};
      if (templateIds.length > 0) {
        const templateR = await pool.query(
          `SELECT id, title, description, guidance_markdown, default_due_pattern
           FROM compliance_template_items
           WHERE id = ANY($1)`,
          [templateIds]
        );
        templateData = templateR.rows.reduce((acc, t) => {
          acc[t.id] = t;
          return acc;
        }, {});
      }

      const dayIso = (ms) => new Date(ms).toISOString().slice(0, 10);
      const todayIso = dayIso(Date.now());
      const in30 = dayIso(Date.now() + 30 * 86400000);
      const in90 = dayIso(Date.now() + 90 * 86400000);
      const effectiveStatus = (o) => {
        if (o.status === 'completed_this_cycle' || o.status === 'not_applicable') return o.status;
        const due = o.next_due_date ? String(o.next_due_date).slice(0, 10) : null;
        if (!due) return o.status;
        if (due < todayIso) return 'overdue';
        return due <= in30 ? 'due_soon' : 'upcoming';
      };

      const comingUp = [];
      const overdue = [];
      const allObligations = [];

      r.rows.forEach(obligation => {
        const enriched = {
          ...obligation,
          stored_status: obligation.status,
          status: effectiveStatus(obligation),
          template_content: templateData[obligation.template_item_id] || null,
          relative_due_date: obligation.next_due_date ? getRelativeTime(obligation.next_due_date) : null
        };
        allObligations.push(enriched);
        if (enriched.status === 'overdue') overdue.push(enriched);
        else if ((enriched.status === 'upcoming' || enriched.status === 'due_soon') && enriched.next_due_date && String(enriched.next_due_date).slice(0, 10) <= in90) comingUp.push(enriched);
      });

      const fsR = await pool.query('SELECT fiscal_sponsorship_mode FROM org_settings WHERE org_id = $1', [orgId]);
      if (fsR.rows[0] && fsR.rows[0].fiscal_sponsorship_mode) {
        const sponsorItems = await sponsorComplianceItems(pool, orgId, String(req.params.slug || ''));
        sponsorItems.forEach((item) => {
          const enriched = { ...item, relative_due_date: item.next_due_date ? getRelativeTime(item.next_due_date) : null };
          if (enriched.status === 'overdue') overdue.push(enriched);
          else if (enriched.status === 'due_soon' || enriched.status === 'upcoming') comingUp.push(enriched);
        });
      }

      return res.json({
        coming_up: comingUp,
        overdue: overdue,
        all_obligations: allObligations
      });
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug/compliance/dashboard:', e.message);
      return res.status(500).json({ error: 'Could not load compliance dashboard' });
    }
  });

  app.get('/api/organizational/orgs/:slug/compliance/obligations/:id', ...orgAuth, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid obligation ID' });
    }

    try {
      const ownedR = await pool.query(
        `SELECT id FROM org_compliance_obligations WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [id, req.orgId]
      );
      if (ownedR.rows.length === 0) {
        return res.status(404).json({ error: 'Obligation not found' });
      }

      const r = await pool.query(
        `SELECT o.*,
                t.title as template_title,
                t.description as template_description,
                t.guidance_markdown as template_guidance,
                t.default_due_pattern as template_due_pattern
         FROM org_compliance_obligations o
         LEFT JOIN compliance_template_items t ON o.template_item_id = t.id
         WHERE o.id = $1
         LIMIT 1`,
        [id]
      );

      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Obligation not found' });
      }

      const historyR = await pool.query(
        `SELECT last_completed_date
         FROM coop_org_compliance_obligations_audit
         WHERE obligation_id = $1
         ORDER BY last_completed_date DESC
         LIMIT 3`,
        [id]
      );

      return res.json({
        obligation: r.rows[0],
        completion_history: historyR.rows
      });
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug/compliance/obligations/:id:', e.message);
      return res.status(500).json({ error: 'Could not load obligation detail' });
    }
  });

  app.post('/api/organizational/orgs/:slug/compliance/obligations', ...orgAuth, requireWriteAccess('compliance'), async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const title = String(body.title || '').trim();
    const description = body.description ? String(body.description).trim() : null;
    const category = String(body.category || '').trim();
    const frequency = String(body.frequency || '').trim();
    const dueDate = body.next_due_date ? new Date(body.next_due_date) : null;
    const notes = body.notes_markdown ? String(body.notes_markdown).trim() : null;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    if (!frequency) {
      return res.status(400).json({ error: 'frequency is required' });
    }

    const validFrequencies = ['annual', 'quarterly', 'monthly', 'one_time', 'deadline_driven'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency' });
    }

    if (dueDate && Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({ error: 'next_due_date must be a valid date' });
    }

    try {
      const orgId = req.orgId;

      const r = await pool.query(
        `INSERT INTO org_compliance_obligations (org_id, source, category, title, description, frequency, next_due_date, status, notes_markdown)
         VALUES ($1, 'org_extension', $2, $3, $4, $5, $6, 'upcoming', $7)
         RETURNING *`,
        [orgId, category, title, description, frequency, dueDate, notes]
      );

      return res.status(201).json({ obligation: r.rows[0] });
    } catch (e) {
      console.error('POST /api/organizational/orgs/:slug/compliance/obligations:', e.message);
      return res.status(500).json({ error: 'Could not create obligation' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/compliance/obligations/:id', ...orgAuth, requireWriteAccess('compliance'), async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid obligation ID' });
    }

    try {
      const ownedR = await pool.query(
        `SELECT id FROM org_compliance_obligations WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [id, req.orgId]
      );
      if (ownedR.rows.length === 0) {
        return res.status(404).json({ error: 'Obligation not found' });
      }

      const updates = [];
      const values = [];
      let paramIndex = 2;

      if (body.next_due_date !== undefined) {
        const dueDate = body.next_due_date ? new Date(body.next_due_date) : null;
        if (dueDate && Number.isNaN(dueDate.getTime())) {
          return res.status(400).json({ error: 'next_due_date must be a valid date' });
        }
        updates.push(`next_due_date = $${paramIndex}`);
        values.push(dueDate);
        paramIndex++;
      }

      if (body.notes_markdown !== undefined) {
        updates.push(`notes_markdown = $${paramIndex}`);
        values.push(body.notes_markdown ? String(body.notes_markdown).trim() : null);
        paramIndex++;
      }

      if (body.status !== undefined) {
        const validStatuses = ['upcoming', 'due_soon', 'overdue', 'completed_this_cycle', 'not_applicable'];
        if (!validStatuses.includes(body.status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        updates.push(`status = $${paramIndex}::compliance_obligation_status`);
        values.push(body.status);
        
        if (body.status === 'completed_this_cycle') {
          updates.push(`last_completed_date = NOW()`);
        }
        paramIndex++;
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.unshift(id);

      const r = await pool.query(
        `UPDATE org_compliance_obligations
         SET ${updates.join(', ')}
         WHERE id = $1
         RETURNING *`,
        values
      );

      return res.json({ obligation: r.rows[0] });
    } catch (e) {
      console.error('PATCH /api/organizational/orgs/:slug/compliance/obligations/:id:', e.message);
      return res.status(500).json({ error: 'Could not update obligation' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/compliance/obligations/:id', ...orgAuth, requireWriteAccess('compliance'), async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid obligation ID' });
    }

    try {
      const checkR = await pool.query(
        `SELECT source FROM org_compliance_obligations WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [id, req.orgId]
      );
      if (checkR.rows.length === 0) {
        return res.status(404).json({ error: 'Obligation not found' });
      }
      if (checkR.rows[0].source !== 'org_extension') {
        return res.status(403).json({ error: 'Base template items can only be marked as not applicable, not deleted' });
      }

      await pool.query(
        `DELETE FROM org_compliance_obligations WHERE id = $1`,
        [id]
      );

      return res.json({ success: true });
    } catch (e) {
      console.error('DELETE /api/organizational/orgs/:slug/compliance/obligations/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete obligation' });
    }
  });

  app.get('/api/organizational/orgs/:slug/compliance/templates', ...orgAuth, async (req, res) => {
    try {
      const orgId = req.orgId;

      const orgR = await pool.query(
        `SELECT entity_classification, fiscal_sponsorship_mode, federal_grant_recipient, has_lobbying_activity, has_political_electoral_activity
         FROM org_settings
         WHERE org_id = $1
         LIMIT 1`,
        [orgId]
      );
      if (orgR.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const org = orgR.rows[0];
      const applicableTypes = [];

      if (org.entity_classification === '501(c)(3)') applicableTypes.push('501c3');
      if (org.entity_classification === '501(c)(4)') applicableTypes.push('501c4');
      if (org.fiscal_sponsorship_mode) applicableTypes.push('fiscal_sponsor');
      if (org.federal_grant_recipient) applicableTypes.push('federal_grantee');
      if (applicableTypes.length === 0) applicableTypes.push('501c3');

      const r = await pool.query(
        `SELECT id, category, title, description, frequency, default_due_pattern, guidance_markdown, display_order
         FROM compliance_template_items
         WHERE applies_to_org_type && $1
         ORDER BY category, display_order, title`,
        [applicableTypes]
      );

      return res.json({ templates: r.rows });
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug/compliance/templates:', e.message);
      return res.status(500).json({ error: 'Could not load templates' });
    }
  });
}

function getRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    if (absDays === 0) return 'Due today';
    if (absDays === 1) return '1 day overdue';
    return `${absDays} days overdue`;
  } else if (diffDays === 0) {
    return 'Due today';
  } else if (diffDays === 1) {
    return 'Due tomorrow';
  } else if (diffDays <= 7) {
    return `Due in ${diffDays} days`;
  } else if (diffDays <= 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Due in ${weeks} week${weeks > 1 ? 's' : ''}`;
  } else {
    const months = Math.floor(diffDays / 30);
    return `Due in ${months} month${months > 1 ? 's' : ''}`;
  }
}

module.exports = { registerComplianceRoutes };
