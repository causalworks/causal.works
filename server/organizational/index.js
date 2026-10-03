'use strict';

/** Organizational HTTP routes. Cooperative profile JSON shape: docs/organizational-cooperative-profile.md */
const { registerOrganizationalGrantRoutes } = require('./routes/grants');
const { registerOrganizationalOrgRoutes } = require('./routes/orgs');
const { registerOrganizationalProgramRoutes } = require('./routes/programs');
const { registerOrganizationalAccountRoutes } = require('./routes/organizational-accounts');
const { registerOrganizationalXeroRoutes } = require('./routes/xero');
const { registerOrganizationalActualsRoutes } = require('./routes/actuals');
const { registerOrganizationalBudgetLineRoutes } = require('./routes/budget-lines');
const { registerBudgetScenarioRoutes } = require('./routes/budgetScenarios');
const { registerScenarioInputRoutes } = require('./routes/scenarioInputs');
const { registerOrganizationalSummaryRoutes } = require('./routes/summary');
const { registerOrganizationalReportRoutes } = require('./routes/reports');
const { registerOrganizationalOnboardingRoutes } = require('./routes/onboarding');
const { registerOrganizationalSetupPresetRoutes } = require('./routes/setup-presets');
const { registerOrganizationalImportRoutes } = require('./routes/imports');
const { registerOrganizationalDashboardRoutes } = require('./routes/dashboard');
const { registerOrganizationalProjectionsRoutes } = require('./routes/projections');
const { registerOrganizationalAllocationScheduleRoutes } = require('./routes/allocationSchedules');
const { registerCooperativeRoutes } = require('./routes/cooperative');
const { registerSponsoredProjectsRoutes } = require('./routes/sponsored-projects');
const { registerComplianceRoutes } = require('./routes/compliance');
const registerMembershipRoutes = require('./routes/membership');
const { registerOrgInviteAcceptRoutes } = require('./routes/inviteAccept');
const { registerOrganizationalPersonnelRoutes } = require('./routes/personnel');
const { registerOrganizationalScheduleItemRoutes } = require('./routes/schedule-items');
const { registerOrganizationalScheduleRoutes } = require('./routes/schedules');
const { registerOrganizationalAuditLogRoutes } = require('./routes/audit-log');
const { registerFunctionalClassificationRoutes } = require('./routes/functional-classifications');
const { registerOrganizationalDonorRoutes } = require('./routes/donors');
const { registerOrganizationalDocumentRoutes } = require('./routes/documents');
const { registerFiscalYearLockRoutes } = require('./routes/fiscal-year-locks');
const { registerActualsSourceRoutes } = require('./routes/actualsSource');
const { registerOrganizationalDataPodRoutes } = require('./routes/dataPod');
const { registerPodManagementRoutes } = require('./routes/podManagement');
const { registerPodPermissionRoutes } = require('./routes/podPermissions');
const { registerPodShareGatewayRoutes } = require('./routes/podShareGateway');
const { registerPodAccessGroupRoutes } = require('./routes/podAccessGroups');
const { registerOrganizationalLedgerRoutes } = require('./routes/ledger');
const { registerAccountingDashboardRoutes } = require('./routes/accountingDashboard');
const { registerPlaidRoutes } = require('./routes/plaid');
const { registerBankReconciliationRoutes } = require('./routes/bankReconciliation');
const { registerBankRuleRoutes } = require('./routes/bankRules');
const { registerFixedAssetRoutes } = require('./routes/fixedAssets');
const { registerExpenseClaimRoutes } = require('./routes/expenseClaims');
const { registerBoardDesignationRoutes } = require('./routes/boardDesignations');
const { registerVendorComplianceRoutes } = require('./routes/vendorCompliance');
const { registerBillsRoutes } = require('./routes/bills');
const { registerInvoicesRoutes } = require('./routes/invoices');
const { registerCreditNotesRoutes } = require('./routes/creditNotes');
const { registerRecurringSchedulesRoutes } = require('./routes/recurringSchedules');
const { registerFinancialStatementRoutes } = require('./routes/financialStatements');
const { registerGiftPostingRoutes } = require('./routes/giftPostings');
const { registerIndirectCostRecoveryRoutes } = require('./routes/indirectCostRecovery');
const { wrapPoolWithOrgScoping } = require('./lib/scopedPool');

function mountOrganizationalRoutes(app, rawPool) {
  // Every route below receives this org-scoped pool, not the raw one --
  // see scopedPool.js/orgContext.js. The raw pool itself is never mutated,
  // so server.js/the Individual app/scheduled jobs (which also hold a
  // reference to it) are unaffected.
  const pool = wrapPoolWithOrgScoping(rawPool);
  registerOrganizationalGrantRoutes(app, pool);
  registerOrganizationalProgramRoutes(app, pool);
  registerOrganizationalAccountRoutes(app, pool);
  registerOrganizationalBudgetLineRoutes(app, pool);
  registerBudgetScenarioRoutes(app, pool);
  registerScenarioInputRoutes(app, pool);
  registerOrganizationalActualsRoutes(app, pool);
  registerOrganizationalXeroRoutes(app, pool);
  registerOrganizationalOrgRoutes(app, pool);
  registerOrganizationalOnboardingRoutes(app, pool);
  registerOrganizationalSetupPresetRoutes(app, pool);
  registerOrganizationalSummaryRoutes(app, pool);
  registerOrganizationalReportRoutes(app, pool);
  registerOrganizationalImportRoutes(app, pool);
  registerOrganizationalDashboardRoutes(app, pool);
  registerOrganizationalProjectionsRoutes(app, pool);
  registerOrganizationalAllocationScheduleRoutes(app, pool);
  registerCooperativeRoutes(app, pool);
  registerSponsoredProjectsRoutes(app, pool);
  registerComplianceRoutes(app, pool);
  // registerMembershipRoutes builds an express.Router() with relative paths
  // (router.get('/members', ...), reading req.params.slug from the mount path itself, not a
  // route segment) -- it must actually be mounted, not just invoked. It previously wasn't:
  // every Membership endpoint 404'd (confirmed live), which is the real cause of the
  // "Could not load members" error, not a client-side/session issue as first suspected.
  app.use('/api/organizational/:slug/membership', registerMembershipRoutes(app, pool));
  registerOrgInviteAcceptRoutes(app, pool);
  registerOrganizationalPersonnelRoutes(app, pool);
  registerOrganizationalScheduleItemRoutes(app, pool);
  registerOrganizationalScheduleRoutes(app, pool);
  registerOrganizationalAuditLogRoutes(app, pool);
  registerFunctionalClassificationRoutes(app, pool);
  registerOrganizationalDonorRoutes(app, pool);
  registerOrganizationalDocumentRoutes(app, pool);
  registerFiscalYearLockRoutes(app, pool);
  registerActualsSourceRoutes(app, pool);
  registerOrganizationalDataPodRoutes(app, pool);
  registerPodManagementRoutes(app, pool);
  registerPodPermissionRoutes(app, pool);
  registerPodShareGatewayRoutes(app, pool);
  registerPodAccessGroupRoutes(app, pool);
  registerOrganizationalLedgerRoutes(app, pool);
  registerAccountingDashboardRoutes(app, pool);
  registerPlaidRoutes(app, pool);
  registerBankReconciliationRoutes(app, pool);
  registerBankRuleRoutes(app, pool);
  registerFixedAssetRoutes(app, pool);
  registerExpenseClaimRoutes(app, pool);
  registerBoardDesignationRoutes(app, pool);
  registerVendorComplianceRoutes(app, pool);
  registerBillsRoutes(app, pool);
  registerInvoicesRoutes(app, pool);
  registerCreditNotesRoutes(app, pool);
  registerRecurringSchedulesRoutes(app, pool);
  registerFinancialStatementRoutes(app, pool);
  registerGiftPostingRoutes(app, pool);
  registerIndirectCostRecoveryRoutes(app, pool);
}

module.exports = { mountOrganizationalRoutes };
