'use strict';

// Entry for `node --test tests/` on Node versions that resolve the folder to this file: loads every *.test.js below it.

const fs = require('fs');
const path = require('path');

function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.test.js')) require(full);
  }
}

walk(__dirname);
