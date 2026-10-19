'use strict';

// Reusable import preview: sorts incoming rows into new, changed, unchanged, duplicates (the same key twice in the file)
// and rows with errors, so a screen can show counts and nothing is saved until the person confirms. The caller supplies
// how to read the key, validate a row, find the existing record, and compare.

function classifyImport(rows, { keyOf, validate, existingFor, compare }) {
  const out = { new: [], changed: [], unchanged: [], duplicates: [], errors: [] };
  const seen = new Map();
  rows.forEach((row, i) => {
    const line = i + 2;
    const error = validate ? validate(row) : null;
    if (error) { out.errors.push({ line, row, error }); return; }
    const key = keyOf(row);
    if (key) {
      if (seen.has(key)) { out.duplicates.push({ line, row, first_line: seen.get(key) }); return; }
      seen.set(key, line);
    }
    const existing = key ? existingFor(key, row) : null;
    if (!existing) { out.new.push({ line, row }); return; }
    const diff = compare(row, existing);
    if (diff.length) out.changed.push({ line, row, existing, changes: diff });
    else out.unchanged.push({ line, row, existing });
  });
  out.counts = { new: out.new.length, changed: out.changed.length, unchanged: out.unchanged.length, duplicates: out.duplicates.length, errors: out.errors.length };
  return out;
}

module.exports = { classifyImport };
