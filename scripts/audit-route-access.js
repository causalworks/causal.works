#!/usr/bin/env node
'use strict';

process.env.PUBLIC_FORM_SECRET = process.env.PUBLIC_FORM_SECRET || 'audit-only';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..', 'server');
const ROUTES_DIR = path.join(ROOT, 'organizational', 'routes');
const PUBLIC_DIR = path.join(ROOT, 'organizational', 'public');
const ALLOWLIST = path.join(ROOT, 'organizational', 'route-access-allowlist.json');

function tagFactory(name, fn) {
  const wrapper = function (...args) {
    if (args.length >= 3 && args[1] && typeof args[1].json === 'function') return fn.apply(this, args);
    const out = fn.apply(this, args);
    if (typeof out === 'function') {
      out.__guard = name + (args.length && typeof args[0] !== 'object' ? '(' + JSON.stringify(args.filter((a) => typeof a !== 'function' && !(a && typeof a.query === 'function'))).slice(1, -1) + ')' : '');
    }
    return out;
  };
  wrapper.__guard = name;
  Object.keys(fn).forEach((k) => { wrapper[k] = fn[k]; });
  return wrapper;
}
const GUARD_MODULES = [
  ['auth.js', ['requireAuth']],
  ['organizational/middleware/requireOrganizationalAccess.js', ['requireOrganizationalAccess']],
  ['organizational/middleware/requireOrgMembership.js', ['requireOrgMembership', 'requireOrgRole']],
  ['organizational/middleware/requireAccountingAccess.js', ['requireAccountingAccess', 'requireReportsOrBoard', 'requireAccountingWriter', 'requireDonorRead', 'requireContactRead', 'boardSeesAllPrograms']],
  ['organizational/middleware/requireWriteAccess.js', ['requireWriteAccess', 'requireReadAccess', 'requireContactWrite']],
  ['organizational/middleware/requirePlatformAdmin.js', ['requirePlatformAdmin']],
];
for (const [rel, names] of GUARD_MODULES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const mod = require(file);
  for (const n of names) if (typeof mod[n] === 'function') mod[n] = tagFactory(n, mod[n]);
}

const routes = [];
const fakeApp = {};
['get', 'post', 'put', 'patch', 'delete', 'all', 'use'].forEach((m) => {
  fakeApp[m] = (p, ...handlers) => {
    if (typeof p !== 'string') return;
    routes.push({ method: m.toUpperCase(), path: p, handlers });
  };
});
const stubPool = new Proxy(function () {}, { get: () => () => Promise.resolve({ rows: [] }), apply: () => Promise.resolve({ rows: [] }) });

const failed = [];
const routeFiles = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js')).sort().map((f) => [ROUTES_DIR, f])
  .concat(fs.existsSync(PUBLIC_DIR) ? fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.js')).sort().map((f) => [PUBLIC_DIR, 'public/' + f]) : []);
for (const [dir, file] of routeFiles) {
  let mod;
  try { mod = require(path.join(dir, path.basename(file))); } catch (e) { failed.push(file + ': ' + e.message); continue; }
  const before = routes.length;
  for (const key of Object.keys(mod)) {
    if (!/^register/i.test(key) || typeof mod[key] !== 'function') continue;
    try { mod[key](fakeApp, stubPool, {}); } catch (e) { failed.push(file + ' ' + key + ': ' + e.message); }
  }
  for (let i = before; i < routes.length; i++) routes[i].file = file;
}

const ROLE_GUARDS = ['requireOrgRole', 'requireWriteAccess', 'requireReadAccess', 'requireAccountingAccess', 'requireReportsOrBoard', 'requireAccountingWriter', 'requireDonorRead', 'requireContactRead', 'requireContactWrite', 'requirePlatformAdmin'];
function guardsOf(handlers) {
  const mw = handlers.slice(0, -1).flat(Infinity);
  return mw.map((h) => (typeof h === 'function' ? (h.__guard || ('local:' + (h.name || 'anonymous'))) : String(h)));
}
function classify(guards) {
  const has = (n) => guards.some((g) => g === n || g.startsWith(n + '('));
  const hasRole = ROLE_GUARDS.some(has);
  if (!has('requireAuth') && !has('requirePlatformAdmin')) return 'public';
  if (hasRole) return 'role';
  if (guards.some((g) => g.startsWith('local:'))) return 'custom';
  if (has('requireOrgMembership')) return 'member-only';
  return 'auth-only';
}

// Posting helpers: every function a lib file exports when that file calls the ledger posting primitives.
const LIB_DIR = path.join(ROOT, 'organizational', 'lib');
const POSTING_CALL = /\b(postLedgerTransaction|voidLedgerTransaction)\(/;
const postingNames = new Set(['postLedgerTransaction', 'voidLedgerTransaction']);
for (const f of fs.readdirSync(LIB_DIR).filter((n) => n.endsWith('.js') && n !== 'ledgerPosting.js')) {
  if (!POSTING_CALL.test(fs.readFileSync(path.join(LIB_DIR, f), 'utf8'))) continue;
  let m;
  try { m = require(path.join(LIB_DIR, f)); } catch (e) { continue; }
  Object.keys(m).filter((k) => typeof m[k] === 'function' && !/^(preview|compute|load|find|search|get|is|build)/i.test(k)).forEach((k) => postingNames.add(k));
}
const postingCall = new RegExp('\\b(' + [...postingNames].join('|') + ')\\(');

const allow = fs.existsSync(ALLOWLIST) ? JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8')) : {};
const rows = routes.filter((r) => r.method !== 'USE').map((r) => {
  const guards = guardsOf(r.handlers);
  const handlerSrc = String(r.handlers[r.handlers.length - 1]);
  const inline = /coopOrgRole|accessPermissions|hasAccountingAccess|hasDonorAccess|canWrite\(|FINANCE_ROLES|coopOrgProgramIds|coopOrgUserId|isAdmin\(|isFinance|[rR]ole\b/.test(handlerSrc);
  const isWrite = r.method !== 'GET';
  const postsDirectly = isWrite && postingCall.test(handlerSrc) && !/\brunTool\(/.test(handlerSrc);
  return { key: r.method + ' ' + r.path, file: r.file, guards, cls: classify(guards), inline, postsDirectly };
});

const counts = rows.reduce((a, r) => { a[r.cls] = (a[r.cls] || 0) + 1; return a; }, {});
console.log('Routes: ' + rows.length + '  ' + Object.entries(counts).map(([k, v]) => k + '=' + v).join('  '));
if (failed.length) console.log('Could not register: ' + failed.join(' | '));

if (process.argv.includes('--all')) rows.forEach((r) => console.log(r.cls.padEnd(12), r.key, '  [' + r.guards.join(', ') + ']'));

const OPEN = ['member-only', 'auth-only', 'public', 'custom'];
const unreviewed = rows.filter((r) => OPEN.includes(r.cls) && !allow[r.key]);
const stale = Object.keys(allow).filter((k) => !rows.some((r) => r.key === k));
if (unreviewed.length) {
  console.log('\nOpen routes not yet reviewed (' + unreviewed.length + '): reachable without a role or permission check.');
  console.log('Add a role or permission guard, or record why it is open in server/organizational/route-access-allowlist.json.');
  unreviewed.forEach((r) => console.log('  ' + r.cls.padEnd(11) + (r.inline ? '[checks role in handler] ' : '[NO role check seen]     ') + r.key + '   (' + r.file + ')'));
}
if (stale.length) console.log('\nAllowlist entries for routes that no longer exist: ' + stale.join(', '));

const TOOL_ALLOWLIST = path.join(ROOT, 'organizational', 'tool-route-allowlist.json');
const toolAllow = fs.existsSync(TOOL_ALLOWLIST) ? JSON.parse(fs.readFileSync(TOOL_ALLOWLIST, 'utf8')) : {};
if (process.argv.includes('--write-tool-allowlist')) {
  const out = {};
  rows.filter((r) => r.postsDirectly).forEach((r) => { out[r.key] = toolAllow[r.key] || 'Posts to the ledger directly; not yet moved to the tool registry.'; });
  fs.writeFileSync(TOOL_ALLOWLIST, JSON.stringify(out, null, 1) + '\n');
  console.log('Wrote ' + Object.keys(out).length + ' entries to the tool-route allowlist.');
  process.exit(0);
}
const outsideRegistry = rows.filter((r) => r.postsDirectly && !toolAllow[r.key]);
const staleTool = Object.keys(toolAllow).filter((k) => !rows.some((r) => r.key === k && r.postsDirectly));
if (outsideRegistry.length) {
  console.log('\nWrite routes that post to the ledger without the tool registry (' + outsideRegistry.length + '):');
  console.log('Move the action into server/organizational/tools and call runTool, or record why in server/organizational/tool-route-allowlist.json.');
  outsideRegistry.forEach((r) => console.log('  ' + r.key + '   (' + r.file + ')'));
}
if (staleTool.length) {
  console.log('\nTool-route allowlist entries that now go through the registry or no longer exist (remove them): ' + staleTool.join(', '));
}
process.exit(unreviewed.length || outsideRegistry.length || staleTool.length ? 1 : 0);
