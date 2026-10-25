'use strict';

// Registry of named actions on the books. Routes, jobs and assistants call runTool; each tool declares its capability and whether only a person may run it.

const CAPABILITIES = ['read', 'write', 'post', 'approve', 'reconcile', 'release'];
const ACTORS = ['human', 'assistant', 'job'];

const tools = new Map();

function defineTool(def) {
  if (!def || !def.name || typeof def.run !== 'function') throw new Error('A tool needs a name and a run function');
  if (!CAPABILITIES.includes(def.capability)) throw new Error(`Tool ${def.name}: unknown capability ${def.capability}`);
  if (typeof def.humanOnly !== 'boolean') throw new Error(`Tool ${def.name}: humanOnly must be stated`);
  if (tools.has(def.name)) throw new Error(`Tool ${def.name} is already defined`);
  tools.set(def.name, Object.freeze({ validate: null, ...def }));
  return def;
}

// ctx: { pool, orgId, userId, actor, programScope (null = all programs, or an array of program ids), meta }
async function runTool(name, ctx, input) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  if (!ACTORS.includes(ctx.actor)) throw new Error('ctx.actor must be human, assistant or job');
  if (tool.humanOnly && ctx.actor !== 'human') {
    return { httpStatus: 403, body: { error: 'Only a person can do this', code: 'human_only' } };
  }
  const checked = tool.validate ? tool.validate(input || {}) : { value: input || {} };
  if (checked.error) return { httpStatus: 400, body: { error: checked.error } };
  return tool.run(ctx, checked.value);
}

function listTools() {
  return [...tools.values()].map((t) => ({ name: t.name, capability: t.capability, humanOnly: t.humanOnly }));
}

function scopeAllows(ctx, programIds) {
  if (ctx.programScope === null || ctx.programScope === undefined) return true;
  return programIds.every((id) => ctx.programScope.includes(id));
}

module.exports = { CAPABILITIES, defineTool, runTool, listTools, scopeAllows };
