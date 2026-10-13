'use strict';

async function clearComputedLines(client, { orgId, fiscalYear, scenarioId, sourceType }) {
  if (scenarioId == null) {
    const { rowCount } = await client.query(
      `DELETE FROM org_budget_lines
       WHERE org_id = $1 AND fiscal_year = $2 AND source_type = $3
         AND is_override IS NOT TRUE`,
      [orgId, fiscalYear, sourceType]
    );
    return rowCount || 0;
  }
  const { rowCount } = await client.query(
    `DELETE FROM org_budget_scenario_lines
     WHERE scenario_id = $1 AND source_type = $2 AND is_override IS NOT TRUE`,
    [scenarioId, sourceType]
  );
  return rowCount || 0;
}

async function writeComputedLine(client, {
  orgId, accountId, programId, grantId, fiscalYear, month, amountCents,
  scenarioId, sourceType, sourceRefId, sourceRefType,
}) {
  if (scenarioId == null) {
    await client.query(
      `INSERT INTO org_budget_lines
         (org_id, account_id, program_id, grant_id, fiscal_year, month,
          amount_cents, source_type, source_ref_id, source_ref_type,
          calculated_amount_cents, source_updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$7,NOW())`,
      [orgId, accountId, programId ?? null, grantId ?? null, fiscalYear, month, amountCents, sourceType, sourceRefId ?? null, sourceRefType ?? null]
    );
    return;
  }
  await client.query(
    `INSERT INTO org_budget_scenario_lines
       (scenario_id, account_id, program_id, grant_id, month, amount_cents, source_type, source_ref_id, source_ref_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (scenario_id, account_id, COALESCE(program_id, -1), COALESCE(grant_id, -1), month)
       DO UPDATE SET amount_cents = EXCLUDED.amount_cents, source_type = EXCLUDED.source_type,
                     source_ref_id = EXCLUDED.source_ref_id, source_ref_type = EXCLUDED.source_ref_type,
                     updated_at = NOW()
       WHERE org_budget_scenario_lines.is_override IS NOT TRUE`,
    [scenarioId, accountId, programId, grantId ?? null, month, amountCents, sourceType, sourceRefId ?? null, sourceRefType ?? null]
  );
}

module.exports = { clearComputedLines, writeComputedLine };
