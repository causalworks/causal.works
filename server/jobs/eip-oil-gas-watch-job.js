// eip-oil-gas-watch-job.js — EIP Oil & Gas Watch state-permit-tier ingestion.
// Scheduled job: pulls the daily Excel export from EIP's public Google Drive
// folder, reads the "Alerts" sheet (EIP's own pre-filtered new-project/
// comment-period/hearing feed — see below for why this sheet, not the
// Projects/permit-type sheets), and upserts actionable alerts into `actions`.
//
// Runs daily at 05:00 UTC via node-cron — offset an hour past
// permitting-job.js's 04:00 (Federal Register) so the three scheduled jobs
// don't collide.
//
// Why the Alerts sheet, not a classifier like permitting-job.js's:
// EIP's own analysts already classify each alert with an `Alert Type`
// ("New Project" / "Open Comment Period" / "Public Meeting" / "Permit
// Issued" / etc.) — the same new-build-vs-other distinction
// isNewFossilInfrastructureNotice() infers from free text is already a
// clean field here. No phrase classifier needed for this source; EIP's
// dataset is oil/gas/petrochemical-only by design, so turnaround/boundary
// tagging is a fixed constant, not inferred per row either.
//
// Why upsert, not insert-once-and-skip (unlike permitting-job.js):
// the same alert can reappear across daily exports — still Active, deadline
// extended/finalized — so this keys on eip_alert_id (the UUID embedded in
// the alert's OGW URL) and upserts rather than skipping on conflict.
//
// No public API: EIP's site (oilandgaswatch.org) is a Vue SPA with no
// documented external API. The daily Google Drive export is the real
// integration surface. That folder's file ID appears to change with each
// day's filename (date-stamped), so this job re-resolves the current file
// ID from the folder listing on every run rather than hardcoding one —
// treat this as scraping a downloadable file, not calling a stable API.
//
// Data licensed CC BY-NC 4.0 (confirmed directly from oilandgaswatch.org's
// site footer) — NonCommercial clause not yet resolved against Causal's
// use; ingesting now on the basis that EIP's stated purpose includes
// activist/public use, revisit before this reaches wider/production
// audience. See docs/Causal_Development_Path.md's EIP entry.

const cron = require('node-cron');
const ExcelJS = require('exceljs');

const DATABASE_DOWNLOAD_FOLDER_ID = '1ZQ7UpDLtMXrtGbytYL1ug8JoUj1ZFG1g';
const DRIVE_USER_AGENT =
  'Mozilla/5.0 (compatible; CausalWorksBot/1.0; +https://causal.works)';

// EIP's own classification — only these alert types represent a live,
// actionable decision window (as opposed to "Permit Issued", which has
// already happened and carries no Public Action Deadline).
const ACTIONABLE_ALERT_TYPES = new Set(['New Project', 'Open Comment Period', 'Public Meeting']);

function buildEipTemplateCopy(alert) {
  const facility = alert.facilityName || 'this facility';
  const actionType = alert.alertType === 'Public Meeting' ? 'attend' : 'comment';
  return {
    action_type: actionType,
    action_ask:
      actionType === 'attend'
        ? `Attend the public meeting on ${facility} before ${alert.publicActionDeadline}.`
        : `Submit a public comment on ${facility} before the comment period closes.`,
    leverage_point: `State permitting review of ${facility}`.slice(0, 160),
    strategy_text:
      'This is a state environmental permitting review — the state-level counterpart to a federal ' +
      'comment period. A permit issued now typically locks in decades of operation — this is the ' +
      'last point of public influence before that happens.',
  };
}

async function fetchLatestExportFileId() {
  const url = `https://drive.google.com/embeddedfolderview?id=${DATABASE_DOWNLOAD_FOLDER_ID}#list`;
  const res = await fetch(url, {
    headers: { 'User-Agent': DRIVE_USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Drive folder listing HTTP ${res.status}`);
  const html = await res.text();
  // Entries look like: <div class="flip-entry" id="entry-<FILE_ID>" ...> ... flip-entry-title">NAME.xlsx
  const entryRe = /<div class="flip-entry" id="entry-([a-zA-Z0-9_-]+)"[^>]*>[\s\S]{0,1200}?flip-entry-title">([^<]*\.xlsx)/g;
  let latest = null;
  let match;
  while ((match = entryRe.exec(html))) {
    const [, fileId, name] = match;
    // Filenames are date-stamped (e.g. "...- 20260806.xlsx") — sort lexicographically, last wins.
    if (!latest || name > latest.name) latest = { fileId, name };
  }
  if (!latest) throw new Error('No .xlsx entry found in EIP Database Download folder listing');
  return latest;
}

async function downloadExportBuffer(fileId) {
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': DRIVE_USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Drive file download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchEipAlerts() {
  const { fileId, name } = await fetchLatestExportFileId();
  console.log(`  📄 EIP export: ${name} (${fileId})`);
  const buffer = await downloadExportBuffer(fileId);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Alerts');
  if (!ws) throw new Error('Alerts sheet not found in EIP export');

  const headerRow = ws.getRow(1).values; // 1-indexed, [0] is empty
  const colIndex = {};
  headerRow.forEach((h, i) => {
    if (h) colIndex[String(h).trim()] = i;
  });

  const required = ['Affected State', 'Alert Type', 'Alert Title', 'Alert Description', 'Facility/Pipeline Name', 'Public Action Deadline', 'Active', 'Alert OGW URL'];
  for (const col of required) {
    if (!colIndex[col]) throw new Error(`EIP export missing expected column: ${col}`);
  }

  const alerts = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const v = row.values;
    const alertOgwUrl = v[colIndex['Alert OGW URL']] || null;
    // Two id formats seen in the wild: newer UUIDs and legacy Xata-style
    // "rec_..." ids (from before a backend migration) — capture either,
    // not UUID-only, or ~75% of real rows silently get dropped.
    const idMatch = alertOgwUrl && String(alertOgwUrl).match(/\/alert\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return; // no stable id to upsert on — skip

    const deadlineRaw = v[colIndex['Public Action Deadline']];
    const deadline = deadlineRaw
      ? deadlineRaw instanceof Date
        ? deadlineRaw.toISOString().slice(0, 10)
        : String(deadlineRaw).slice(0, 10)
      : null;

    alerts.push({
      eipAlertId: idMatch[1],
      // Stored verbatim, including multi-state strings (e.g. "AL, MS") — no
      // normalization on write, so nothing is lost before it's needed.
      affectedState: v[colIndex['Affected State']] ? String(v[colIndex['Affected State']]).trim() : null,
      alertType: v[colIndex['Alert Type']] ? String(v[colIndex['Alert Type']]).trim() : null,
      alertTitle: v[colIndex['Alert Title']] ? String(v[colIndex['Alert Title']]).trim() : null,
      alertDescription: v[colIndex['Alert Description']] ? String(v[colIndex['Alert Description']]) : null,
      facilityName: v[colIndex['Facility/Pipeline Name']] ? String(v[colIndex['Facility/Pipeline Name']]).trim() : null,
      publicActionDeadline: deadline,
      active: String(v[colIndex['Active']]).toUpperCase() === 'TRUE',
      alertUrl: alertOgwUrl,
    });
  });
  return alerts;
}

async function runEipJob(pool) {
  console.log('🛢  EIP Oil & Gas Watch job starting...');

  let alerts;
  try {
    alerts = await fetchEipAlerts();
  } catch (err) {
    console.error('❌ EIP job: fetch/parse failed:', err.message);
    return;
  }

  let upserted = 0;
  let skippedNotActionable = 0;

  for (const alert of alerts) {
    if (!alert.active || !alert.publicActionDeadline || !ACTIONABLE_ALERT_TYPES.has(alert.alertType)) {
      skippedNotActionable++;
      continue;
    }

    try {
      const { action_type, action_ask, leverage_point, strategy_text } = buildEipTemplateCopy(alert);

      await pool.query(
        `INSERT INTO actions
           (org_name, action_ask, turnaround_category, action_type, leverage_point,
            strategy_text, source_url, decision_window_date, decision_window_label,
            timing_confidence, boundary_ids, source, eip_alert_id, eip_affected_state,
            raw_content)
         VALUES
           ($1, $2, 'Energy', $3, $4,
            $5, $6, $7, $8,
            9, $9, 'eip_oil_gas_watch', $10, $11,
            $12)
         ON CONFLICT (eip_alert_id) WHERE eip_alert_id IS NOT NULL DO UPDATE SET
           action_ask = EXCLUDED.action_ask,
           decision_window_date = EXCLUDED.decision_window_date,
           decision_window_label = EXCLUDED.decision_window_label,
           eip_affected_state = EXCLUDED.eip_affected_state,
           raw_content = EXCLUDED.raw_content`,
        [
          alert.facilityName,
          action_ask,
          action_type,
          leverage_point,
          strategy_text,
          alert.alertUrl,
          alert.publicActionDeadline,
          alert.alertType,
          ['climate'],
          alert.eipAlertId,
          alert.affectedState,
          alert.alertDescription,
        ]
      );
      upserted++;
    } catch (err) {
      console.error(`  ❌ Failed to upsert EIP alert ${alert.eipAlertId}:`, err.message);
    }
  }

  console.log(`🛢  EIP job done. ${upserted} upserted, ${skippedNotActionable} not actionable (of ${alerts.length} total alerts).`);
}

function scheduleEipJob(pool) {
  // Run at 05:00 UTC daily
  cron.schedule('0 5 * * *', () => runEipJob(pool), { timezone: 'UTC' });
  console.log('🛢  EIP Oil & Gas Watch job scheduled (daily 05:00 UTC)');

  // Also run once at startup so fresh deploys don't wait until 5am
  runEipJob(pool);
}

module.exports = { scheduleEipJob, runEipJob, buildEipTemplateCopy, fetchLatestExportFileId };
