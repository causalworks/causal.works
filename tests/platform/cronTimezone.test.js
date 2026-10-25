'use strict';
// Scheduled jobs run on UTC. A job on local time looped at the daylight-saving change (2026-10-25) until the process ran out of memory.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('every cron.schedule call names the UTC timezone', () => {
  const dirs = ['../../server/jobs', '../../server/organizational/jobs'].map((d) => path.join(__dirname, d)).filter((d) => fs.existsSync(d));
  const bad = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const calls = src.split('cron.schedule(').slice(1);
      for (const c of calls) {
        let depth = 1; let i = 0;
        for (; i < c.length && depth > 0; i++) { if (c[i] === '(') depth++; else if (c[i] === ')') depth--; }
        if (!/timezone:\s*'UTC'/.test(c.slice(0, i))) bad.push(f);
      }
    }
  }
  assert.deepEqual(bad, []);
});
