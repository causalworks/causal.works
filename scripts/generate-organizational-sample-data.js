#!/usr/bin/env node
/**
 * Deterministic NP CSV import samples for public/np/data/templates/.
 * Usage: node scripts/generate-np-sample-data.js [--out DIR] [--fy FY] [--base-year Y]
 * Default out: public/np/data/templates, fy: 2026, base-year (actuals): 2025
 */
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const out = { dir: path.join(__dirname, '..', 'public', 'np', 'data', 'templates'), fy: 2026, baseYear: 2025 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) {
      out.dir = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--fy' && argv[i + 1]) {
      out.fy = Number.parseInt(argv[i + 1], 10);
      i += 1;
    } else if (argv[i] === '--base-year' && argv[i + 1]) {
      out.baseYear = Number.parseInt(argv[i + 1], 10);
      i += 1;
    }
  }
  return out;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function main() {
  const { dir, fy, baseYear } = parseArgs();

  const coaHeaders = [
    'account_code',
    'account_name',
    'account_type',
    'category',
    'subcategory',
    'description',
    'qb_xero_code',
    'active',
  ];

  const coaRows = [
    ['1200', 'Operating checking', 'Bank', 'Cash', '', '', '1200', 'true'],
    ['1210', 'Payroll clearing', 'Bank', 'Cash', '', '', '1210', 'true'],
    ['1220', 'Savings', 'Bank', 'Cash', '', '', '1220', 'true'],
    ['1300', 'Accounts receivable', 'Current Asset', 'AR', '', '', '1300', 'true'],
    ['1310', 'Pledges receivable', 'Current Asset', 'AR', '', '', '1310', 'true'],
    ['1400', 'Prepaid expenses', 'Current Asset', 'Other CA', '', '', '1400', 'true'],
    ['1410', 'Inventory supplies', 'Current Asset', 'Other CA', '', '', '1410', 'true'],
    ['1500', 'Equipment', 'Fixed Asset', 'FA', '', '', '1500', 'true'],
    ['1510', 'Leasehold improvements', 'Fixed Asset', 'FA', '', '', '1510', 'true'],
    ['1590', 'Accumulated depreciation', 'Other Asset', 'Contra FA', '', '', '1590', 'true'],
    ['2000', 'Accounts payable', 'Current Liability', 'AP', '', '', '2000', 'true'],
    ['2100', 'Accrued payroll', 'Current Liability', 'Accrued', '', '', '2100', 'true'],
    ['2200', 'Deferred grant revenue', 'Current Liability', 'Deferred', '', '', '2200', 'true'],
    ['2300', 'Accrued expenses', 'Current Liability', 'Accrued', '', '', '2300', 'true'],
    ['2400', 'Notes payable', 'Long-Term Liability', 'LTD', '', '', '2400', 'true'],
    ['3000', 'Net assets without donor restrictions', 'Net Assets', 'NA', '', '', '3000', 'true'],
    ['3100', 'Net assets with donor restrictions — time', 'Net Assets', 'NA', '', '', '3100', 'true'],
    ['3200', 'Net assets with donor restrictions — purpose', 'Net Assets', 'NA', '', '', '3200', 'true'],
    ['4000', 'Contributions — individuals', 'Income', 'Support', '', '', '4000', 'true'],
    ['4100', 'Contributions — corporate', 'Income', 'Support', '', '', '4100', 'true'],
    ['4200', 'Government grants', 'Income', 'Grants', '', '', '4200', 'true'],
    ['4300', 'Foundation grants — restricted', 'Income', 'Grants', '', '', '4300', 'true'],
    ['4400', 'Foundation grants — unrestricted', 'Income', 'Grants', '', '', '4400', 'true'],
    ['4500', 'Program service revenue', 'Income', 'Program', '', '', '4500', 'true'],
    ['4600', 'Investment income', 'Income', 'Other', '', '', '4600', 'true'],
    ['4700', 'In-kind contributions', 'Income', 'Other', '', '', '4700', 'true'],
    ['4800', 'Special events revenue', 'Income', 'Other', '', '', '4800', 'true'],
    ['5000', 'Salaries — program', 'Expense', 'Personnel', 'Program', '', '5000', 'true'],
    ['5100', 'Salaries — admin', 'Expense', 'Personnel', 'G&A', '', '5100', 'true'],
    ['5200', 'Payroll taxes', 'Expense', 'Personnel', '', '', '5200', 'true'],
    ['5300', 'Employee benefits', 'Expense', 'Personnel', '', '', '5300', 'true'],
    ['6000', 'Occupancy', 'Expense', 'Facilities', '', '', '6000', 'true'],
    ['6100', 'Utilities', 'Expense', 'Facilities', '', '', '6100', 'true'],
    ['6200', 'Office supplies', 'Expense', 'Operations', '', '', '6200', 'true'],
    ['6300', 'Professional fees', 'Expense', 'Professional', '', '', '6300', 'true'],
    ['6400', 'Travel', 'Expense', 'Program', '', '', '6400', 'true'],
    ['6500', 'Insurance', 'Expense', 'Operations', '', '', '6500', 'true'],
    ['6600', 'Information technology', 'Expense', 'Operations', '', '', '6600', 'true'],
    ['6700', 'Marketing', 'Expense', 'Fundraising', '', '', '6700', 'true'],
    ['6800', 'Program supplies', 'Expense', 'Program', '', '', '6800', 'true'],
    ['6900', 'Special events expense', 'Expense', 'Fundraising', '', '', '6900', 'true'],
    ['7000', 'Depreciation', 'Expense', 'Facilities', '', '', '7000', 'true'],
    ['7100', 'Other expenses', 'Expense', 'Operations', '', '', '7100', 'true'],
  ];

  writeCsv(path.join(dir, 'coa.template.csv'), coaHeaders, []);
  writeCsv(path.join(dir, 'coa.csv'), coaHeaders, coaRows);

  const progHeaders = [
    'code',
    'name',
    'type',
    'parent_code',
    'fiscal_year_start',
    'fiscal_year_end',
    'program_manager',
    'description',
    'active',
  ];
  const progRows = [
    ['P01', 'Youth Arts Program', 'program', '', '', '', 'A. Rivera', 'Core youth programming', 'true'],
    ['P01-A1', 'Summer Workshop', 'activity', 'P01', '', '', '', '', 'true'],
    ['P01-A2', 'After-school', 'activity', 'P01', '', '', '', '', 'true'],
    ['P02', 'Community Outreach', 'program', '', '', '', 'J. Chen', '', 'true'],
    ['P02-A1', 'Public Events', 'activity', 'P02', '', '', '', '', 'true'],
    ['P02-A2', 'Partnerships', 'activity', 'P02', '', '', '', '', 'true'],
    ['P03', 'Artist Residency', 'program', '', '', '', '', '', 'true'],
    ['P04', 'General', 'program', '', '', '', '', 'Management & general', 'true'],
    ['P05', 'Fundraising', 'program', '', '', '', '', '', 'true'],
  ];
  writeCsv(path.join(dir, 'programs.template.csv'), progHeaders, []);
  writeCsv(path.join(dir, 'programs.csv'), progHeaders, progRows);

  const grantHeaders = [
    'grant_code',
    'funder',
    'grant_name',
    'request_amount',
    'status',
    'grant_amount',
    'start_date',
    'end_date',
    'type',
    'primary_program_code',
    'restrictions',
    'fy_allocations',
    'next_report_due',
    'final_report_submitted',
    'renewal_application_due',
    'notes',
  ];
  const fyKey = 'FY' + String(fy);
  const fyNextKey = 'FY' + String(fy + 1);
  const grantRows = [
    [
      'G-NSF-01',
      'National Science Foundation',
      'STEM Youth Access',
      '95000',
      'awarded',
      '120000',
      `${fy}-01-01`,
      `${fy + 1}-06-30`,
      'restricted',
      'P01',
      'Use for P01 only',
      `{"${fyKey}":60000,"${fyNextKey}":60000}`,
      `${fy}-09-01`,
      '',
      '',
      '',
    ],
    [
      'G-UNITED-02',
      'United Way',
      'General operating',
      '',
      'awarded',
      '85000',
      `${fy}-01-01`,
      `${fy}-12-31`,
      'unrestricted',
      'P04',
      '',
      `{"${fyKey}":85000}`,
      '',
      '',
      '',
      '',
    ],
    ['G-STATE-03', 'State Arts Council', 'Festival grant', '40000', 'closed', '40000', `${fy - 1}-07-01`, `${fy - 1}-12-31`, 'restricted', 'P02', '', '', '', `${fy - 1}-12-15`, '', ''],
    ['G-FOUND-04', 'Example Foundation', 'Capacity building', '250000', 'applied', '', '', '', 'unrestricted', 'P04', '', '', `${fy}-05-01`, '', '', ''],
    ['G-DONOR-05', 'Regional Bank', 'Capital campaign', '500000', 'prospect', '', '', '', '', '', '', '', '', '', '', ''],
    ['G-FED-06', 'Federal Agency X', 'Innovation pilot', '180000', 'declined', '', '', '', '', 'P03', '', '', '', '', '', ''],
  ];
  writeCsv(path.join(dir, 'grants.template.csv'), grantHeaders, []);
  writeCsv(path.join(dir, 'grants.csv'), grantHeaders, grantRows);

  const expCodes = ['5000', '5100', '5200', '6000', '6100', '6200', '6300', '6400', '6600', '6800', '7000'];
  const progCodes = ['P01', 'P02', 'P04', 'P05'];
  const budgetHeaders = [
    'fiscal_year',
    'month',
    'account_code',
    'program_code',
    'activity_code',
    'grant_code',
    'amount',
    'notes',
  ];
  const budgetRows = [];
  for (const acct of expCodes) {
    for (const pc of progCodes) {
      for (let m = 1; m <= 12; m += 1) {
        const base = 800 + (parseInt(acct.slice(0, 2), 10) % 7) * 50 + m * 12;
        const gc =
          acct === '5000' && pc === 'P01' && m <= 6 ? 'G-NSF-01' : acct === '5100' && pc === 'P04' && m <= 3 ? 'G-UNITED-02' : '';
        budgetRows.push([String(fy), String(m), acct, pc, '', gc, String(base), '']);
      }
    }
  }
  writeCsv(path.join(dir, 'budget_lines.template.csv'), budgetHeaders, []);
  writeCsv(path.join(dir, 'budget_lines.csv'), budgetHeaders, budgetRows);

  const actHeaders = [
    'date',
    'account_code',
    'program_code',
    'activity_code',
    'grant_code',
    'amount',
    'description',
    'reference',
  ];
  const actRows = [];
  const incCodes = ['4000', '4100', '4500'];
  let ref = 1000;
  for (const y of [baseYear, fy]) {
    const months = y === fy ? [1, 2, 3] : Array.from({ length: 12 }, (_, i) => i + 1);
    for (const m of months) {
      for (const acct of [...expCodes.slice(0, 6), ...incCodes]) {
        const t = incCodes.includes(acct) ? 'income' : 'expense';
        const amt = t === 'income' ? 1200 + m * 40 + ref % 200 : 900 + m * 35 + ref % 150;
        const pc = m % 4 === 0 ? 'P02' : m % 4 === 1 ? 'P01' : 'P04';
        const act = pc === 'P01' && m % 2 === 0 ? 'P01-A1' : pc === 'P02' ? 'P02-A1' : '';
        const gc = acct === '5000' && pc === 'P01' && m <= 4 ? 'G-NSF-01' : '';
        const d = `${y}-${String(m).padStart(2, '0')}-15`;
        actRows.push([d, acct, pc, act, gc, String(amt), `${t} sample`, `csv-${y}-${m}-${acct}-${ref}`]);
        ref += 1;
      }
    }
  }
  writeCsv(path.join(dir, 'actuals.template.csv'), actHeaders, []);
  writeCsv(path.join(dir, 'actuals.csv'), actHeaders, actRows);

  const bsHeaders = ['as_of_date', 'account_code', 'balance', 'restriction_class', 'notes'];
  const bsDate = `${baseYear}-12-31`;
  const bsRows = [
    [bsDate, '1200', '185000', '', ''],
    [bsDate, '1300', '12000', '', ''],
    [bsDate, '1400', '4500', '', ''],
    [bsDate, '1500', '220000', '', ''],
    [bsDate, '1590', '-55000', '', ''],
    [bsDate, '2000', '8000', '', ''],
    [bsDate, '2100', '15000', '', ''],
    [bsDate, '2200', '25000', '', ''],
    [bsDate, '3000', '320000', 'unrestricted', ''],
    [bsDate, '3100', '40000', 'temporarily_restricted', ''],
    [bsDate, '3200', '15000', 'permanently_restricted', ''],
  ];
  writeCsv(path.join(dir, 'balance_sheet.template.csv'), bsHeaders, []);
  writeCsv(path.join(dir, 'balance_sheet.csv'), bsHeaders, bsRows);

  const readme = `# NP CSV import samples

Generated by \`node scripts/generate-np-sample-data.js\` (deterministic; pass \`--fy\`, \`--base-year\`, \`--out\` to shift periods).

## Conventions

- UTF-8, comma-separated, header row required.
- Dates: \`YYYY-MM-DD\`; amounts: plain decimals (no \`$\`, no thousands separators).
- Import **order** for a fresh org: coa → programs → grants → budget_lines → actuals → balance_sheet.

## Files

| File | Description |
|------|-------------|
| coa.csv | Chart of accounts (~ASU-style nonprofit COA) |
| programs.csv | Programs P01–P05 + activities |
| grants.csv | Six grants across lifecycle statuses |
| budget_lines.csv | FY sample expense budget by program/month |
| actuals.csv | Sparse P&L-style activity for base year + Q1 FY |
| balance_sheet.csv | Opening snapshot ${bsDate} |

Templates (\`*.template.csv\`) are header-only for "Download template" in **Settings → Imports**.

## API

\`POST /api/np/orgs/:slug/import/{coa|programs|grants|budget-lines|actuals|balance-sheet}\` with multipart field \`file\`.

See \`Causal_Development_Path.md\` / product spec for full column definitions.
`;
  fs.writeFileSync(path.join(dir, 'README.md'), readme, 'utf8');

  console.log('Wrote samples to', dir);
}

main();
