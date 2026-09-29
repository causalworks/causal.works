'use strict';

async function fetchActivityFeed(pool, orgId, sinceIso) {
  const since = sinceIso ? new Date(sinceIso) : new Date(Date.now() - 7 * 86400000);
  const sincePg = Number.isNaN(since.getTime()) ? new Date(Date.now() - 7 * 86400000) : since;

  const actualsR = await pool.query(
    `SELECT DATE(MAX(created_at))::text AS d, COUNT(*)::int AS n
     FROM org_actuals
     WHERE org_id = $1 AND created_at >= $2`,
    [orgId, sincePg.toISOString()]
  );
  const grantsNewR = await pool.query(
    `SELECT id, name, created_at
     FROM org_grants
     WHERE org_id = $1 AND created_at >= $2
     ORDER BY created_at DESC
     LIMIT 5`,
    [orgId, sincePg.toISOString()]
  );
  const grantsChangedR = await pool.query(
    `SELECT id, name, status, updated_at
     FROM org_grants
     WHERE org_id = $1 AND updated_at >= $2 AND updated_at > created_at
     ORDER BY updated_at DESC
     LIMIT 5`,
    [orgId, sincePg.toISOString()]
  );
  const budgetR = await pool.query(
    `SELECT p.name AS program_name, MAX(bl.updated_at) AS updated_at
     FROM org_budget_lines bl
     LEFT JOIN org_programs p ON p.id = bl.program_id
     WHERE bl.org_id = $1 AND bl.updated_at >= $2
     GROUP BY p.name
     ORDER BY MAX(bl.updated_at) DESC
     LIMIT 5`,
    [orgId, sincePg.toISOString()]
  );

  const items = [];
  const a = actualsR.rows[0] || {};
  if (Number(a.n) > 0) {
    items.push({
      type: 'actuals',
      title: `${a.n} new actuals imported on ${a.d || 'recently'}`,
      href: 'budget',
      at: a.d || null,
    });
  }
  for (const g of grantsChangedR.rows) {
    items.push({
      type: 'grant_status',
      title: `${g.name || 'Grant'} moved to ${g.status || 'updated'}`,
      href: `grants?focus=${g.id}`,
      at: g.updated_at,
    });
  }
  for (const g of grantsNewR.rows) {
    items.push({
      type: 'grant_new',
      title: `${g.name || 'Grant'} added`,
      href: `grants?focus=${g.id}`,
      at: g.created_at,
    });
  }
  for (const b of budgetR.rows) {
    items.push({
      type: 'budget',
      title: `Budget updated for ${b.program_name || 'a program'}`,
      href: 'budget',
      at: b.updated_at,
    });
  }
  items.sort((x, y) => new Date(y.at || 0).getTime() - new Date(x.at || 0).getTime());
  return items.slice(0, 5);
}

module.exports = { fetchActivityFeed };
