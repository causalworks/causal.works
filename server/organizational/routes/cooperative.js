'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { MEADOWS_LEVEL_LABELS, MEADOWS_LEVELS } = require('../../data/meadows-leverage');
const { PLANETARY_BOUNDARIES, BOUNDARIES_SOURCE_URL } = require('../../data/planetary-boundaries');
const { TURNAROUND_FRAMEWORK } = require('../../data/turnarounds-framework');
const { suggestInterventionFields } = require('../../ai/intervention-suggestion');
const { syncWorkshopToPod } = require('../lib/workshopPodSync');

const TURNAROUND_LABELS = {
  energy: 'Energy',
  food: 'Food systems',
  inequality: 'Inequality',
  poverty: 'Poverty',
  womens_empowerment: 'Women\'s empowerment'
};

const TURNAROUND_COLORS = {
  energy: '#10b981',
  food: '#f59e0b',
  inequality: '#8b5cf6',
  poverty: '#ef4444',
  womens_empowerment: '#ec4899'
};

async function getViewerCoopOrgId(pool, userId, slug) {
  if (!slug) return null;
  const r = await pool.query(
    `SELECT cou.org_id
     FROM org_users cou
     JOIN coop_members co ON co.id = cou.org_id
     WHERE cou.user_id = $1 AND co.slug = $2
     LIMIT 1`,
    [userId, slug]
  );
  return r.rows.length > 0 ? r.rows[0].org_id : null;
}

function registerCooperativeRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess];

  app.get('/api/organizational/cooperative/systems-framework', ...orgAuth, (req, res) => {
    const boundaries = PLANETARY_BOUNDARIES.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      trend: b.trend,
      description: b.description,
      turnaround_ids: b.turnaround_ids || [],
    }));
    res.json({
      boundaries,
      boundaries_source_url: BOUNDARIES_SOURCE_URL,
      turnarounds: TURNAROUND_FRAMEWORK,
      leverage_levels: MEADOWS_LEVELS,
    });
  });

  app.get('/api/organizational/cooperative/members', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const userOrgsR = await pool.query(
        `SELECT org_id FROM org_users WHERE user_id = $1`,
        [userId]
      );
      const viewerOrgIds = userOrgsR.rows.map(r => r.org_id);
      const demoR = await pool.query(
        `SELECT EXISTS (SELECT 1 FROM coop_members WHERE id = ANY($1) AND is_platform_demo) AS in_demo`,
        [viewerOrgIds.length > 0 ? viewerOrgIds : [0]]
      );
      const viewerInDemo = !!demoR.rows[0]?.in_demo;

      const r = await pool.query(
        `SELECT id,
                display_name,
                mission_summary,
                location_general,
                cooperative_turnarounds
         FROM coop_members
         WHERE membership_status = 'active'
           AND id != ALL($1)
           AND is_demo_fixture = $2
           AND (mission_summary IS NOT NULL
                OR location_general IS NOT NULL
                OR size_band IS NOT NULL
                OR cooperative_turnarounds IS NOT NULL)
         ORDER BY display_name ASC`,
        [viewerOrgIds.length > 0 ? viewerOrgIds : [0], viewerInDemo]
      );
      
      const members = r.rows.map(org => ({
        id: org.id,
        display_name: org.display_name,
        mission_summary: org.mission_summary,
        location_general: org.location_general,
        cooperative_turnarounds: (org.cooperative_turnarounds || []).map(t => ({
          value: t,
          label: TURNAROUND_LABELS[t] || t,
          color: TURNAROUND_COLORS[t] || '#6b7280'
        }))
      }));
      
      return res.json({ members });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/members:', e.message);
      return res.status(500).json({ error: 'Could not load cooperative members' });
    }
  });

  app.get('/api/organizational/cooperative/library', ...orgAuth, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT id,
                category,
                title,
                description,
                last_updated_at,
                display_order
         FROM cooperative_library_items
         ORDER BY category, display_order, title`
      );
      
      const grouped = {};
      r.rows.forEach(item => {
        if (!grouped[item.category]) {
          grouped[item.category] = [];
        }
        grouped[item.category].push({
          id: item.id,
          title: item.title,
          description: item.description,
          last_updated_at: item.last_updated_at
        });
      });
      
      return res.json({ library: grouped });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/library:', e.message);
      return res.status(500).json({ error: 'Could not load cooperative library' });
    }
  });

  app.get('/api/organizational/cooperative/library/:id', ...orgAuth, async (req, res, next) => {
    if (req.params.id === 'submissions') return next();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid library item ID' });
    }
    
    try {
      const r = await pool.query(
        `SELECT id,
                category,
                title,
                description,
                body_markdown,
                last_updated_at
         FROM cooperative_library_items
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      
      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Library item not found' });
      }

      return res.json({ item: r.rows[0] });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/library/:id:', e.message);
      return res.status(500).json({ error: 'Could not load library item' });
    }
  });

  app.get('/api/organizational/cooperative/work-library', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = await getViewerCoopOrgId(pool, userId, req.query.org);
      if (!orgId) {
        return res.json({ groups: [] });
      }
      const r = await pool.query(
        `SELECT i.id,
                i.category,
                i.title,
                i.description,
                i.last_updated_at,
                i.display_order,
                i.workshop_id,
                p.name AS workshop_name
         FROM cooperative_work_library_items i
         LEFT JOIN workshop_projects p ON p.id = i.workshop_id
         WHERE i.source_org_id = $1
         ORDER BY p.name NULLS LAST, i.display_order, i.title`,
        [orgId]
      );

      const grouped = {};
      const OTHER_KEY = 'other';
      r.rows.forEach(item => {
        const key = item.workshop_id ? String(item.workshop_id) : OTHER_KEY;
        if (!grouped[key]) {
          grouped[key] = { workshop_id: item.workshop_id || null, workshop_name: item.workshop_name || null, items: [] };
        }
        grouped[key].items.push({
          id: item.id,
          category: item.category,
          title: item.title,
          description: item.description,
          last_updated_at: item.last_updated_at
        });
      });

      return res.json({ groups: Object.values(grouped) });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/work-library:', e.message);
      return res.status(500).json({ error: 'Could not load cooperative work library' });
    }
  });

  app.get('/api/organizational/cooperative/work-library/:id', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid library item ID' });
    }

    try {
      const orgId = await getViewerCoopOrgId(pool, userId, req.query.org);
      const r = await pool.query(
        `SELECT i.id,
                i.category,
                i.title,
                i.description,
                i.body_markdown,
                i.last_updated_at,
                p.name AS workshop_name
         FROM cooperative_work_library_items i
         LEFT JOIN workshop_projects p ON p.id = i.workshop_id
         WHERE i.id = $1 AND i.source_org_id = $2
         LIMIT 1`,
        [id, orgId]
      );

      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Library item not found' });
      }

      return res.json({ item: r.rows[0] });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/work-library/:id:', e.message);
      return res.status(500).json({ error: 'Could not load library item' });
    }
  });

  app.get('/api/organizational/cooperative/workshops', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = await getViewerCoopOrgId(pool, userId, req.query.org);
      if (!orgId) {
        return res.json({ workshops: [] });
      }
      const r = await pool.query(
        `SELECT p.id,
                p.slug,
                p.name,
                p.description,
                p.phase,
                p.e4a_turnarounds,
                p.updated_at,
                (SELECT COUNT(*) FROM workshop_workspaces w WHERE w.project_id = p.id) AS workspace_count
         FROM workshop_projects p
         WHERE p.is_starter = true
            OR EXISTS (
              SELECT 1 FROM cooperative_work_library_items i
              WHERE i.workshop_id = p.id AND i.source_org_id = $1
            )
            OR EXISTS (
              SELECT 1 FROM workshop_space_members m
              JOIN workshop_workspaces w ON w.id = m.space_id
              WHERE w.project_id = p.id AND m.user_id = $2
            )
            OR EXISTS (
              SELECT 1 FROM workshop_space_members m
              JOIN workshop_workspaces w ON w.id = m.space_id
              WHERE w.project_id = p.id AND m.org_id = $1 AND w.space_type = 'org_internal'
            )
         ORDER BY p.updated_at DESC`,
        [orgId, userId]
      );
      return res.json({ workshops: r.rows });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/workshops:', e.message);
      return res.status(500).json({ error: 'Could not load workshops' });
    }
  });

  app.post('/api/organizational/cooperative/workshops', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const turnaroundIds = Array.isArray(req.body?.e4a_turnarounds)
      ? req.body.e4a_turnarounds.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim())
      : [];

    if (!name) return res.status(400).json({ error: 'Name required' });

    try {
      const orgId = await getViewerCoopOrgId(pool, userId, req.query.org);
      if (!orgId) {
        return res.status(403).json({ error: 'Could not resolve your organization' });
      }

      const baseSlug = name.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'workshop';
      const slug = baseSlug + '-' + Date.now().toString(36);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const projectR = await client.query(
          `INSERT INTO workshop_projects (slug, name, description, phase, e4a_turnarounds)
           VALUES ($1, $2, $3, 'research', $4)
           RETURNING id, slug, name, description, phase, e4a_turnarounds, updated_at`,
          [slug, name, description, turnaroundIds.length ? turnaroundIds : null]
        );
        const project = projectR.rows[0];

        const workspaceR = await client.query(
          `INSERT INTO workshop_workspaces (project_id, slug, name, description, space_type, access_scope)
           VALUES ($1, 'main', $2, $3, 'org_internal', 'members_only')
           RETURNING id`,
          [project.id, name, description]
        );
        const workspaceId = workspaceR.rows[0].id;

        await client.query(
          `INSERT INTO workshop_space_members (space_id, user_id, org_id, role)
           VALUES ($1, $2, $3, 'convener')`,
          [workspaceId, userId, orgId]
        );

        await client.query('COMMIT');
        return res.status(201).json({ workshop: project });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('POST /api/organizational/cooperative/workshops:', e.message);
      return res.status(500).json({ error: 'Could not create workshop' });
    }
  });

  app.get('/api/organizational/cooperative/workshops/:id', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid workshop ID' });
    }
    try {
      const orgId = await getViewerCoopOrgId(pool, userId, req.query.org);
      const projectR = await pool.query(
        `SELECT id, slug, name, description, phase, e4a_turnarounds, updated_at
         FROM workshop_projects p
         WHERE id = $1 AND (
           p.is_starter = true
           OR EXISTS (
             SELECT 1 FROM cooperative_work_library_items i
             WHERE i.workshop_id = p.id AND i.source_org_id = $2
           )
           OR EXISTS (
             SELECT 1 FROM workshop_space_members m
             JOIN workshop_workspaces w ON w.id = m.space_id
             WHERE w.project_id = p.id AND m.user_id = $3
           )
           OR EXISTS (
             SELECT 1 FROM workshop_space_members m
             JOIN workshop_workspaces w ON w.id = m.space_id
             WHERE w.project_id = p.id AND m.org_id = $2 AND w.space_type = 'org_internal'
           )
         )
         LIMIT 1`,
        [id, orgId, userId]
      );
      if (projectR.rows.length === 0) {
        return res.status(404).json({ error: 'Workshop not found' });
      }

      const workspacesR = await pool.query(
        `SELECT id, slug, name, description, space_type, access_scope
         FROM workshop_workspaces WHERE project_id = $1 ORDER BY name`,
        [id]
      );

      const workspaceIds = workspacesR.rows.map(w => w.id);
      let documentsByWorkspace = {};
      let membersByWorkspace = {};
      let proposalsByWorkspace = {};
      let threadsByWorkspace = {};
      if (workspaceIds.length > 0) {
        const docsR = await pool.query(
          `SELECT id, workspace_id, title, content, doc_type, e4a_turnarounds, updated_at
           FROM workshop_documents WHERE workspace_id = ANY($1) ORDER BY updated_at DESC`,
          [workspaceIds]
        );
        docsR.rows.forEach(doc => {
          const turnarounds = (doc.e4a_turnarounds || []).map(t => ({
            value: t,
            label: TURNAROUND_LABELS[t] || t,
            color: TURNAROUND_COLORS[t] || '#6b7280'
          }));
          const key = String(doc.workspace_id);
          if (!documentsByWorkspace[key]) documentsByWorkspace[key] = [];
          documentsByWorkspace[key].push({ ...doc, e4a_turnarounds: turnarounds });
        });

        const membersR = await pool.query(
          `SELECT m.id, m.space_id, m.role, m.joined_at,
                  COALESCE(m.display_name, u.email) AS user_email,
                  m.display_email,
                  co.display_name AS org_display_name
           FROM workshop_space_members m
           LEFT JOIN users u ON u.id = m.user_id
           LEFT JOIN coop_members co ON co.id = m.org_id
           WHERE m.space_id = ANY($1) ORDER BY m.joined_at ASC`,
          [workspaceIds]
        );
        membersR.rows.forEach(m => {
          const key = String(m.space_id);
          if (!membersByWorkspace[key]) membersByWorkspace[key] = [];
          membersByWorkspace[key].push(m);
        });

        const proposalsR = await pool.query(
          `SELECT p.id, p.space_id, p.title, p.body_markdown, p.status,
                  p.decision_notes_markdown, p.decided_at, p.created_at,
                  COALESCE(pm.display_name, u.email) AS proposed_by_email,
                  COALESCE(dm.display_name, du.email) AS decided_by_email
           FROM workshop_proposals p
           LEFT JOIN users u ON u.id = p.proposed_by_user_id
           LEFT JOIN users du ON du.id = p.decided_by_user_id
           LEFT JOIN workshop_space_members pm ON pm.space_id = p.space_id AND pm.user_id = p.proposed_by_user_id
           LEFT JOIN workshop_space_members dm ON dm.space_id = p.space_id AND dm.user_id = p.decided_by_user_id
           WHERE p.space_id = ANY($1) ORDER BY p.created_at DESC`,
          [workspaceIds]
        );
        proposalsR.rows.forEach(p => {
          const key = String(p.space_id);
          if (!proposalsByWorkspace[key]) proposalsByWorkspace[key] = [];
          proposalsByWorkspace[key].push(p);
        });

        const threadsR = await pool.query(
          `SELECT t.id, t.workspace_id, t.title, t.created_at,
                  COALESCE(cm.display_name, cu.email) AS created_by_email
           FROM workshop_threads t
           LEFT JOIN users cu ON cu.id = t.created_by_user_id
           LEFT JOIN workshop_space_members cm ON cm.space_id = t.workspace_id AND cm.user_id = t.created_by_user_id
           WHERE t.workspace_id = ANY($1) ORDER BY t.updated_at DESC`,
          [workspaceIds]
        );
        const threadIds = threadsR.rows.map(t => t.id);
        let messagesByThread = {};
        if (threadIds.length > 0) {
          const messagesR = await pool.query(
            `SELECT msg.id, msg.thread_id, msg.content, msg.created_at,
                    COALESCE(msg.display_name, u.email) AS author_email,
                    msg.display_email
             FROM workshop_messages msg
             LEFT JOIN users u ON u.id = msg.created_by_user_id
             WHERE msg.thread_id = ANY($1) ORDER BY msg.created_at ASC`,
            [threadIds]
          );
          messagesR.rows.forEach(m => {
            const key = String(m.thread_id);
            if (!messagesByThread[key]) messagesByThread[key] = [];
            messagesByThread[key].push(m);
          });
        }
        threadsR.rows.forEach(t => {
          const messages = messagesByThread[String(t.id)] || [];
          const key = String(t.workspace_id);
          if (!threadsByWorkspace[key]) threadsByWorkspace[key] = [];
          threadsByWorkspace[key].push({ ...t, reply_count: messages.length, messages });
        });
      }

      const workspaces = workspacesR.rows.map(w => ({
        ...w,
        documents: documentsByWorkspace[String(w.id)] || [],
        members: membersByWorkspace[String(w.id)] || [],
        proposals: proposalsByWorkspace[String(w.id)] || [],
        threads: threadsByWorkspace[String(w.id)] || []
      }));

      return res.json({ workshop: projectR.rows[0], workspaces });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/workshops/:id:', e.message);
      return res.status(500).json({ error: 'Could not load workshop' });
    }
  });

  app.post('/api/organizational/cooperative/workshops/:id/sync-to-pod', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid workshop ID' });
    }
    try {
      const memberR = await pool.query(
        `SELECT 1 FROM workshop_space_members m
         JOIN workshop_workspaces w ON w.id = m.space_id
         WHERE w.project_id = $1 AND m.user_id = $2
         LIMIT 1`,
        [id, userId]
      );
      if (memberR.rows.length === 0) {
        return res.status(403).json({ error: 'Only workshop members can sync this workshop to the pod.' });
      }

      const result = await syncWorkshopToPod(pool, id);
      return res.json(result);
    } catch (e) {
      console.error('POST /api/organizational/cooperative/workshops/:id/sync-to-pod:', e.message);
      return res.status(409).json({ error: e.message || 'Could not sync workshop to pod' });
    }
  });

  app.get('/api/organizational/cooperative/workshops/:id/interventions', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid workshop ID' });
    }
    try {
      const orgId = await getViewerCoopOrgId(pool, userId, req.query.org);
      const projectR = await pool.query(
        `SELECT p.id FROM workshop_projects p
         WHERE p.id = $1 AND (
           p.is_starter = true
           OR EXISTS (
             SELECT 1 FROM cooperative_work_library_items i
             WHERE i.workshop_id = p.id AND i.source_org_id = $2
           )
           OR EXISTS (
             SELECT 1 FROM workshop_space_members m
             JOIN workshop_workspaces w ON w.id = m.space_id
             WHERE w.project_id = p.id AND m.user_id = $3
           )
           OR EXISTS (
             SELECT 1 FROM workshop_space_members m
             JOIN workshop_workspaces w ON w.id = m.space_id
             WHERE w.project_id = p.id AND m.org_id = $2 AND w.space_type = 'org_internal'
           )
         )
         LIMIT 1`,
        [id, orgId, userId]
      );
      if (projectR.rows.length === 0) {
        return res.status(404).json({ error: 'Workshop not found' });
      }

      const r = await pool.query(
        `SELECT iv.id, iv.title, iv.description, iv.leverage_level, iv.turnaround_ids,
                iv.effect_estimate, iv.target_action_id, iv.created_at,
                m.user_id AS proposed_by_user_id,
                COALESCE(m.display_name, u.email) AS proposed_by_name,
                a.turnaround_category AS target_turnaround_category,
                a.boundary_ids AS target_boundary_ids
         FROM workshop_interventions iv
         LEFT JOIN workshop_space_members m ON m.id = iv.proposed_by_member_id
         LEFT JOIN users u ON u.id = m.user_id
         LEFT JOIN actions a ON a.id = iv.target_action_id
         WHERE iv.workshop_project_id = $1
         ORDER BY iv.leverage_level DESC, iv.created_at ASC`,
        [id]
      );

      const viewerRolesR = await pool.query(
        `SELECT m.role
         FROM workshop_space_members m
         JOIN workshop_workspaces w ON w.id = m.space_id
         WHERE w.project_id = $1 AND m.user_id = $2`,
        [id, userId]
      );
      const viewerIsConvener = viewerRolesR.rows.some(row => row.role === 'convener');

      const interventions = r.rows.map(row => {
        const { proposed_by_user_id, ...rest } = row;
        return {
          ...rest,
          leverage_label: MEADOWS_LEVEL_LABELS[row.leverage_level] || null,
          turnaround_ids: (row.turnaround_ids || []).map(t => ({
            value: t,
            label: TURNAROUND_LABELS[t] || t,
            color: TURNAROUND_COLORS[t] || '#6b7280'
          })),
          can_edit: viewerIsConvener || proposed_by_user_id === userId
        };
      });

      return res.json({ interventions });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/workshops/:id/interventions:', e.message);
      return res.status(500).json({ error: 'Could not load interventions' });
    }
  });

  app.post('/api/organizational/cooperative/workshops/:id/interventions', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid workshop ID' });
    }

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const effectEstimate = String(req.body?.effect_estimate || '').trim();
    const leverageLevel = Number(req.body?.leverage_level);
    const turnaroundIds = Array.isArray(req.body?.turnaround_ids)
      ? req.body.turnaround_ids.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim())
      : [];
    const targetActionId = req.body?.target_action_id != null && req.body.target_action_id !== ''
      ? Number(req.body.target_action_id)
      : null;

    if (!title) return res.status(400).json({ error: 'Title required' });
    if (!Number.isInteger(leverageLevel) || leverageLevel < 1 || leverageLevel > 12) {
      return res.status(400).json({ error: 'leverage_level must be an integer between 1 and 12' });
    }
    if (targetActionId != null && (!Number.isInteger(targetActionId) || targetActionId < 1)) {
      return res.status(400).json({ error: 'Invalid target_action_id' });
    }

    try {
      const memberR = await pool.query(
        `SELECT m.id
         FROM workshop_space_members m
         JOIN workshop_workspaces w ON w.id = m.space_id
         WHERE w.project_id = $1 AND m.user_id = $2
         LIMIT 1`,
        [id, userId]
      );
      if (memberR.rows.length === 0) {
        return res.status(403).json({ error: 'Only workshop members can propose interventions' });
      }
      const memberId = memberR.rows[0].id;

      const r = await pool.query(
        `INSERT INTO workshop_interventions
           (workshop_project_id, target_action_id, title, description, leverage_level, turnaround_ids, effect_estimate, proposed_by_member_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, title, description, leverage_level, turnaround_ids, effect_estimate, target_action_id, created_at`,
        [id, targetActionId, title, description, leverageLevel, turnaroundIds.length ? turnaroundIds : null, effectEstimate, memberId]
      );

      const intervention = {
        ...r.rows[0],
        leverage_label: MEADOWS_LEVEL_LABELS[r.rows[0].leverage_level] || null,
        turnaround_ids: (r.rows[0].turnaround_ids || []).map(t => ({
          value: t,
          label: TURNAROUND_LABELS[t] || t,
          color: TURNAROUND_COLORS[t] || '#6b7280'
        }))
      };

      return res.status(201).json({ intervention });
    } catch (e) {
      console.error('POST /api/organizational/cooperative/workshops/:id/interventions:', e.message);
      return res.status(500).json({ error: 'Could not create intervention' });
    }
  });

  app.patch('/api/organizational/cooperative/workshops/:id/interventions/:interventionId', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    const interventionId = Number(req.params.interventionId);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid workshop ID' });
    }
    if (!Number.isInteger(interventionId) || interventionId < 1) {
      return res.status(400).json({ error: 'Invalid intervention ID' });
    }

    try {
      const existingR = await pool.query(
        `SELECT iv.id, m.user_id AS proposed_by_user_id
         FROM workshop_interventions iv
         LEFT JOIN workshop_space_members m ON m.id = iv.proposed_by_member_id
         WHERE iv.id = $1 AND iv.workshop_project_id = $2
         LIMIT 1`,
        [interventionId, id]
      );
      if (existingR.rows.length === 0) {
        return res.status(404).json({ error: 'Intervention not found' });
      }

      const viewerRolesR = await pool.query(
        `SELECT m.role
         FROM workshop_space_members m
         JOIN workshop_workspaces w ON w.id = m.space_id
         WHERE w.project_id = $1 AND m.user_id = $2`,
        [id, userId]
      );
      const viewerIsConvener = viewerRolesR.rows.some(row => row.role === 'convener');
      const isProposer = existingR.rows[0].proposed_by_user_id === userId;
      if (!viewerIsConvener && !isProposer) {
        return res.status(403).json({ error: 'Only the proposer or a workshop convener can edit this intervention' });
      }

      const updates = [];
      const params = [interventionId, id];
      let n = 3;

      if (req.body?.title !== undefined) {
        const title = String(req.body.title || '').trim();
        if (!title) return res.status(400).json({ error: 'Title required' });
        updates.push(`title = $${n++}`);
        params.push(title);
      }
      if (req.body?.description !== undefined) {
        updates.push(`description = $${n++}`);
        params.push(String(req.body.description || '').trim());
      }
      if (req.body?.effect_estimate !== undefined) {
        updates.push(`effect_estimate = $${n++}`);
        params.push(String(req.body.effect_estimate || '').trim());
      }
      if (req.body?.leverage_level !== undefined) {
        const leverageLevel = Number(req.body.leverage_level);
        if (!Number.isInteger(leverageLevel) || leverageLevel < 1 || leverageLevel > 12) {
          return res.status(400).json({ error: 'leverage_level must be an integer between 1 and 12' });
        }
        updates.push(`leverage_level = $${n++}`);
        params.push(leverageLevel);
      }
      if (req.body?.turnaround_ids !== undefined) {
        const turnaroundIds = Array.isArray(req.body.turnaround_ids)
          ? req.body.turnaround_ids.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim())
          : [];
        updates.push(`turnaround_ids = $${n++}`);
        params.push(turnaroundIds.length ? turnaroundIds : null);
      }
      if (req.body?.target_action_id !== undefined) {
        const targetActionId = req.body.target_action_id != null && req.body.target_action_id !== ''
          ? Number(req.body.target_action_id)
          : null;
        if (targetActionId != null && (!Number.isInteger(targetActionId) || targetActionId < 1)) {
          return res.status(400).json({ error: 'Invalid target_action_id' });
        }
        updates.push(`target_action_id = $${n++}`);
        params.push(targetActionId);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const r = await pool.query(
        `UPDATE workshop_interventions
         SET ${updates.join(', ')}
         WHERE id = $1 AND workshop_project_id = $2
         RETURNING id, title, description, leverage_level, turnaround_ids, effect_estimate, target_action_id, created_at`,
        params
      );

      const intervention = {
        ...r.rows[0],
        leverage_label: MEADOWS_LEVEL_LABELS[r.rows[0].leverage_level] || null,
        turnaround_ids: (r.rows[0].turnaround_ids || []).map(t => ({
          value: t,
          label: TURNAROUND_LABELS[t] || t,
          color: TURNAROUND_COLORS[t] || '#6b7280'
        }))
      };

      return res.json({ intervention });
    } catch (e) {
      console.error('PATCH /api/organizational/cooperative/workshops/:id/interventions/:interventionId:', e.message);
      return res.status(500).json({ error: 'Could not update intervention' });
    }
  });

  app.post('/api/organizational/cooperative/workshops/:id/interventions/suggest', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid workshop ID' });
    }
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!title) return res.status(400).json({ error: 'Title required' });

    try {
      const memberR = await pool.query(
        `SELECT m.id
         FROM workshop_space_members m
         JOIN workshop_workspaces w ON w.id = m.space_id
         WHERE w.project_id = $1 AND m.user_id = $2
         LIMIT 1`,
        [id, userId]
      );
      if (memberR.rows.length === 0) {
        return res.status(403).json({ error: 'Only workshop members can use the suggestion tool' });
      }

      const projectR = await pool.query(`SELECT name FROM workshop_projects WHERE id = $1 LIMIT 1`, [id]);
      const targetContext = projectR.rows[0] ? projectR.rows[0].name : null;

      const suggestion = await suggestInterventionFields({ title, description, targetContext });
      return res.json({
        suggested_level: suggestion.suggested_level,
        suggested_label: MEADOWS_LEVEL_LABELS[suggestion.suggested_level] || null,
        rationale: suggestion.rationale,
        suggested_turnaround_ids: suggestion.suggested_turnaround_ids.map(t => ({
          value: t,
          label: TURNAROUND_LABELS[t] || t,
          color: TURNAROUND_COLORS[t] || '#6b7280'
        })),
        effect_estimate: suggestion.effect_estimate
      });
    } catch (e) {
      console.error('POST /api/organizational/cooperative/workshops/:id/interventions/suggest:', e.message);
      return res.status(502).json({ error: 'Could not generate suggestions' });
    }
  });

  app.get('/api/organizational/cooperative/is-cooperative-admin', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const r = await pool.query(`SELECT is_cooperative_admin FROM users WHERE id = $1 LIMIT 1`, [userId]);
      return res.json({ is_cooperative_admin: !!(r.rows[0] && r.rows[0].is_cooperative_admin) });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/is-cooperative-admin:', e.message);
      return res.status(500).json({ error: 'Could not check cooperative admin status' });
    }
  });

  app.get('/api/organizational/cooperative/library/submissions', ...orgAuth, async (req, res) => {
    const status = String(req.query.status || '').trim();
    try {
      const params = [];
      let where = '';
      if (status) {
        params.push(status);
        where = `WHERE s.status = $${params.length}`;
      } else {
        where = `WHERE s.status IN ('submitted', 'under_review')`;
      }
      const r = await pool.query(
        `SELECT s.id,
                s.target_item_id,
                s.category,
                s.title,
                s.description,
                s.body_markdown,
                s.status,
                s.decision_notes,
                s.decided_at,
                s.created_at,
                u.email AS proposed_by_email,
                o.display_name AS source_org_name
         FROM cooperative_library_submissions s
         LEFT JOIN users u ON u.id = s.proposed_by_user_id
         LEFT JOIN coop_members o ON o.id = s.source_org_id
         ${where}
         ORDER BY s.created_at DESC`,
        params
      );
      return res.json({ submissions: r.rows });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/library/submissions:', e.message);
      return res.status(500).json({ error: 'Could not load submissions' });
    }
  });

  app.post('/api/organizational/cooperative/library/submissions', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const targetItemId = body.target_item_id != null ? Number(body.target_item_id) : null;
    const category = String(body.category || '').trim();
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const bodyMarkdown = String(body.body_markdown || '').trim();

    const validCategories = ['chart_of_accounts', 'templates_financial_reports', 'templates_grants', 'templates_board_materials', 'policy_examples', 'methods_notes'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!description) return res.status(400).json({ error: 'description is required' });
    if (!bodyMarkdown) return res.status(400).json({ error: 'body_markdown is required' });
    if (targetItemId != null && (!Number.isInteger(targetItemId) || targetItemId < 1)) {
      return res.status(400).json({ error: 'Invalid target_item_id' });
    }

    try {
      const userOrgR = await pool.query(
        `SELECT org_id FROM org_users WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      const sourceOrgId = userOrgR.rows.length > 0 ? userOrgR.rows[0].org_id : null;

      const r = await pool.query(
        `INSERT INTO cooperative_library_submissions
           (target_item_id, category, title, description, body_markdown, proposed_by_user_id, source_org_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted')
         RETURNING id, target_item_id, category, title, description, status, created_at`,
        [targetItemId, category, title, description, bodyMarkdown, userId, sourceOrgId]
      );
      return res.status(201).json({ submission: r.rows[0] });
    } catch (e) {
      console.error('POST /api/organizational/cooperative/library/submissions:', e.message);
      return res.status(500).json({ error: 'Could not create submission' });
    }
  });

  app.patch('/api/organizational/cooperative/library/submissions/:id', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const decision = String(body.decision || '').trim();

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }
    if (!['approve', 'decline'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "approve" or "decline"' });
    }

    try {
      const adminR = await pool.query(`SELECT is_cooperative_admin FROM users WHERE id = $1 LIMIT 1`, [userId]);
      if (!adminR.rows[0] || !adminR.rows[0].is_cooperative_admin) {
        return res.status(403).json({ error: 'Only cooperative admins can decide submissions' });
      }

      const subR = await pool.query(`SELECT * FROM cooperative_library_submissions WHERE id = $1 LIMIT 1`, [id]);
      if (subR.rows.length === 0) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      const submission = subR.rows[0];
      if (submission.status !== 'submitted' && submission.status !== 'under_review') {
        return res.status(400).json({ error: 'Submission has already been decided' });
      }

      const decisionNotes = body.decision_notes ? String(body.decision_notes).trim() : null;

      if (decision === 'approve') {
        if (submission.target_item_id) {
          await pool.query(
            `UPDATE cooperative_library_items
             SET title = $1, description = $2, body_markdown = $3, category = $4, last_updated_at = NOW()
             WHERE id = $5`,
            [submission.title, submission.description, submission.body_markdown, submission.category, submission.target_item_id]
          );
        } else {
          await pool.query(
            `INSERT INTO cooperative_library_items (category, title, description, body_markdown, display_order, last_updated_at)
             VALUES ($1, $2, $3, $4, 0, NOW())`,
            [submission.category, submission.title, submission.description, submission.body_markdown]
          );
        }
      }

      const r = await pool.query(
        `UPDATE cooperative_library_submissions
         SET status = $1, decision_notes = $2, decided_at = NOW(), decided_by_user_id = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING id, status, decision_notes, decided_at`,
        [decision === 'approve' ? 'promoted' : 'declined', decisionNotes, userId, id]
      );
      return res.json({ submission: r.rows[0] });
    } catch (e) {
      console.error('PATCH /api/organizational/cooperative/library/submissions/:id:', e.message);
      return res.status(500).json({ error: 'Could not decide submission' });
    }
  });

  app.get('/api/organizational/cooperative/work-pool', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const userOrgsR = await pool.query(
        `SELECT org_id FROM org_users WHERE user_id = $1`,
        [userId]
      );
      const viewerOrgIds = userOrgsR.rows.map(r => r.org_id);
      
      const r = await pool.query(
        `SELECT wr.id,
                wr.org_id,
                wr.category,
                wr.title,
                wr.description,
                wr.hours_estimate,
                wr.needed_by,
                wr.status,
                wr.created_at,
                o.display_name as org_name
         FROM cooperative_work_requests wr
         INNER JOIN coop_members o ON o.id = wr.org_id
         WHERE wr.status IN ('open', 'in_progress')
           AND wr.org_id != ALL($1)
         ORDER BY wr.created_at DESC
         LIMIT 50`,
        [viewerOrgIds.length > 0 ? viewerOrgIds : [0]]
      );
      
      return res.json({ work_requests: r.rows });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/work-pool:', e.message);
      return res.status(500).json({ error: 'Could not load work pool' });
    }
  });

  app.get('/api/organizational/cooperative/work-pool/mine', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const userOrgsR = await pool.query(
        `SELECT org_id FROM org_users WHERE user_id = $1`,
        [userId]
      );
      const viewerOrgIds = userOrgsR.rows.map(r => r.org_id);
      
      if (viewerOrgIds.length === 0) {
        return res.json({ work_requests: [] });
      }
      
      const r = await pool.query(
        `SELECT id,
                org_id,
                category,
                title,
                description,
                hours_estimate,
                needed_by,
                status,
                created_at,
                updated_at
         FROM cooperative_work_requests
         WHERE org_id = ANY($1)
         ORDER BY created_at DESC`,
        [viewerOrgIds]
      );
      
      return res.json({ work_requests: r.rows });
    } catch (e) {
      console.error('GET /api/organizational/cooperative/work-pool/mine:', e.message);
      return res.status(500).json({ error: 'Could not load your work requests' });
    }
  });

  app.post('/api/organizational/cooperative/work-pool', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    
    const category = String(body.category || '').trim();
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const hoursEstimate = Number(body.hours_estimate);
    const neededBy = body.needed_by ? new Date(body.needed_by) : null;
    
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    const validCategories = ['bookkeeping', 'grant_writing', '990_prep', 'board_reporting', 'financial_analysis', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }
    if (!Number.isFinite(hoursEstimate) || hoursEstimate <= 0) {
      return res.status(400).json({ error: 'hours_estimate must be a positive number' });
    }
    if (neededBy && Number.isNaN(neededBy.getTime())) {
      return res.status(400).json({ error: 'needed_by must be a valid date' });
    }
    
    try {
      const userOrgR = await pool.query(
        `SELECT org_id FROM org_users WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      if (userOrgR.rows.length === 0) {
        return res.status(400).json({ error: 'You must be a member of an NP workspace to post work requests' });
      }
      const orgId = userOrgR.rows[0].org_id;
      
      const r = await pool.query(
        `INSERT INTO cooperative_work_requests (org_id, category, title, description, hours_estimate, needed_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'open')
         RETURNING id, org_id, category, title, description, hours_estimate, needed_by, status, created_at, updated_at`,
        [orgId, category, title, description, hoursEstimate, neededBy]
      );
      
      return res.status(201).json({ work_request: r.rows[0] });
    } catch (e) {
      console.error('POST /api/organizational/cooperative/work-pool:', e.message);
      return res.status(500).json({ error: 'Could not create work request' });
    }
  });

  app.patch('/api/organizational/cooperative/work-pool/:id', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid work request ID' });
    }
    
    try {
      const userOrgsR = await pool.query(
        `SELECT org_id FROM org_users WHERE user_id = $1`,
        [userId]
      );
      const viewerOrgIds = userOrgsR.rows.map(r => r.org_id);
      
      const checkR = await pool.query(
        `SELECT org_id FROM cooperative_work_requests WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (checkR.rows.length === 0) {
        return res.status(404).json({ error: 'Work request not found' });
      }
      if (!viewerOrgIds.includes(checkR.rows[0].org_id)) {
        return res.status(403).json({ error: 'You can only edit your own organization\'s work requests' });
      }
      
      const updates = [];
      const values = [];
      let paramIndex = 2;
      
      if (body.category !== undefined) {
        const validCategories = ['bookkeeping', 'grant_writing', '990_prep', 'board_reporting', 'financial_analysis', 'other'];
        if (!validCategories.includes(body.category)) {
          return res.status(400).json({ error: 'Invalid category' });
        }
        updates.push(`category = $${paramIndex}`);
        values.push(body.category);
        paramIndex++;
      }
      
      if (body.title !== undefined) {
        if (!String(body.title).trim()) {
          return res.status(400).json({ error: 'title cannot be empty' });
        }
        updates.push(`title = $${paramIndex}`);
        values.push(String(body.title).trim());
        paramIndex++;
      }
      
      if (body.description !== undefined) {
        if (!String(body.description).trim()) {
          return res.status(400).json({ error: 'description cannot be empty' });
        }
        updates.push(`description = $${paramIndex}`);
        values.push(String(body.description).trim());
        paramIndex++;
      }
      
      if (body.hours_estimate !== undefined) {
        const hours = Number(body.hours_estimate);
        if (!Number.isFinite(hours) || hours <= 0) {
          return res.status(400).json({ error: 'hours_estimate must be a positive number' });
        }
        updates.push(`hours_estimate = $${paramIndex}`);
        values.push(hours);
        paramIndex++;
      }
      
      if (body.needed_by !== undefined) {
        const neededBy = body.needed_by ? new Date(body.needed_by) : null;
        if (neededBy && Number.isNaN(neededBy.getTime())) {
          return res.status(400).json({ error: 'needed_by must be a valid date' });
        }
        updates.push(`needed_by = $${paramIndex}`);
        values.push(neededBy);
        paramIndex++;
      }
      
      if (body.status !== undefined) {
        const validStatuses = ['open', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(body.status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        updates.push(`status = $${paramIndex}`);
        values.push(body.status);
        paramIndex++;
      }
      
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      updates.push(`updated_at = NOW()`);
      values.unshift(id);
      
      const r = await pool.query(
        `UPDATE cooperative_work_requests
         SET ${updates.join(', ')}
         WHERE id = $1
         RETURNING id, org_id, category, title, description, hours_estimate, needed_by, status, created_at, updated_at`,
        values
      );
      
      return res.json({ work_request: r.rows[0] });
    } catch (e) {
      console.error('PATCH /api/organizational/cooperative/work-pool/:id:', e.message);
      return res.status(500).json({ error: 'Could not update work request' });
    }
  });

  app.delete('/api/organizational/cooperative/work-pool/:id', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number(req.params.id);
    
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid work request ID' });
    }
    
    try {
      const userOrgsR = await pool.query(
        `SELECT org_id FROM org_users WHERE user_id = $1`,
        [userId]
      );
      const viewerOrgIds = userOrgsR.rows.map(r => r.org_id);
      
      const checkR = await pool.query(
        `SELECT org_id FROM cooperative_work_requests WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (checkR.rows.length === 0) {
        return res.status(404).json({ error: 'Work request not found' });
      }
      if (!viewerOrgIds.includes(checkR.rows[0].org_id)) {
        return res.status(403).json({ error: 'You can only delete your own organization\'s work requests' });
      }
      
      await pool.query(
        `DELETE FROM cooperative_work_requests WHERE id = $1`,
        [id]
      );
      
      return res.json({ success: true });
    } catch (e) {
      console.error('DELETE /api/organizational/cooperative/work-pool/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete work request' });
    }
  });
}

module.exports = { registerCooperativeRoutes };
