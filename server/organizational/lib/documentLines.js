'use strict';

// Line parsing, line replacement and the line queries shared by bill and invoice routes and tools.

function parseBillLines(lines) {
  if (!Array.isArray(lines) || lines.length < 1) {
    return { error: 'lines must be an array of at least 1 entry' };
  }
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] || {};
    const rowNum = i + 1;
    const accountId = Number.parseInt(String(l.account_id), 10);
    const programId = Number.parseInt(String(l.program_id), 10);
    const amountCents = Number.parseInt(String(l.amount_cents), 10);
    if (!Number.isInteger(accountId) || accountId < 1) return { error: `line ${rowNum}: account_id is required` };
    if (!Number.isInteger(programId) || programId < 1) return { error: `line ${rowNum}: program_id is required` };
    if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: `line ${rowNum}: amount_cents must be a positive integer` };
    let grantId = null;
    if (l.grant_id != null && l.grant_id !== '') {
      grantId = Number.parseInt(String(l.grant_id), 10);
      if (!Number.isInteger(grantId) || grantId < 1) return { error: `line ${rowNum}: grant_id must be a positive integer if provided` };
    }
    parsed.push({
      accountId, programId, grantId, amountCents,
      is1099Reportable: l.is_1099_reportable != null ? Boolean(l.is_1099_reportable) : null,
      lineMemo: l.line_memo != null ? String(l.line_memo) : null,
    });
  }
  return { parsedLines: parsed };
}

async function replaceBillLines(client, billId, parsedLines) {
  await client.query('DELETE FROM org_bill_lines WHERE bill_id = $1', [billId]);
  for (const l of parsedLines) {
    await client.query(
      `INSERT INTO org_bill_lines (bill_id, account_id, program_id, grant_id, amount_cents, is_1099_reportable, line_memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [billId, l.accountId, l.programId, l.grantId, l.amountCents, l.is1099Reportable, l.lineMemo]
    );
  }
}

function parseInvoiceLines(lines) {
  if (!Array.isArray(lines) || lines.length < 1) {
    return { error: 'lines must be an array of at least 1 entry' };
  }
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] || {};
    const rowNum = i + 1;
    const accountId = Number.parseInt(String(l.account_id), 10);
    const programId = Number.parseInt(String(l.program_id), 10);
    const unitAmountCents = Number.parseInt(String(l.unit_amount_cents), 10);
    const quantity = l.quantity != null ? Number(l.quantity) : 1;
    if (!Number.isInteger(accountId) || accountId < 1) return { error: `line ${rowNum}: account_id is required` };
    if (!Number.isInteger(programId) || programId < 1) return { error: `line ${rowNum}: program_id is required` };
    if (!Number.isInteger(unitAmountCents) || unitAmountCents <= 0) return { error: `line ${rowNum}: unit_amount_cents must be a positive integer` };
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: `line ${rowNum}: quantity must be a positive number` };
    let fmvCents = null;
    if (l.fair_market_value_cents != null && l.fair_market_value_cents !== '') {
      fmvCents = Number.parseInt(String(l.fair_market_value_cents), 10);
      if (!Number.isInteger(fmvCents) || fmvCents < 0 || fmvCents > unitAmountCents) {
        return { error: `line ${rowNum}: fair_market_value_cents must be between 0 and unit_amount_cents` };
      }
    }
    parsed.push({
      accountId, programId, unitAmountCents, quantity, fmvCents,
      description: l.description != null ? String(l.description) : null,
      lineMemo: l.line_memo != null ? String(l.line_memo) : null,
    });
  }
  return { parsedLines: parsed };
}

async function replaceInvoiceLines(client, invoiceId, parsedLines) {
  await client.query('DELETE FROM org_invoice_lines WHERE invoice_id = $1', [invoiceId]);
  for (const l of parsedLines) {
    await client.query(
      `INSERT INTO org_invoice_lines (invoice_id, account_id, program_id, description, quantity, unit_amount_cents, fair_market_value_cents, line_memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [invoiceId, l.accountId, l.programId, l.description, l.quantity, l.unitAmountCents, l.fmvCents, l.lineMemo]
    );
  }
}

const BILL_LINES_SELECT = `
    SELECT l.id, l.bill_id, l.account_id, a.code AS account_code, a.name AS account_name,
           l.program_id, p.name AS program_name, l.grant_id, g.name AS grant_name,
           l.amount_cents, l.is_1099_reportable, l.line_memo
    FROM org_bill_lines l
    JOIN org_accounts a ON a.id = l.account_id
    JOIN org_programs p ON p.id = l.program_id
    LEFT JOIN org_grants g ON g.id = l.grant_id
    WHERE l.bill_id = $1
    ORDER BY l.id ASC`;

const INVOICE_LINES_SELECT = `
    SELECT l.id, l.invoice_id, l.account_id, a.code AS account_code, a.name AS account_name,
           l.program_id, p.name AS program_name, l.description, l.quantity, l.unit_amount_cents,
           l.fair_market_value_cents, l.line_memo
    FROM org_invoice_lines l
    JOIN org_accounts a ON a.id = l.account_id
    JOIN org_programs p ON p.id = l.program_id
    WHERE l.invoice_id = $1
    ORDER BY l.id ASC`;

module.exports = { parseBillLines, replaceBillLines, parseInvoiceLines, replaceInvoiceLines, BILL_LINES_SELECT, INVOICE_LINES_SELECT };
