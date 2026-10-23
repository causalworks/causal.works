'use strict';

const { fyDateRange, fiscalYearForDate, getFiscalYearEndMonth } = require('./fiscalYear');
const { loadProjectBalances } = require('./sponsorBalance');
const { needsAgreement } = require('./sponsorOverview');
const { listDuesMembers, renewalsFrom } = require('./membership');
const { canRead } = require('../middleware/requireWriteAccess');
const { programScopeFor } = require('./programScope');
const { FINANCE_ROLES } = require('./orgRoles');

function dayDiff(isoDate) {
  if (!isoDate) return null;
  const t = new Date(String(isoDate).slice(0, 10)).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

async function fetchAttentionFeed(pool, orgId, slug, req) {
  const { projectDocCondition, ownerRecordClause } = require('../routes/documents');
  const role = req.coopOrgRole;
  const isAdminRole = role === 'admin';
  const isFinanceRole = isAdminRole || FINANCE_ROLES.includes(role);
  const mayReadSponsorship = canRead(req, 'sponsorship');
  const sponsorScope = role === 'program' ? programScopeFor(req) : null;
  const sponsorVisible = (sp) => mayReadSponsorship && (sponsorScope === null || sponsorScope.includes(Number(sp.program_id)));
  const mayReadMembership = canRead(req, 'membership');
  const mayReadAllClaims = ['admin', 'finance', 'staff', 'board'].includes(String(role));
  const userId = req.user.user_id ?? req.user.id;
  const items = [];
  const base = '/organizational/o/' + encodeURIComponent(slug);

  const grantsR = await pool.query(
    `SELECT id, name, status, end_date::text AS end_date,
            next_report_due::text AS next_report_due,
            renewal_application_due::text AS renewal_application_due
     FROM org_grants
     WHERE org_id = $1`,
    [orgId]
  );

  for (const g of grantsR.rows) {
    const grantStatus = String(g.status || '').toLowerCase();
    const grantName = g.name || 'Grant';
    const reportDueIn = dayDiff(g.next_report_due);
    if (reportDueIn != null && reportDueIn >= 0 && reportDueIn <= 30) {
      items.push({
        type: 'grant',
        urgency_days: reportDueIn,
        title: `Report due for ${grantName} by ${g.next_report_due}`,
        due_date: g.next_report_due,
        href: `${base}/grants?focus=${g.id}`,
      });
    }
    const endIn = dayDiff(g.end_date);
    if (grantStatus !== 'closed' && endIn != null && endIn >= 0 && endIn <= 60) {
      items.push({
        type: 'grant',
        urgency_days: endIn,
        title: `${grantName} ends ${g.end_date}`,
        due_date: g.end_date,
        href: `${base}/grants?focus=${g.id}`,
      });
    }
    const renewIn = dayDiff(g.renewal_application_due);
    if (renewIn != null && renewIn >= 0 && renewIn <= 90) {
      items.push({
        type: 'grant',
        urgency_days: renewIn,
        title: `Renewal due for ${grantName} by ${g.renewal_application_due}`,
        due_date: g.renewal_application_due,
        href: `${base}/grants?focus=${g.id}`,
      });
    }
  }

  const fsR = await pool.query(
    `SELECT fiscal_sponsorship_mode FROM org_settings WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  if (mayReadSponsorship && fsR.rows[0] && fsR.rows[0].fiscal_sponsorship_mode) {
    const spR = await pool.query(
      `SELECT id, name, program_id, next_report_due::text AS next_report_due
       FROM org_sponsored_projects
       WHERE sponsor_org_id = $1 AND status = 'active' AND next_report_due IS NOT NULL`,
      [orgId]
    );
    const flagR = await pool.query(
      `SELECT id, name, program_id, status, hold_reason, agreement_signed_at FROM org_sponsored_projects
        WHERE sponsor_org_id = $1 AND status NOT IN ('applicant', 'ended')`, [orgId]);
    const visibleFlagRows = flagR.rows.filter(sponsorVisible);
    const balances = await loadProjectBalances(pool, orgId, visibleFlagRows.map((p) => p.id));
    for (const sp of visibleFlagRows) {
      const b = balances.get(Number(sp.id));
      const negative = b && b.balance.negative;
      if (needsAgreement(sp)) {
        items.push({ type: 'sponsored_project', flag: 'danger', urgency_days: 0, title: (sp.name || 'Sponsored project') + ' has no signed agreement', due_date: null, href: `${base}/sponsored-projects?project=${sp.id}&view=agreement` });
      }
      if (sp.status !== 'on_hold' && !negative) continue;
      items.push({
        type: 'sponsored_project',
        flag: 'danger',
        urgency_days: 0,
        title: (sp.name || 'Sponsored project') + (negative ? ' is negative (' + (b.balance.available_cents / 100).toFixed(2) + ')' : '')
          + (negative && sp.status === 'on_hold' ? ' and' : '') + (sp.status === 'on_hold' ? ' is on hold: ' + (sp.hold_reason || 'no reason given') : ''),
        due_date: null,
        href: `${base}/sponsored-projects?project=${sp.id}`,
      });
    }
    for (const sp of spR.rows.filter(sponsorVisible)) {
      const dueIn = dayDiff(sp.next_report_due);
      if (dueIn != null && dueIn >= 0 && dueIn <= 60) {
        items.push({
          type: 'sponsored_project',
          urgency_days: dueIn,
          title: `${sp.name || 'Sponsored project'}'s report due ${sp.next_report_due}`,
          due_date: sp.next_report_due,
          href: `${base}/sponsored-projects?project=${sp.id}&view=reports`,
        });
      }
    }
  }

  const settingsR = await pool.query(
    `SELECT membership_enabled FROM org_settings WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  if (mayReadMembership && settingsR.rows[0] && settingsR.rows[0].membership_enabled) {
    const rows = await listDuesMembers(pool, orgId, { active: 'true' });
    for (const m of renewalsFrom(rows, { days: 60 })) {
      if (m.days_to_expiry < 0) continue;
      items.push({
        type: 'membership',
        urgency_days: m.days_to_expiry,
        title: `${m.display_name || 'A dues member'}'s membership renews ${m.term.ends_on}`,
        due_date: m.term.ends_on,
        href: `${base}/membership?focus=${m.id}`,
      });
    }
  }

  const docParams = [orgId];
  const projectCond = projectDocCondition(req, docParams, 'sponsored_project_id');
  const documentsR = await pool.query(
    `SELECT id, title, expiration_date::text AS expiration_date
     FROM org_documents
     WHERE org_id = $1 AND is_current = true AND archived_at IS NULL AND expiration_date IS NOT NULL`
    + (isAdminRole ? '' : ` AND visibility <> 'admins_only'`) + ownerRecordClause(req) + (projectCond ? ` AND ${projectCond}` : ''),
    docParams
  );
  for (const d of documentsR.rows) {
    const expireIn = dayDiff(d.expiration_date);
    if (expireIn != null && expireIn >= 0 && expireIn <= 60) {
      items.push({
        type: 'document',
        urgency_days: expireIn,
        title: `${d.title || 'Document'} expires ${d.expiration_date}`,
        due_date: d.expiration_date,
        href: `${base}/documents?focus=${d.id}`,
      });
    }
  }

  const claimsR = await pool.query(
    `SELECT c.id, c.updated_at::text AS updated_at, u.email AS submitted_by_email,
            COALESCE((SELECT SUM(l.amount_cents) FROM org_expense_claim_lines l WHERE l.claim_id = c.id), 0) AS amount_cents
     FROM org_expense_claims c
     LEFT JOIN users u ON u.id = c.submitted_by
     WHERE c.org_id = $1 AND c.status = 'paid_pending_confirmation'` + (mayReadAllClaims ? '' : ' AND c.submitted_by = $2'),
    mayReadAllClaims ? [orgId] : [orgId, userId]
  );
  for (const c of claimsR.rows) {
    const daysSincePaid = Math.max(0, -1 * (dayDiff(c.updated_at) || 0));
    const amount = (Number(c.amount_cents || 0) / 100).toFixed(2);
    items.push({
      type: 'expense_claim',
      urgency_days: -daysSincePaid,
      title: `$${amount} paid to ${c.submitted_by_email || 'claimant'} awaiting confirmation${daysSincePaid > 0 ? ` (${daysSincePaid}d)` : ''}`,
      href: `${base}/expense-claims?focus=${c.id}`,
    });
  }

  const affidavitR = await pool.query(
    `SELECT c.id, c.receipt_follow_up_due::text AS receipt_follow_up_due, u.email AS submitted_by_email
     FROM org_expense_claims c
     LEFT JOIN users u ON u.id = c.submitted_by
     WHERE c.org_id = $1 AND c.receipt_affidavit_at IS NOT NULL AND c.receipt_resolved_at IS NULL` + (mayReadAllClaims ? '' : ' AND c.submitted_by = $2'),
    mayReadAllClaims ? [orgId] : [orgId, userId]
  );
  for (const c of affidavitR.rows) {
    const dueIn = dayDiff(c.receipt_follow_up_due);
    items.push({
      type: 'expense_claim',
      urgency_days: dueIn != null ? dueIn : 0,
      title: `Receipt still owed for ${c.submitted_by_email || 'claimant'}'s expense claim`
        + (c.receipt_follow_up_due ? ` (due ${c.receipt_follow_up_due})` : ''),
      due_date: c.receipt_follow_up_due,
      href: `${base}/expense-claims?focus=${c.id}`,
    });
  }

  const hasTasksR = await pool.query(`SELECT to_regclass('public.org_tasks') AS reg`);
  if (isFinanceRole && hasTasksR.rows[0] && hasTasksR.rows[0].reg) {
    const taskR = await pool.query(
      `SELECT id, title, due_date::text AS due_date, status, priority
       FROM org_tasks
       WHERE org_id = $1
         AND COALESCE(status, 'open') IN ('open', 'assigned', 'in_progress')`,
      [orgId]
    );
    for (const t of taskR.rows) {
      const dueIn = dayDiff(t.due_date);
      const pri = String(t.priority || '').toLowerCase();
      if ((dueIn != null && dueIn >= 0 && dueIn <= 30) || pri === 'high') {
        items.push({
          type: 'task',
          urgency_days: dueIn != null ? dueIn : 999,
          title: t.title || 'Task due',
          due_date: t.due_date || null,
          href: `${base}/settings/review-imports`,
        });
      }
    }
  }

  const setup = [];
  const demoR = await pool.query(`SELECT is_platform_demo FROM coop_members WHERE id = $1`, [orgId]);
  const isPlatformDemo = !!(demoR.rows[0] && demoR.rows[0].is_platform_demo);
  const xeroR = await pool.query(
    `SELECT xero_tenant_id, xero_token_data FROM org_settings WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  const x = xeroR.rows[0] || {};
  if (isAdminRole && !isPlatformDemo && (!x.xero_tenant_id || !x.xero_token_data)) {
    setup.push({
      type: 'setup',
      title: 'Xero not connected',
      href: `${base}/settings/integrations`,
    });
  }
  if (!isPlatformDemo) {
    setup.push({
      type: 'setup',
      title: 'Board reports',
      href: `${base}/reports`,
    });
  }

  const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
  const lastCompletedFy = fiscalYearForDate(new Date(), fyEndMonth) - 1;
  const { endDate: lastCompletedFyEnd } = fyDateRange(lastCompletedFy, fyEndMonth);
  const daysSinceFyEnd = dayDiff(lastCompletedFyEnd) != null ? -dayDiff(lastCompletedFyEnd) : null;
  if (isFinanceRole && daysSinceFyEnd != null && daysSinceFyEnd >= 60) {
    const lockR = await pool.query(
      `SELECT locked_at FROM org_fiscal_year_locks WHERE org_id = $1 AND fiscal_year = $2`,
      [orgId, lastCompletedFy]
    );
    const isLocked = lockR.rows[0] && lockR.rows[0].locked_at != null;
    if (!isLocked) {
      items.push({
        type: 'reconciliation',
        urgency_days: 0,
        title: `FY${lastCompletedFy} is not yet closed`,
        href: `${base}/reports`,
      });
    }
  }

  items.sort((a, b) => Number(a.urgency_days || 999) - Number(b.urgency_days || 999));
  return { items, setup };
}

module.exports = { fetchAttentionFeed };
