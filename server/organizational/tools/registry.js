'use strict';

// Registry of named actions on the books. Routes, jobs and assistants call runTool; each tool declares its capability and whether an assistant or job runs it or only proposes it for a person to confirm.

const CAPABILITIES = ['read', 'write', 'post', 'approve', 'reconcile', 'release'];
const ACTORS = ['human', 'assistant', 'job'];

const tools = new Map();

function defineTool(def) {
  if (!def || !def.name || typeof def.run !== 'function') throw new Error('A tool needs a name and a run function');
  if (!CAPABILITIES.includes(def.capability)) throw new Error(`Tool ${def.name}: unknown capability ${def.capability}`);
  if (!['run', 'propose'].includes(def.nonHuman)) throw new Error(`Tool ${def.name}: nonHuman must be 'run' or 'propose'`);
  if (tools.has(def.name)) throw new Error(`Tool ${def.name} is already defined`);
  tools.set(def.name, Object.freeze({ validate: null, ...def }));
  return def;
}

// ctx: { pool, orgId, userId, actor, programScope (null = all programs, or an array of program ids), meta }
async function runTool(name, ctx, input) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  if (!ACTORS.includes(ctx.actor)) throw new Error('ctx.actor must be human, assistant or job');
  const checked = tool.validate ? tool.validate(input || {}) : { value: input || {} };
  if (checked.error) return { httpStatus: 400, body: { error: checked.error } };
  if (tool.nonHuman === 'propose' && ctx.actor !== 'human') {
    const proposalId = await require('./proposals').storeProposal(ctx, tool.name, input || {});
    return { httpStatus: 202, body: { proposed: true, proposal_id: proposalId, tool: tool.name, input: input || {}, message: 'Waiting for a person to confirm. Nothing was changed.' } };
  }
  return tool.run(ctx, checked.value);
}

function hasTool(name) {
  return tools.has(name);
}

function listTools() {
  return [...tools.values()].map((t) => ({ name: t.name, capability: t.capability, nonHuman: t.nonHuman }));
}

function scopeAllows(ctx, programIds) {
  if (ctx.programScope === null || ctx.programScope === undefined) return true;
  return programIds.every((id) => ctx.programScope.includes(id));
}

module.exports = { CAPABILITIES, defineTool, runTool, listTools, hasTool, scopeAllows };
