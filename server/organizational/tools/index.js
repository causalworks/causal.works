'use strict';

// Loads every tool file and exposes the registry.

require('./payments');
const { runTool, listTools } = require('./registry');
const { programScopeFor } = require('../lib/programScope');
const { reqMeta } = require('../lib/auditLog');

function ctxFromReq(pool, req) {
  return { pool, orgId: req.orgId, userId: req.user.user_id ?? req.user.id, actor: 'human', programScope: programScopeFor(req), meta: reqMeta(req) };
}

module.exports = { runTool, listTools, ctxFromReq };
