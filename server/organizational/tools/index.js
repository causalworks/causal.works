'use strict';

// Loads every tool file and exposes the registry.

require('./payments');
require('./expenseClaims');
require('./giftsAndDisbursements');
require('./fixedAssets');
require('./ledgerSetup');
const { runTool, listTools } = require('./registry');
const { programScopeFor } = require('../lib/programScope');
const { reqMeta } = require('../lib/auditLog');

function ctxFromReq(pool, req) {
  return { pool, orgId: req.orgId, userId: req.user.user_id ?? req.user.id, actor: 'human', programScope: programScopeFor(req), orgRole: req.coopOrgRole, meta: reqMeta(req) };
}

// For server code acting for a signed-in finance user; viaBank lets a bank action void a payment that its own bank line reconciles.
function ctxForUser(pool, orgId, userId, extra = {}) {
  return { pool, orgId, userId, actor: 'human', programScope: null, meta: {}, ...extra };
}

module.exports = { runTool, listTools, ctxFromReq, ctxForUser };
