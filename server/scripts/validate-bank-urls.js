#!/usr/bin/env node
// Live-checks every website URL in server/data/bank-alternatives.js and reports
// anything that doesn't actually resolve/respond. Run this periodically (e.g.
// quarterly, alongside a bank-flag-data.js review) — links rot, and nothing else
// in this codebase catches that automatically. Exit code is non-zero if any
// entry fails, so it can be wired into a cron/CI check later if wanted.
//
// Usage: node server/scripts/validate-bank-urls.js

const https = require('https');
const http = require('http');
const { URL } = require('url');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const TIMEOUT_MS = 10000;

function requestOnce(target, method) {
  return new Promise((resolve) => {
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.request(
      target,
      { method, timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode || 0 });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'timeout' });
    });
    req.on('error', (err) => {
      resolve({ error: err.code || err.message });
    });
    req.end();
  });
}

// Some servers reject HEAD (405) or bounce it oddly even when the page is fine —
// fall back to a real GET before calling a URL dead, so a HEAD quirk doesn't
// produce a false "broken link" (this caught two false positives on first run:
// Prime Meridian Bank and Wildfire CU both 405/502'd on HEAD, 200/301'd on GET).
async function checkUrl(rawUrl) {
  let target;
  try {
    target = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch (e) {
    return { ok: false, reason: 'unparseable URL' };
  }

  let result = await requestOnce(target, 'HEAD');
  if (result.error || !result.status || result.status >= 400) {
    result = await requestOnce(target, 'GET');
  }

  if (result.error) return { ok: false, reason: result.error };
  const status = result.status;
  if (status >= 200 && status < 400) return { ok: true, status };
  if (status === 403) return { ok: true, status, warn: 'HTTP 403 — likely bot-blocked, not necessarily dead; verify manually' };
  return { ok: false, status, reason: `HTTP ${status}` };
}

module.exports = { checkUrl };

// Only run as a report when invoked directly (`node validate-bank-urls.js`) —
// enrich-bank-alternatives.js imports checkUrl() instead, to validate URLs at
// generation time rather than only after they're already shipped.
if (require.main === module) {
  (async () => {
    const { BANK_ALTERNATIVES } = require('../data/bank-alternatives');
    const results = [];
    for (const entry of BANK_ALTERNATIVES) {
      const result = await checkUrl(entry.website);
      results.push({ name: entry.name, website: entry.website, ...result });
    }

    const failed = results.filter((r) => !r.ok);
    const warned = results.filter((r) => r.ok && r.warn);

    console.log(`Checked ${results.length} URLs.\n`);

    if (warned.length) {
      console.log(`${warned.length} responded but need a manual look:`);
      warned.forEach((r) => console.log(`  ? ${r.name} — ${r.website} — ${r.warn}`));
      console.log('');
    }

    if (failed.length) {
      console.log(`${failed.length} FAILED — these need a real fix before they're shown to users:`);
      failed.forEach((r) => console.log(`  ✗ ${r.name} — ${r.website} — ${r.reason}`));
      process.exitCode = 1;
    } else {
      console.log('All remaining URLs responded normally.');
    }
  })().catch((error) => {
    console.error(`Script failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
