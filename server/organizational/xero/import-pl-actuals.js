'use strict';

const { xeroGetJson } = require('./xero-http');
const { invalidateOrganizationalSummaryCache } = require('../lib/OrganizationalSummaryService');

function parseISODateBoundary(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

function monthStartIso(d) {
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}-01`;
}

function enumerateMonths(fromDateStr, toDateStr) {
  const f = parseISODateBoundary(fromDateStr);
  const t = parseISODateBoundary(toDateStr);
  if (!f || !t) throw new Error('Invalid date range; use YYYY-MM-DD');
  const start = new Date(Date.UTC(f.y, f.mo - 1, 1));
  const end = new Date(Date.UTC(t.y, t.mo - 1, 1));
  if (start.getTime() > end.getTime()) throw new Error('from_date must be <= to_date');
  const out = [];
  const cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    out.push({
      year: cur.getUTCFullYear(),
      month: cur.getUTCMonth() + 1,
      iso_start: monthStartIso(cur),
    });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

function toCentsAllowNegative(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100);
}

function normText(v) {
  return String(v == null ? '' : v)
    .trim()
    .toLowerCase();
}

function parseAmountCell(cell) {
  if (cell == null) return null;
  const raw = cell.Value != null ? cell.Value : cell.value;
  if (raw == null || raw === '') return null;
  const s = String(raw).replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function flattenRows(rows, out) {
  const list = Array.isArray(rows) ? rows : [];
  list.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const rowType = String(r.RowType || r.rowType || '').toUpperCase();
    if (rowType === 'ROW' && Array.isArray(r.Cells)) out.push(r);
    if (Array.isArray(r.Rows)) flattenRows(r.Rows, out);
  });
}

function deriveColumnsFromRows(report, months, trackingCategoryId) {
  const flat = [];
  flattenRows(report && report.Rows, flat);
  if (!flat.length) return { accountColIdx: -1, monthCols: [] };
  const maxCells = flat.reduce((m, r) => {
    const n = Array.isArray(r.Cells) ? r.Cells.length : 0;
    return Math.max(m, n);
  }, 0);
  if (maxCells < 2) return { accountColIdx: -1, monthCols: [] };
  const dataColsCount = Math.min(months.length, Math.max(0, maxCells - 1));
  const monthCols = [];
  for (let i = 0; i < dataColsCount; i += 1) {
    monthCols.push({
      idx: i + 1,
      periodYear: months[i].year,
      periodMonth: months[i].month,
      trackingCategoryId: trackingCategoryId || null,
      trackingOptionId: trackingCategoryId ? null : null,
      trackingOptionLabel: null,
    });
  }
  return { accountColIdx: 0, monthCols };
}

function parseColumns(report, months, trackingCategoryId) {
  const colsRaw = Array.isArray(report && report.Columns) ? report.Columns : [];
  if (!colsRaw.length) {
    return deriveColumnsFromRows(report, months, trackingCategoryId);
  }
  const cols = colsRaw.map((c, idx) => {
    const title = String(c.Title || c.title || '').trim();
    const attrs = Array.isArray(c.Attributes) ? c.Attributes : Array.isArray(c.attributes) ? c.attributes : [];
    const attrMap = {};
    attrs.forEach((a) => {
      const key = String(a.Id || a.id || '').trim().toLowerCase();
      if (!key) return;
      attrMap[key] = a.Value != null ? String(a.Value).trim() : '';
    });
    return { idx, title, attrMap };
  });
  if (!cols.length) {
    return { accountColIdx: -1, monthCols: [] };
  }
  const accountCol =
    cols.find((c) => c && (c.attrMap.name === 'account' || c.title.toLowerCase() === 'account')) || cols[0];
  if (!accountCol || typeof accountCol.idx !== 'number') {
    return { accountColIdx: -1, monthCols: [] };
  }
  const dataCols = cols.filter((c) => c.idx !== accountCol.idx);
  const monthCols = [];
  const fallbackTitles = {};
  dataCols.forEach((c) => {
    const tt = c.title.toLowerCase();
    if (!tt || tt === 'total' || tt === 'ytd') return;
    fallbackTitles[c.title] = true;
  });
  const fallbackMonthKeys = Object.keys(fallbackTitles);
  dataCols.forEach((c, i) => {
    if (i >= months.length) return;
    const maybeOpt = c.attrMap.trackingoptionid || c.attrMap.trackingoption || '';
    const optionId = maybeOpt ? String(maybeOpt).trim().toLowerCase() : null;
    monthCols.push({
      idx: c.idx,
      periodYear: months[i].year,
      periodMonth: months[i].month,
      trackingCategoryId: c.attrMap.trackingcategoryid || trackingCategoryId || null,
      trackingOptionId: trackingCategoryId ? optionId : null,
      trackingOptionLabel: c.title || null,
    });
  });
  if (!monthCols.length && fallbackMonthKeys.length && fallbackMonthKeys.length === months.length) {
    fallbackMonthKeys.forEach((_, i) => {
      const c = dataCols[i];
      monthCols.push({
        idx: c.idx,
        periodYear: months[i].year,
        periodMonth: months[i].month,
        trackingCategoryId: trackingCategoryId || null,
        trackingOptionId: null,
        trackingOptionLabel: c.title || null,
      });
    });
  }
  return { accountColIdx: accountCol.idx, monthCols };
}

function deriveAccountCode(accCell, accountName) {
  const codeFromAttr =
    accCell && Array.isArray(accCell.Attributes)
      ? accCell.Attributes.find((a) => String(a.Id || a.id || '').toLowerCase() === 'account')
      : null;
  if (codeFromAttr && codeFromAttr.Value != null) return String(codeFromAttr.Value).trim();
  const m = /^([A-Za-z0-9._-]{2,20})\s*[-:]/.exec(String(accountName || '').trim());
  return m ? m[1] : null;
}

function parseProfitAndLossRows(report, months, parseOpts = {}) {
  const trackingCategoryId = parseOpts.trackingCategoryId || null;
  const forcedCategoryId =
    parseOpts.forcedCategoryId != null && String(parseOpts.forcedCategoryId).trim() !== ''
      ? normText(parseOpts.forcedCategoryId)
      : null;
  const forcedOptionId =
    parseOpts.forcedOptionId != null && String(parseOpts.forcedOptionId).trim() !== ''
      ? normText(parseOpts.forcedOptionId)
      : null;
  const columnHintCategoryId = forcedOptionId ? null : trackingCategoryId;
  const parsedCols = parseColumns(report, months, columnHintCategoryId);
  if (parsedCols.accountColIdx < 0 || !parsedCols.monthCols.length) {
    return { rows: [], debug: { account_col_idx: parsedCols.accountColIdx, month_cols: parsedCols.monthCols.length } };
  }
  const flatRows = [];
  flattenRows(report && report.Rows, flatRows);
  const out = [];
  flatRows.forEach((r) => {
    const cells = Array.isArray(r.Cells) ? r.Cells : [];
    const accCell = cells[parsedCols.accountColIdx];
    const accountName =
      accCell && (accCell.Value != null || accCell.value != null)
        ? String(accCell.Value != null ? accCell.Value : accCell.value).trim()
        : null;
    const code = deriveAccountCode(accCell, accountName);
    if (!code && !accountName) return;
    parsedCols.monthCols.forEach((mc) => {
      const cell = cells[mc.idx];
      const dollars = parseAmountCell(cell);
      if (dollars == null) return;
      const cents = toCentsAllowNegative(dollars);
      out.push({
        period_year: mc.periodYear,
        period_month: mc.periodMonth,
        xero_account_code: code,
        account_name: accountName,
        xero_tracking_category_id: forcedOptionId
          ? forcedCategoryId || (mc.trackingCategoryId ? normText(mc.trackingCategoryId) : null)
          : mc.trackingCategoryId || null,
        xero_tracking_option_id: forcedOptionId || mc.trackingOptionId || null,
        tracking_option_label: mc.trackingOptionLabel,
        amount_cents: cents,
      });
    });
  });
  return { rows: out, debug: { account_col_idx: parsedCols.accountColIdx, month_cols: parsedCols.monthCols.length, flat_rows: flatRows.length } };
}

function uniqueYears(months) {
  const set = new Set();
  months.forEach((m) => set.add(m.year));
  return Array.from(set).sort((a, b) => a - b);
}

async function resolveActivityTrackingCategoryId(pool, orgId) {
  const r = await pool.query(
    `SELECT xero_tracking_category_id
     FROM org_xero_program_track_map
     WHERE org_id = $1
       AND xero_tracking_category_id IS NOT NULL
       AND trim(xero_tracking_category_id) <> ''
     ORDER BY id ASC
     LIMIT 1`,
    [orgId]
  );
  if (!r.rows[0]) return null;
  return String(r.rows[0].xero_tracking_category_id || '').trim().toLowerCase() || null;
}

async function loadAccountCodeMap(pool, orgId) {
  const r = await pool.query(
    `SELECT id, code, xero_account_id
     FROM org_accounts
     WHERE org_id = $1`,
    [orgId]
  );
  const byCode = new Map();
  const byXeroId = new Map();
  r.rows.forEach((row) => {
    const accountCode = normText(row.code);
    if (accountCode) byCode.set(accountCode, row.id);
    const xid = normText(row.xero_account_id);
    if (xid) byXeroId.set(xid, row.id);
  });
  return { byCode, byXeroId };
}

async function loadTrackingOptionMappings(pool, orgId) {
  const r = await pool.query(
    `SELECT
       lower(trim(m.xero_tracking_category_id)) AS cat_id,
       lower(trim(m.xero_tracking_option_id)) AS opt_id,
       lower(trim(m.dimension)) AS dimension,
       m.coop_program_id,
       p.parent_id
     FROM org_xero_program_track_map m
     LEFT JOIN org_programs p ON p.id = m.coop_program_id
     WHERE m.org_id = $1`,
    [orgId]
  );
  const out = new Map();
  for (const row of r.rows) {
    const cat = normText(row.cat_id);
    const opt = normText(row.opt_id);
    const dim = normText(row.dimension);
    if (!cat || !opt || (dim !== 'program' && dim !== 'activity')) continue;
    const key = cat + '|' + opt;
    if (!out.has(key)) {
      out.set(key, { program: null, activity: null, activity_parent_id: null });
    }
    const slot = out.get(key);
    if (dim === 'program') {
      slot.program = row.coop_program_id != null ? Number(row.coop_program_id) : null;
    } else {
      slot.activity = row.coop_program_id != null ? Number(row.coop_program_id) : null;
      slot.activity_parent_id = row.parent_id != null ? Number(row.parent_id) : null;
    }
  }
  return out;
}

/** Distinct (category, option) pairs from the program track map — drives per-option P&L fetches (Spec 3.4.1). */
async function loadDistinctMapTrackingOptions(pool, orgId) {
  const r = await pool.query(
    `SELECT DISTINCT
       lower(trim(m.xero_tracking_category_id)) AS cat_id,
       lower(trim(m.xero_tracking_option_id)) AS opt_id
     FROM org_xero_program_track_map m
     WHERE m.org_id = $1
       AND m.xero_tracking_category_id IS NOT NULL
       AND trim(m.xero_tracking_category_id) <> ''
       AND m.xero_tracking_option_id IS NOT NULL
       AND trim(m.xero_tracking_option_id) <> ''`,
    [orgId]
  );
  const out = [];
  for (const row of r.rows) {
    const cat = normText(row.cat_id);
    const opt = normText(row.opt_id);
    if (cat && opt) out.push({ cat_id: cat, opt_id: opt });
  }
  return out;
}

function plRowAggKey(row) {
  const code = normText(row.xero_account_code);
  const name = normText(row.account_name);
  return `${code}|${name}|${row.period_year}|${row.period_month}`;
}

function plDedupeKey(row) {
  const track = row.xero_tracking_option_id ? row.xero_tracking_option_id : 'none';
  return `pl:${row.period_year}-${row.period_month}:${row.org_account_id}:${track}`;
}

async function fetchPlReportForMonths(accessToken, tenantId, months, opts = {}) {
  const trackingCategoryId = opts.trackingCategoryId != null ? String(opts.trackingCategoryId).trim() : '';
  const trackingOptionId = opts.trackingOptionId != null ? String(opts.trackingOptionId).trim() : '';
  if (!months.length) return { rows: [], debug: { skipped_empty_month_group: true } };
  const first = months[0];
  const last = months[months.length - 1];
  const fromDate = `${first.year}-${String(first.month).padStart(2, '0')}-01`;
  const toDate = `${last.year}-${String(last.month).padStart(2, '0')}-28`;
  const params = new URLSearchParams();
  params.set('fromDate', fromDate);
  params.set('toDate', toDate);
  params.set('timeframe', 'MONTH');
  if (months.length >= 1 && months.length <= 11) {
    params.set('periods', String(months.length));
  }
  if (trackingCategoryId) params.set('trackingCategoryID', trackingCategoryId);
  if (trackingOptionId) params.set('trackingOptionID', trackingOptionId);
  let json;
  try {
    json = await xeroGetJson(accessToken, tenantId, `/api.xro/2.0/Reports/ProfitAndLoss?${params.toString()}`);
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (!/period parameter/i.test(msg) || !params.has('periods')) {
      throw err;
    }
    params.delete('periods');
    json = await xeroGetJson(accessToken, tenantId, `/api.xro/2.0/Reports/ProfitAndLoss?${params.toString()}`);
  }
  const reports = Array.isArray(json && json.Reports) ? json.Reports : [];
  const report = reports[0];
  if (!report) {
    return { rows: [], debug: { reports_count: reports.length, missing_report: true, requested_months: months.length } };
  }
  const parseOpts = trackingOptionId
    ? {
        trackingCategoryId: null,
        forcedCategoryId: trackingCategoryId || null,
        forcedOptionId: trackingOptionId,
      }
    : { trackingCategoryId: trackingCategoryId || null };
  const parsed = parseProfitAndLossRows(report, months, parseOpts);
  return {
    rows: parsed.rows,
    debug: {
      reports_count: reports.length,
      columns_count: Array.isArray(report.Columns) ? report.Columns.length : 0,
      requested_months: months.length,
      tracking_category_id: trackingCategoryId || null,
      tracking_option_id: trackingOptionId || null,
      parsed: parsed.debug,
    },
  };
}

function chunkMonths(months, chunkSize) {
  const out = [];
  for (let i = 0; i < months.length; i += chunkSize) {
    out.push(months.slice(i, i + chunkSize));
  }
  return out;
}

async function importProfitAndLossActualsForOrg(pool, orgId, accessToken, tenantId, fromDateStr, toDateStr) {
  const monthsAll = enumerateMonths(fromDateStr, toDateStr);
  const years = uniqueYears(monthsAll);
  const activityTrackingCategoryId = await resolveActivityTrackingCategoryId(pool, orgId);
  const accountMaps = await loadAccountCodeMap(pool, orgId);
  const trackingMappings = await loadTrackingOptionMappings(pool, orgId);
  const distinctMapOptions = await loadDistinctMapTrackingOptions(pool, orgId);
  const usePerOptionFlow = distinctMapOptions.length > 0;

  const parsedRows = [];
  const importerDebug = [];
  let optionsIterated = 0;

  for (const y of years) {
    const monthsForYear = monthsAll.filter((m) => m.year === y);
    const monthGroups = chunkMonths(monthsForYear, 11);
    for (const group of monthGroups) {
      const rangeMeta = {
        year: y,
        from: `${group[0].year}-${String(group[0].month).padStart(2, '0')}`,
        to: `${group[group.length - 1].year}-${String(group[group.length - 1].month).padStart(2, '0')}`,
      };
      if (!usePerOptionFlow) {
        const out = await fetchPlReportForMonths(accessToken, tenantId, group, {
          trackingCategoryId: activityTrackingCategoryId || undefined,
        });
        parsedRows.push(...out.rows);
        importerDebug.push({ ...rangeMeta, pass: 'single', ...out.debug });
        continue;
      }

      const baseline = await fetchPlReportForMonths(accessToken, tenantId, group, {});
      importerDebug.push({ ...rangeMeta, pass: 'baseline_unfiltered', ...baseline.debug });

      const taggedSumByKey = new Map();
      const optionRows = [];
      for (const { cat_id, opt_id } of distinctMapOptions) {
        optionsIterated += 1;
        const optOut = await fetchPlReportForMonths(accessToken, tenantId, group, {
          trackingCategoryId: cat_id,
          trackingOptionId: opt_id,
        });
        importerDebug.push({
          ...rangeMeta,
          pass: 'option_filtered',
          option_id: opt_id,
          category_id: cat_id,
          ...optOut.debug,
        });
        for (const r of optOut.rows) {
          const row = {
            ...r,
            xero_tracking_category_id: cat_id,
            xero_tracking_option_id: opt_id,
          };
          optionRows.push(row);
          const k = plRowAggKey(row);
          taggedSumByKey.set(k, (taggedSumByKey.get(k) || 0) + row.amount_cents);
        }
      }

      const baselineByKey = new Map();
      const baselineTemplateByKey = new Map();
      for (const r of baseline.rows) {
        const k = plRowAggKey(r);
        baselineByKey.set(k, (baselineByKey.get(k) || 0) + r.amount_cents);
        if (!baselineTemplateByKey.has(k)) baselineTemplateByKey.set(k, r);
      }

      const untaggedRows = [];
      for (const [k, baseAmount] of baselineByKey) {
        const tagged = taggedSumByKey.get(k) || 0;
        const untaggedCents = baseAmount - tagged;
        if (untaggedCents === 0) continue;
        const tmpl = baselineTemplateByKey.get(k);
        if (!tmpl) continue;
        untaggedRows.push({
          period_year: tmpl.period_year,
          period_month: tmpl.period_month,
          xero_account_code: tmpl.xero_account_code,
          account_name: tmpl.account_name,
          xero_tracking_category_id: null,
          xero_tracking_option_id: null,
          tracking_option_label: null,
          amount_cents: untaggedCents,
          synthetic_untagged: true,
        });
      }

      parsedRows.push(...optionRows, ...untaggedRows);
      importerDebug.push({
        ...rangeMeta,
        pass: 'untagged_synthesized',
        untagged_row_count: untaggedRows.length,
        option_row_count: optionRows.length,
      });
    }
  }

  let rowsImported = 0;
  let rowsUpdated = 0;
  let rowsWithTracking = 0;
  let rowsUntagged = 0;
  const accountsCovered = new Set();
  const periodsCovered = new Set();
  const unmappedAccounts = new Set();
  const unmappedTrackingOptions = new Set();
  let mappedToProgram = 0;
  let mappedToActivity = 0;

  for (const row of parsedRows) {
    const codeKey = normText(row.xero_account_code);
    const coopAccountId = accountMaps.byCode.get(codeKey) || accountMaps.byXeroId.get(codeKey) || null;
    if (!coopAccountId) {
      unmappedAccounts.add(row.xero_account_code || row.account_name || 'unknown');
      continue;
    }
    if (row.xero_tracking_option_id) rowsWithTracking += 1;
    else rowsUntagged += 1;
    let resolvedProgramId = null;
    let resolvedActivityId = null;
    let autoMatchedProgram = false;
    let autoMatchedActivity = false;

    const catKey = normText(row.xero_tracking_category_id);
    const optKey = normText(row.xero_tracking_option_id);
    if (catKey && optKey) {
      const mapRow = trackingMappings.get(catKey + '|' + optKey) || null;
      if (mapRow && mapRow.activity != null) {
        resolvedActivityId = mapRow.activity;
        resolvedProgramId = mapRow.activity_parent_id != null ? mapRow.activity_parent_id : null;
        autoMatchedActivity = true;
        autoMatchedProgram = true;
        mappedToActivity += 1;
      } else if (mapRow && mapRow.program != null) {
        resolvedProgramId = mapRow.program;
        autoMatchedProgram = true;
        mappedToProgram += 1;
      } else {
        unmappedTrackingOptions.add(
          (row.tracking_option_label || row.xero_tracking_option_id || 'unknown') +
            (row.xero_tracking_category_id ? ' (' + row.xero_tracking_category_id + ')' : '')
        );
      }
    } else if (
      activityTrackingCategoryId &&
      !row.xero_tracking_option_id &&
      !row.synthetic_untagged
    ) {
      // Tracking dimension is active but this row had no option assignment.
      unmappedTrackingOptions.add(row.tracking_option_label || `${row.period_year}-${row.period_month}`);
    }
    const dedupe_key = plDedupeKey({
      period_year: row.period_year,
      period_month: row.period_month,
      org_account_id: coopAccountId,
      xero_tracking_option_id: row.xero_tracking_option_id,
    });
    const q = await pool.query(
      `INSERT INTO org_actuals (
         org_id, status, source, dedupe_key,
         period_year, period_month, description, currency_code, amount_cents,
         xero_tracking_option_id, org_account_id, org_program_id, org_activity_id,
         auto_matched_account, auto_matched_program, auto_matched_activity, raw
       ) VALUES (
         $1, 'pending', 'xero', $2,
         $3, $4, $5, 'USD', $6,
         $7, $8, $9, $10,
         TRUE, $11, $12, $13::jsonb
       )
       ON CONFLICT (org_id, dedupe_key)
       DO UPDATE SET
         amount_cents = EXCLUDED.amount_cents,
         description = EXCLUDED.description,
         xero_tracking_option_id = EXCLUDED.xero_tracking_option_id,
         org_account_id = EXCLUDED.org_account_id,
         org_program_id = EXCLUDED.org_program_id,
         org_activity_id = EXCLUDED.org_activity_id,
         auto_matched_account = EXCLUDED.auto_matched_account,
         auto_matched_program = EXCLUDED.auto_matched_program,
         auto_matched_activity = EXCLUDED.auto_matched_activity,
         updated_at = NOW(),
         raw = EXCLUDED.raw
       RETURNING (xmax = 0) AS inserted`,
      [
        orgId,
        dedupe_key,
        row.period_year,
        row.period_month,
        row.account_name || row.xero_account_code || null,
        row.amount_cents,
        row.xero_tracking_option_id || null,
        coopAccountId,
        resolvedProgramId,
        resolvedActivityId,
        autoMatchedProgram,
        autoMatchedActivity,
        JSON.stringify({
          account_code: row.xero_account_code || null,
          account_name: row.account_name || null,
          tracking_category_id: row.xero_tracking_category_id || null,
          tracking_option_id: row.xero_tracking_option_id || null,
          tracking_option_label: row.tracking_option_label || null,
          synthetic_untagged: row.synthetic_untagged === true,
          importer: 'pl-report-v2',
        }),
      ]
    );
    if (q.rows[0] && q.rows[0].inserted) rowsImported += 1;
    else rowsUpdated += 1;
    accountsCovered.add(coopAccountId);
    periodsCovered.add(`${row.period_year}-${row.period_month}`);
  }

  if (rowsImported > 0 || rowsUpdated > 0) {
    await invalidateOrganizationalSummaryCache(pool, orgId);
  }

  return {
    rows_imported: rowsImported,
    rows_updated: rowsUpdated,
    periods_covered: periodsCovered.size,
    accounts_covered: accountsCovered.size,
    unmapped_accounts: Array.from(unmappedAccounts),
    unmapped_tracking_options: Array.from(unmappedTrackingOptions),
    mapped_to_program: mappedToProgram,
    mapped_to_activity: mappedToActivity,
    options_iterated: optionsIterated,
    rows_with_tracking: rowsWithTracking,
    rows_untagged: rowsUntagged,
    inserted: rowsImported,
    skipped: rowsUpdated,
    fetched_transactions: 0,
    debug: {
      months_requested: monthsAll.length,
      parsed_rows: parsedRows.length,
      per_option_flow: usePerOptionFlow,
      distinct_map_options: distinctMapOptions.length,
      groups: importerDebug,
    },
  };
}

module.exports = {
  importProfitAndLossActualsForOrg,
  parseISODateBoundary,
};
