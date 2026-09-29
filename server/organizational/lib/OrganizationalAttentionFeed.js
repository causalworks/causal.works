'use strict';

const { fyDateRange, fiscalYearForDate, getFiscalYearEndMonth } = require('./fiscalYear');

function dayDiff(isoDate) {
  if (!isoDate) return null;
  const t = new Date(String(isoDate).slice(0, 10)).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

async function fetchAttentionFeed(pool, orgId, slug) {
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

  // Sponsored-project sponsee reports (IRC 4945(h) expenditure-responsibility
  // accountability, distinct from the money-tracking in org_sponsored_project_disbursements)
  // -- added 2026-09-14, same lazy pattern as grants' next_report_due, only gated on
  // fiscal_sponsorship_mode since that's the module toggle here.
  const fsR = await pool.query(
    `SELECT fiscal_sponsorship_mode FROM org_settings WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  if (fsR.rows[0] && fsR.rows[0].fiscal_sponsorship_mode) {
    const spR = await pool.query(
      `SELECT id, name, next_report_due::text AS next_report_due
       FROM org_sponsored_projects
       WHERE sponsor_org_id = $1 AND status = 'active' AND next_report_due IS NOT NULL`,
      [orgId]
    );
    for (const sp of spR.rows) {
      const dueIn = dayDiff(sp.next_report_due);
      if (dueIn != null && dueIn >= 0 && dueIn <= 60) {
        items.push({
          type: 'sponsored_project',
          urgency_days: dueIn,
          title: `${sp.name || 'Sponsored project'}'s report due ${sp.next_report_due}`,
          due_date: sp.next_report_due,
          href: `${base}/sponsored-projects?focus=${sp.id}`,
        });
      }
    }
  }

  // Membership renewals and document expiration, added 2026-09-14
  // (.claude/plans/2026-09-14-shared-notification-mechanism-spec.md) -- same lazy,
  // request-time pattern as the grants block above, not a new mechanism. Two urgency tiers
  // (60/14 days), not three: a dues renewal and a document expiration are each a single
  // binary event (renew or don't; the document is either still valid or it's not), unlike a
  // grant which has multiple distinct milestones (LOI, application, report, renewal) that
  // actually justify three different windows. Only check membership if the org has the
  // module enabled at all, to avoid noise for orgs that don't use it.
  const settingsR = await pool.query(
    `SELECT membership_enabled FROM org_settings WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  if (settingsR.rows[0] && settingsR.rows[0].membership_enabled) {
    const membersR = await pool.query(
      `SELECT id, first_name, last_name, current_period_end::text AS current_period_end
       FROM org_members
       WHERE org_id = $1 AND status IN ('active', 'grace_period')`,
      [orgId]
    );
    for (const m of membersR.rows) {
      const renewIn = dayDiff(m.current_period_end);
      if (renewIn != null && renewIn >= 0 && renewIn <= 60) {
        const memberName = [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Member';
        items.push({
          type: 'membership',
          urgency_days: renewIn,
          title: `${memberName}'s membership renews ${m.current_period_end}`,
          due_date: m.current_period_end,
          href: `${base}/membership?focus=${m.id}`,
        });
      }
    }
  }

  // is_current + archived_at IS NULL -- only the live version of a document, not a
  // superseded one that happens to still carry an old expiration_date.
  const documentsR = await pool.query(
    `SELECT id, title, expiration_date::text AS expiration_date
     FROM org_documents
     WHERE org_id = $1 AND is_current = true AND archived_at IS NULL AND expiration_date IS NOT NULL`,
    [orgId]
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

  // Expense claims paid under post_payout mode (org_settings.expense_claim_approval_mode)
  // sit in 'paid_pending_confirmation' with real money already moved and only a human
  // confirmation step outstanding -- flagged as a followup when Expense Claims shipped
  // (2026-09-14) so this can't get silently forgotten. Every matching claim is surfaced
  // regardless of age (there's no calendar due date here, unlike grants/membership/
  // documents), sorted by how long it's been outstanding via a negative urgency_days so
  // the longest-pending claim sorts first.
  const claimsR = await pool.query(
    `SELECT c.id, c.updated_at::text AS updated_at, u.email AS submitted_by_email,
            COALESCE((SELECT SUM(l.amount_cents) FROM org_expense_claim_lines l WHERE l.claim_id = c.id), 0) AS amount_cents
     FROM org_expense_claims c
     LEFT JOIN users u ON u.id = c.submitted_by
     WHERE c.org_id = $1 AND c.status = 'paid_pending_confirmation'`,
    [orgId]
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

  // Expense claims submitted on a missing-receipt affidavit (migration 238) still owe a real
  // receipt -- surfaced against receipt_follow_up_due (the 60-day "reasonable period" set when
  // the affidavit was filed) using the same countdown-window pattern as grants, not the
  // count-up pattern used for paid_pending_confirmation above, since this one has an actual
  // due date. Clears automatically once receipt_resolved_at is set (a real receipt attached).
  const affidavitR = await pool.query(
    `SELECT c.id, c.receipt_follow_up_due::text AS receipt_follow_up_due, u.email AS submitted_by_email
     FROM org_expense_claims c
     LEFT JOIN users u ON u.id = c.submitted_by
     WHERE c.org_id = $1 AND c.receipt_affidavit_at IS NOT NULL AND c.receipt_resolved_at IS NULL`,
    [orgId]
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

  // Optional tasks integration if org_tasks exists.
  const hasTasksR = await pool.query(`SELECT to_regclass('public.org_tasks') AS reg`);
  if (hasTasksR.rows[0] && hasTasksR.rows[0].reg) {
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
  // The shared platform demo org is deliberately sample-data-only: no Xero, no setup nudges.
  const demoR = await pool.query(`SELECT is_platform_demo FROM coop_members WHERE id = $1`, [orgId]);
  const isPlatformDemo = !!(demoR.rows[0] && demoR.rows[0].is_platform_demo);
  const xeroR = await pool.query(
    `SELECT xero_tenant_id, xero_token_data FROM org_settings WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  const x = xeroR.rows[0] || {};
  if (!isPlatformDemo && (!x.xero_tenant_id || !x.xero_token_data)) {
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

  // Nudge to close the most recently completed fiscal year, once it's been over for a while
  // -- not every unlocked historical year (that would flood the feed with noise for every
  // year that predates this feature), just the one actionable "you probably want to close
  // last year by now" signal.
  const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
  const lastCompletedFy = fiscalYearForDate(new Date(), fyEndMonth) - 1;
  const { endDate: lastCompletedFyEnd } = fyDateRange(lastCompletedFy, fyEndMonth);
  const daysSinceFyEnd = dayDiff(lastCompletedFyEnd) != null ? -dayDiff(lastCompletedFyEnd) : null;
  if (daysSinceFyEnd != null && daysSinceFyEnd >= 60) {
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
