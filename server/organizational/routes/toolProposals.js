'use strict';

// Waiting proposals from assistants and jobs: list, accept (optionally with changes) and dismiss.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { ctxFromReq, proposals } = require('../tools');
const { programScopeFor } = require('../lib/programScope');
const { logAudit, reqMeta } = require('../lib/auditLog');

const { proposeForUnconfirmedLines } = require('../lib/bankLineProposals');
const { measure } = require('../lib/proposalMeasurement');

const STATUSES = ['open', 'accepted', 'changed', 'dismissed', 'expired'];

function registerToolProposalRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const deciders = requireOrgRole(['admin', 'finance']);
  const idOf = (req) => { const n = Number.parseInt(String(req.params.id), 10); return Number.isInteger(n) && n >= 1 ? n : null; };

  app.get('/api/organizational/orgs/:slug/tool-proposals', ...orgAuth, deciders, async (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : 'open';
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      if (programScopeFor(req) !== null) return res.json({ proposals: [] });
      res.json({ proposals: await proposals.listProposals(pool, req.orgId, { status }) });
    } catch (e) {
      console.error('GET tool-proposals:', e.message);
      res.status(500).json({ error: 'Could not load proposals' });
    }
  });

  app.get('/api/organizational/orgs/:slug/tool-proposals/measurement', ...orgAuth, deciders, async (req, res) => {
    try {
      if (programScopeFor(req) !== null) return res.json({ by_month: [], by_payee: [], by_category: [], open: 0 });
      res.json(await measure(pool, req.orgId));
    } catch (e) {
      console.error('GET tool-proposals measurement:', e.message);
      res.status(500).json({ error: 'Could not load the results' });
    }
  });

  app.post('/api/organizational/orgs/:slug/tool-proposals/prepare-bank-coding', ...orgAuth, deciders, async (req, res) => {
    try {
      res.json(await proposeForUnconfirmedLines(pool, req.orgId));
    } catch (e) {
      console.error('POST tool-proposals prepare-bank-coding:', e.message);
      res.status(500).json({ error: 'Could not prepare proposals' });
    }
  });

  app.post('/api/organizational/orgs/:slug/tool-proposals/:id/accept', ...orgAuth, deciders, async (req, res) => {
    try {
      const id = idOf(req);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      if (programScopeFor(req) !== null) return res.status(403).json({ error: 'Proposals are decided by people with access to every program' });
      const changed = req.body && req.body.input && typeof req.body.input === 'object' ? req.body.input : null;
      const out = await proposals.acceptProposal(ctxFromReq(pool, req), id, changed);
      if (out.httpStatus < 400) {
        logAudit(pool, { orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_tool_proposals', recordId: id, fields: [{ fieldName: 'Decision', oldValue: 'open', newValue: changed ? 'changed' : 'accepted' }], metadata: reqMeta(req) }).catch(() => {});
      }
      res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST tool-proposals accept:', e.message);
      res.status(500).json({ error: 'Could not run the proposal' });
    }
  });

  app.post('/api/organizational/orgs/:slug/tool-proposals/:id/dismiss', ...orgAuth, deciders, async (req, res) => {
    try {
      const id = idOf(req);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const out = await proposals.dismissProposal(ctxFromReq(pool, req), id);
      if (out.httpStatus < 400) {
        logAudit(pool, { orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_tool_proposals', recordId: id, fields: [{ fieldName: 'Decision', oldValue: 'open', newValue: 'dismissed' }], metadata: reqMeta(req) }).catch(() => {});
      }
      res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST tool-proposals dismiss:', e.message);
      res.status(500).json({ error: 'Could not dismiss the proposal' });
    }
  });
}

module.exports = { registerToolProposalRoutes };
