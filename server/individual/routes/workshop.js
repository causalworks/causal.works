'use strict';

const { requireAuth } = require('../../auth');

function registerWorkshopRoutes(app, pool) {

  app.get('/api/workshop/projects', requireAuth(pool), async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT
           p.slug, p.name, p.description, p.phase,
           COUNT(w.id)::int AS workspace_count
         FROM workshop_projects p
         LEFT JOIN workshop_workspaces w ON w.project_id = p.id
         GROUP BY p.id, p.slug, p.name, p.description, p.phase
         ORDER BY p.updated_at DESC`
      );
      res.json({ projects: r.rows || [] });
    } catch (e) {
      console.error('❌ GET /api/workshop/projects:', e.message);
      res.status(500).json({ error: 'Could not load projects', projects: [] });
    }
  });

  app.get('/api/workshop/projects/:slug', requireAuth(pool), async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(400).json({ error: 'Missing slug' });
    try {
      const pRes = await pool.query(
        `SELECT id, slug, name, description, phase
         FROM workshop_projects
         WHERE slug = $1
         LIMIT 1`,
        [slug]
      );
      if (!pRes.rows.length) return res.status(404).json({ error: 'Project not found' });
      const project = pRes.rows[0];

      const wRes = await pool.query(
        `SELECT
           w.id,
           w.slug,
           w.name,
           w.description,
           COUNT(d.id)::int AS document_count,
           GREATEST(
             COALESCE(MAX(d.updated_at), w.updated_at),
             COALESCE(MAX(m.created_at), w.updated_at)
           ) AS last_activity_at
         FROM workshop_workspaces w
         LEFT JOIN workshop_documents d ON d.workspace_id = w.id
         LEFT JOIN workshop_threads t ON t.workspace_id = w.id
         LEFT JOIN workshop_messages m ON m.thread_id = t.id
         WHERE w.project_id = $1
         GROUP BY w.id, w.slug, w.name, w.description, w.updated_at
         ORDER BY w.created_at ASC`,
        [project.id]
      );

      res.json({ project: { ...project, workspaces: wRes.rows || [] } });
    } catch (e) {
      console.error('❌ GET /api/workshop/projects/:slug:', e.message);
      res.status(500).json({ error: 'Could not load project' });
    }
  });

  app.get('/api/workshop/workspaces/:id', requireAuth(pool), async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid workspace id' });
    try {
      const wsRes = await pool.query(
        `SELECT id, slug, name, description, space_type, e4a_turnarounds, access_scope
         FROM workshop_workspaces
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      if (!wsRes.rows.length) return res.status(404).json({ error: 'Workspace not found' });
      const workspace = wsRes.rows[0];

      const docsRes = await pool.query(
        `SELECT
           d.id,
           d.title,
           d.updated_at,
           COALESCE(u.email, '') AS updated_by_email
         FROM workshop_documents d
         LEFT JOIN users u ON u.id = d.updated_by_user_id
         WHERE d.workspace_id = $1
         ORDER BY d.updated_at DESC`,
        [id]
      );

      const threadsRes = await pool.query(
        `SELECT
           t.id,
           t.title,
           COUNT(m.id)::int AS reply_count,
           (
             SELECT SUBSTRING(mm.content FROM 1 FOR 120)
             FROM workshop_messages mm
             WHERE mm.thread_id = t.id
             ORDER BY mm.created_at DESC
             LIMIT 1
           ) AS latest_message_preview
         FROM workshop_threads t
         LEFT JOIN workshop_messages m ON m.thread_id = t.id
         WHERE t.workspace_id = $1
         GROUP BY t.id, t.title
         ORDER BY t.created_at DESC`,
        [id]
      );

      const threadIds = (threadsRes.rows || []).map((t) => Number(t.id));
      let messagesByThread = {};
      if (threadIds.length) {
        const msgsRes = await pool.query(
          `SELECT
             m.id,
             m.thread_id,
             COALESCE(u.email, '') AS author_email,
             m.created_at,
             m.content
           FROM workshop_messages m
           LEFT JOIN users u ON u.id = m.created_by_user_id
           WHERE m.thread_id = ANY($1::int[])
           ORDER BY m.created_at ASC`,
          [threadIds]
        );
        messagesByThread = (msgsRes.rows || []).reduce((acc, m) => {
          const tid = Number(m.thread_id);
          if (!acc[tid]) acc[tid] = [];
          acc[tid].push({
            id: Number(m.id),
            author_email: m.author_email,
            created_at: m.created_at,
            content: m.content,
          });
          return acc;
        }, {});
      }

      const threads = (threadsRes.rows || []).map((t) => ({
        id: Number(t.id),
        title: t.title,
        reply_count: Number(t.reply_count) || 0,
        latest_message_preview: t.latest_message_preview || '',
        messages: messagesByThread[Number(t.id)] || [],
      }));

      res.json({
        workspace: {
          id: Number(workspace.id),
          slug: workspace.slug,
          name: workspace.name,
          description: workspace.description,
          documents: (docsRes.rows || []).map((d) => ({
            id: Number(d.id),
            title: d.title,
            updated_at: d.updated_at,
            updated_by_email: d.updated_by_email,
          })),
          threads,
        },
      });
    } catch (e) {
      console.error('❌ GET /api/workshop/workspaces/:id:', e.message);
      res.status(500).json({ error: 'Could not load workspace' });
    }
  });

  app.get('/api/workshop/documents/:id', requireAuth(pool), async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid document id' });
    try {
      const r = await pool.query(
        `SELECT
           d.id,
           d.title,
           d.content,
           d.updated_at,
           COALESCE(u.email, '') AS updated_by_email
         FROM workshop_documents d
         LEFT JOIN users u ON u.id = d.updated_by_user_id
         WHERE d.id = $1
         LIMIT 1`,
        [id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Document not found' });
      res.json({ document: r.rows[0] });
    } catch (e) {
      console.error('❌ GET /api/workshop/documents/:id:', e.message);
      res.status(500).json({ error: 'Could not load document' });
    }
  });

  app.put('/api/workshop/documents/:id', requireAuth(pool), async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid document id' });
    const userId = req.user.user_id ?? req.user.id;
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '');
    if (!title) return res.status(400).json({ error: 'Title required' });
    try {
      const r = await pool.query(
        `UPDATE workshop_documents d
         SET title = $1,
             content = $2,
             updated_by_user_id = $3
         FROM users u
         WHERE d.id = $4
           AND u.id = $3
         RETURNING
           d.id,
           d.title,
           d.content,
           d.updated_at,
           u.email AS updated_by_email`,
        [title, content, userId, id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Document not found' });
      res.json({ document: r.rows[0] });
    } catch (e) {
      console.error('❌ PUT /api/workshop/documents/:id:', e.message);
      res.status(500).json({ error: 'Could not update document' });
    }
  });

  app.post('/api/workshop/documents', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const workspaceId = Number.parseInt(req.body?.workspace_id, 10);
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '');
    if (!Number.isInteger(workspaceId) || workspaceId < 1) return res.status(400).json({ error: 'Invalid workspace_id' });
    if (!title) return res.status(400).json({ error: 'Title required' });
    try {
      const r = await pool.query(
        `INSERT INTO workshop_documents
           (workspace_id, title, content, created_by_user_id, updated_by_user_id)
         SELECT $1, $2, $3, $4, $4
         FROM users u
         WHERE u.id = $4
         RETURNING
           id, title, content, updated_at, updated_by_user_id`,
        [workspaceId, title, content, userId]
      );
      if (!r.rows.length) return res.status(500).json({ error: 'Could not create document' });
      const doc = r.rows[0];
      const emailRes = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
      res.json({
        document: {
          ...doc,
          updated_by_email: emailRes.rows[0]?.email || '',
        },
      });
    } catch (e) {
      console.error('❌ POST /api/workshop/documents:', e.message);
      res.status(500).json({ error: 'Could not create document' });
    }
  });

  app.post('/api/workshop/threads', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const workspaceId = Number.parseInt(req.body?.workspace_id, 10);
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '');
    if (!Number.isInteger(workspaceId) || workspaceId < 1) return res.status(400).json({ error: 'Invalid workspace_id' });
    if (!title) return res.status(400).json({ error: 'Title required' });
    if (!content) return res.status(400).json({ error: 'First message content required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tr = await client.query(
        `INSERT INTO workshop_threads (workspace_id, title, created_by_user_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [workspaceId, title, userId]
      );
      const threadId = tr.rows[0]?.id;
      if (!threadId) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: 'Could not create thread' });
      }
      await client.query(
        `INSERT INTO workshop_messages (thread_id, content, created_by_user_id)
         VALUES ($1, $2, $3)`,
        [threadId, content, userId]
      );
      await client.query('COMMIT');
      return res.status(201).json({ thread: { id: Number(threadId) } });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('❌ POST /api/workshop/threads:', e.message);
      return res.status(500).json({ error: 'Could not create thread' });
    } finally {
      client.release();
    }
  });

  app.post('/api/workshop/threads/:id/messages', requireAuth(pool), async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const threadId = Number.parseInt(req.params.id, 10);
    const content = String(req.body?.content || '').trim();
    if (!Number.isInteger(threadId) || threadId < 1) return res.status(400).json({ error: 'Invalid thread id' });
    if (!content) return res.status(400).json({ error: 'Message content required' });
    try {
      await pool.query(
        `INSERT INTO workshop_messages (thread_id, content, created_by_user_id)
         VALUES ($1, $2, $3)`,
        [threadId, content, userId]
      );
      res.status(201).json({ ok: true });
    } catch (e) {
      console.error('❌ POST /api/workshop/threads/:id/messages:', e.message);
      res.status(500).json({ error: 'Could not add message' });
    }
  });

  app.get('/api/workshop/spaces/:id/members', requireAuth(pool), async (req, res) => {
    const spaceId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(spaceId) || spaceId < 1) return res.status(400).json({ error: 'Invalid space id' });
    try {
      const r = await pool.query(
        `SELECT
           m.id, m.user_id, m.role, m.joined_at,
           u.email AS user_email,
           COALESCE(no.slug, '') AS org_slug
         FROM workshop_space_members m
         LEFT JOIN users u ON u.id = m.user_id
         LEFT JOIN coop_members no ON no.id = m.org_id
         WHERE m.space_id = $1
         ORDER BY m.joined_at DESC`,
        [spaceId]
      );
      res.json({ members: r.rows || [] });
    } catch (e) {
      console.error('❌ GET /api/workshop/spaces/:id/members:', e.message);
      res.status(500).json({ error: 'Could not load space members', members: [] });
    }
  });

  app.post('/api/workshop/spaces/:id/members', requireAuth(pool), async (req, res) => {
    const spaceId = Number.parseInt(req.params.id, 10);
    const userId = Number.parseInt(req.body?.user_id, 10);
    const role = String(req.body?.role || 'participant').trim();
    const orgId = req.body?.org_id ? Number.parseInt(req.body.org_id, 10) : null;
    if (!Number.isInteger(spaceId) || spaceId < 1) return res.status(400).json({ error: 'Invalid space id' });
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: 'Invalid user id' });
    try {
      await pool.query(
        `INSERT INTO workshop_space_members (space_id, user_id, org_id, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (space_id, user_id) DO UPDATE SET role = $4, org_id = $3`,
        [spaceId, userId, orgId, role]
      );
      res.status(201).json({ ok: true });
    } catch (e) {
      console.error('❌ POST /api/workshop/spaces/:id/members:', e.message);
      res.status(500).json({ error: 'Could not add member' });
    }
  });

  app.delete('/api/workshop/spaces/:id/members/:userId', requireAuth(pool), async (req, res) => {
    const spaceId = Number.parseInt(req.params.id, 10);
    const userId = Number.parseInt(req.params.userId, 10);
    if (!Number.isInteger(spaceId) || spaceId < 1) return res.status(400).json({ error: 'Invalid space id' });
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: 'Invalid user id' });
    try {
      await pool.query(
        `DELETE FROM workshop_space_members WHERE space_id = $1 AND user_id = $2`,
        [spaceId, userId]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('❌ DELETE /api/workshop/spaces/:id/members/:userId:', e.message);
      res.status(500).json({ error: 'Could not remove member' });
    }
  });

  app.get('/api/workshop/spaces/:id/proposals', requireAuth(pool), async (req, res) => {
    const spaceId = Number.parseInt(req.params.id, 10);
    const status = String(req.query?.status || '').trim() || null;
    if (!Number.isInteger(spaceId) || spaceId < 1) return res.status(400).json({ error: 'Invalid space id' });
    try {
      let query = `
        SELECT
          p.id, p.title, p.body_markdown, p.status, p.created_at, p.updated_at,
          u.email AS proposed_by_email
        FROM workshop_proposals p
        LEFT JOIN users u ON u.id = p.proposed_by_user_id
        WHERE p.space_id = $1`;
      const params = [spaceId];
      if (status) {
        query += ` AND p.status = $2`;
        params.push(status);
      }
      query += ` ORDER BY p.created_at DESC`;
      const r = await pool.query(query, params);
      res.json({ proposals: r.rows || [] });
    } catch (e) {
      console.error('❌ GET /api/workshop/spaces/:id/proposals:', e.message);
      res.status(500).json({ error: 'Could not load proposals', proposals: [] });
    }
  });

  app.get('/api/workshop/spaces/:id/proposals/:proposalId', requireAuth(pool), async (req, res) => {
    const spaceId = Number.parseInt(req.params.id, 10);
    const proposalId = Number.parseInt(req.params.proposalId, 10);
    if (!Number.isInteger(spaceId) || spaceId < 1) return res.status(400).json({ error: 'Invalid space id' });
    if (!Number.isInteger(proposalId) || proposalId < 1) return res.status(400).json({ error: 'Invalid proposal id' });
    try {
      const r = await pool.query(
        `SELECT
           p.id, p.title, p.body_markdown, p.status, p.decision_notes_markdown, p.decided_at,
           p.created_at, p.updated_at,
           u.email AS proposed_by_email,
           du.email AS decided_by_email
         FROM workshop_proposals p
         LEFT JOIN users u ON u.id = p.proposed_by_user_id
         LEFT JOIN users du ON du.id = p.decided_by_user_id
         WHERE p.space_id = $1 AND p.id = $2
         LIMIT 1`,
        [spaceId, proposalId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Proposal not found' });
      res.json({ proposal: r.rows[0] });
    } catch (e) {
      console.error('❌ GET /api/workshop/spaces/:id/proposals/:proposalId:', e.message);
      res.status(500).json({ error: 'Could not load proposal' });
    }
  });

  app.post('/api/workshop/spaces/:id/proposals', requireAuth(pool), async (req, res) => {
    const spaceId = Number.parseInt(req.params.id, 10);
    const userId = req.user.user_id ?? req.user.id;
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body_markdown || '').trim();
    if (!Number.isInteger(spaceId) || spaceId < 1) return res.status(400).json({ error: 'Invalid space id' });
    if (!title) return res.status(400).json({ error: 'Proposal title required' });
    if (!body) return res.status(400).json({ error: 'Proposal body required' });
    try {
      const r = await pool.query(
        `INSERT INTO workshop_proposals (space_id, title, body_markdown, proposed_by_user_id, status)
         VALUES ($1, $2, $3, $4, 'draft')
         RETURNING id, title, status, created_at`,
        [spaceId, title, body, userId]
      );
      res.status(201).json({ proposal: r.rows[0] });
    } catch (e) {
      console.error('❌ POST /api/workshop/spaces/:id/proposals:', e.message);
      res.status(500).json({ error: 'Could not create proposal' });
    }
  });

  app.patch('/api/workshop/spaces/:id/proposals/:proposalId', requireAuth(pool), async (req, res) => {
    const spaceId = Number.parseInt(req.params.id, 10);
    const proposalId = Number.parseInt(req.params.proposalId, 10);
    const userId = req.user.user_id ?? req.user.id;
    const newStatus = String(req.body?.status || '').trim();
    const decisionNotes = String(req.body?.decision_notes_markdown || '').trim() || null;
    if (!Number.isInteger(spaceId) || spaceId < 1) return res.status(400).json({ error: 'Invalid space id' });
    if (!Number.isInteger(proposalId) || proposalId < 1) return res.status(400).json({ error: 'Invalid proposal id' });
    if (!newStatus) return res.status(400).json({ error: 'Status required' });
    try {
      const updates = [];
      const params = [spaceId, proposalId];
      let paramNum = 3;
      updates.push(`status = $${paramNum++}`);
      params.push(newStatus);
      if (decisionNotes) {
        updates.push(`decision_notes_markdown = $${paramNum++}`);
        params.push(decisionNotes);
      }
      if (['decided_yes', 'decided_no', 'withdrawn', 'superseded'].includes(newStatus)) {
        updates.push(`decided_at = NOW(), decided_by_user_id = $${paramNum++}`);
        params.push(userId);
      }
      const r = await pool.query(
        `UPDATE workshop_proposals
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE space_id = $1 AND id = $2
         RETURNING id, title, status, decision_notes_markdown, decided_at`,
        params
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Proposal not found' });
      res.json({ proposal: r.rows[0] });
    } catch (e) {
      console.error('❌ PATCH /api/workshop/spaces/:id/proposals/:proposalId:', e.message);
      res.status(500).json({ error: 'Could not update proposal' });
    }
  });

  app.get('/api/workshop/spaces/:id/civic-links', requireAuth(pool), async (req, res) => {
    const spaceId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(spaceId) || spaceId < 1) return res.status(400).json({ error: 'Invalid space id' });
    try {
      const r = await pool.query(
        `SELECT id, linked_entity_type, linked_entity_id, link_description, created_at
         FROM workshop_civic_links
         WHERE space_id = $1
         ORDER BY created_at DESC`,
        [spaceId]
      );
      res.json({ civic_links: r.rows || [] });
    } catch (e) {
      console.error('❌ GET /api/workshop/spaces/:id/civic-links:', e.message);
      res.status(500).json({ error: 'Could not load civic links', civic_links: [] });
    }
  });

  app.post('/api/workshop/spaces/:id/civic-links', requireAuth(pool), async (req, res) => {
    const spaceId = Number.parseInt(req.params.id, 10);
    const entityType = String(req.body?.linked_entity_type || '').trim();
    const entityId = Number.parseInt(req.body?.linked_entity_id, 10);
    const description = String(req.body?.link_description || '').trim() || null;
    if (!Number.isInteger(spaceId) || spaceId < 1) return res.status(400).json({ error: 'Invalid space id' });
    if (!entityType) return res.status(400).json({ error: 'Entity type required' });
    if (!Number.isInteger(entityId) || entityId < 1) return res.status(400).json({ error: 'Invalid entity id' });
    try {
      const r = await pool.query(
        `INSERT INTO workshop_civic_links (space_id, linked_entity_type, linked_entity_id, link_description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, linked_entity_type, linked_entity_id, link_description, created_at`,
        [spaceId, entityType, entityId, description]
      );
      res.status(201).json({ civic_link: r.rows[0] });
    } catch (e) {
      console.error('❌ POST /api/workshop/spaces/:id/civic-links:', e.message);
      res.status(500).json({ error: 'Could not add civic link' });
    }
  });

  app.post('/api/volunteer/suggest', requireAuth(pool), async (req, res) => {
    try {
      const title = req.body?.title != null ? String(req.body.title).trim() : '';
      const url = req.body?.url != null ? String(req.body.url).trim() : '';
      const location = req.body?.location != null ? String(req.body.location).trim() : null;
      const description = req.body?.description != null ? String(req.body.description).trim() : null;
      const kindRaw = req.body?.kind != null ? String(req.body.kind).trim() : 'volunteer';
      const kind = ['volunteer', 'local_action'].includes(kindRaw) ? kindRaw : 'volunteer';

      if (!title) return res.status(400).json({ error: 'Title required' });
      if (!url) return res.status(400).json({ error: 'URL required' });

      await pool.query(
        `INSERT INTO volunteer_opportunities (title, url, location, description, submitted_by_user_id, kind)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [title.slice(0, 500), url.slice(0, 1000), location ? location.slice(0, 200) : null, description ? description.slice(0, 2000) : null, req.user.user_id, kind]
      );

      const userEmail = req.user.email || 'unknown@causal.works';
      const userId = req.user.user_id || 'unknown';
      const timestamp = new Date().toISOString();
      const kindLabel = kind === 'local_action' ? 'Local action' : 'Volunteer opportunity';
      const emailBody = `${kindLabel} submitted by ${userEmail} (User ID: ${userId})\nTimestamp: ${timestamp}\n\nTitle: ${title}\nURL: ${url}\nLocation: ${location || '(not provided)'}\nDescription: ${description || '(not provided)'}\n\nReview at https://causal.works/admin`;

      try {
        const postmarkKey = process.env.POSTMARK_API_KEY;
        if (postmarkKey) {
          await fetch('https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-Postmark-Server-Token': postmarkKey,
            },
            body: JSON.stringify({
              From: 'noreply@causal.works',
              To: 'loopy@causal.works',
              Subject: `${kindLabel} submitted: ${title.slice(0, 60)}`,
              TextBody: emailBody,
            }),
          });
        }
      } catch (emailErr) {
        console.error('❌ Postmark send error:', emailErr.message);
      }

      res.json({ ok: true });
    } catch (e) {
      console.error('❌ Volunteer suggest error:', e.message);
      res.status(500).json({ error: 'Could not submit' });
    }
  });

  app.get('/api/volunteer/opportunities', async (req, res) => {
    try {
      const kindRaw = req.query?.kind != null ? String(req.query.kind).trim() : '';
      const kind = ['volunteer', 'local_action'].includes(kindRaw) ? kindRaw : null;
      const result = await pool.query(
        `SELECT id, title, url, location, description, kind, created_at
         FROM volunteer_opportunities
         WHERE approved = true ${kind ? 'AND kind = $1' : ''}
         ORDER BY created_at DESC
         LIMIT 100`,
        kind ? [kind] : []
      );
      res.json(result.rows);
    } catch (e) {
      console.error('❌ Volunteer opportunities error:', e.message);
      res.status(500).json({ error: 'Could not load opportunities' });
    }
  });

}

module.exports = { registerWorkshopRoutes };
