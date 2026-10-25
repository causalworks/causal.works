'use strict';

// Stores tool calls an assistant or job proposed, and lets a person accept, change or dismiss them.

async function storeProposal(ctx, tool, input) {
  const p = ctx.proposal || {};
  const r = await ctx.pool.query(
    `INSERT INTO org_tool_proposals (org_id, tool_name, proposer_kind, proposer_user_id, model, prompt_version, input, reason, evidence, warnings)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [ctx.orgId, tool, ctx.actor, ctx.userId || null, p.model || null, p.promptVersion || null, JSON.stringify(input || {}),
      p.reason || null, p.evidence ? JSON.stringify(p.evidence) : null, p.warnings ? JSON.stringify(p.warnings) : null]);
  return r.rows[0].id;
}

async function listProposals(pool, orgId, { status = 'open' } = {}) {
  await pool.query(`UPDATE org_tool_proposals SET status = 'expired' WHERE org_id = $1 AND status = 'open' AND expires_at < now()`, [orgId]);
  const r = await pool.query(
    `SELECT id, tool_name, proposer_kind, model, prompt_version, input, reason, evidence, warnings, status, decided_by, decided_at, final_input, result_status, expires_at, created_at
       FROM org_tool_proposals WHERE org_id = $1 AND status = $2 ORDER BY created_at DESC, id DESC LIMIT 200`, [orgId, status]);
  return r.rows;
}

// Claims the open proposal first, so two simultaneous decisions run the tool once.
async function claim(ctx, id, status, finalInput) {
  const r = await ctx.pool.query(
    `UPDATE org_tool_proposals SET status = $3, decided_by = $4, decided_at = now(), final_input = $5
      WHERE id = $1 AND org_id = $2 AND status = 'open' AND expires_at >= now()
      RETURNING tool_name, input`,
    [id, ctx.orgId, status, ctx.userId, finalInput ? JSON.stringify(finalInput) : null]);
  return r.rows[0] || null;
}

async function acceptProposal(ctx, id, changedInput) {
  const { runTool, hasTool } = require('./registry');
  if (ctx.actor !== 'human') return { httpStatus: 403, body: { error: 'A person must decide a proposal' } };
  const row = await claim(ctx, id, changedInput ? 'changed' : 'accepted', changedInput || null);
  if (!row) return { httpStatus: 409, body: { error: 'This proposal is not open' } };
  if (!hasTool(row.tool_name)) return { httpStatus: 500, body: { error: 'Unknown tool' } };
  const reopen = () => ctx.pool.query(`UPDATE org_tool_proposals SET status = 'open', decided_by = NULL, decided_at = NULL, final_input = NULL WHERE id = $1 AND org_id = $2`, [id, ctx.orgId]);
  let out;
  try {
    out = await runTool(row.tool_name, ctx, changedInput || row.input);
  } catch (e) {
    await reopen();
    throw e;
  }
  if (out.httpStatus >= 400) {
    await reopen();
    return out;
  }
  await ctx.pool.query(`UPDATE org_tool_proposals SET result_status = $3 WHERE id = $1 AND org_id = $2`, [id, ctx.orgId, out.httpStatus]);
  return out;
}

async function dismissProposal(ctx, id) {
  if (ctx.actor !== 'human') return { httpStatus: 403, body: { error: 'A person must decide a proposal' } };
  const row = await claim(ctx, id, 'dismissed', null);
  if (!row) return { httpStatus: 409, body: { error: 'This proposal is not open' } };
  return { httpStatus: 200, body: { dismissed: true } };
}

module.exports = { storeProposal, listProposals, acceptProposal, dismissProposal };
