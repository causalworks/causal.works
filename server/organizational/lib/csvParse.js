'use strict';

const { parse } = require('csv-parse/sync');

/**
 * Parse UTF-8 CSV buffer/string with header row. Returns array of plain objects keyed by header.
 * @param {Buffer|string} input
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
function parseCsvRecords(input) {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  });
  if (!Array.isArray(records) || records.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = Object.keys(records[0] || {});
  // Strip instruction/comment rows (any row where the first column value starts with #)
  const firstHeader = headers[0];
  const rows = firstHeader
    ? records.filter(r => !String(r[firstHeader] || '').trimStart().startsWith('#'))
    : records;
  return { headers, rows };
}

module.exports = { parseCsvRecords };
