// permitting-job.js — Federal Register permitting/siting ingestion.
// Scheduled job: pulls open-comment Federal Register notices, runs them
// through the existing quality gate + E4A bucket tagging (policy-feed.js),
// then checks each of INFRASTRUCTURE_CATEGORIES' binary siting-notice
// filters (fossil, CAFO, chemical facility, mining, large water withdrawal —
// first match wins) and inserts matches as federal_register-sourced actions
// with decision_window_date set directly from the notice's own comment-close
// date, tagged with that category's turnaround/boundary_ids rather than a
// single hardcoded default.
//
// Runs daily at 04:00 UTC via node-cron — offset an hour from timing-job's
// 03:00 so the two scheduled jobs don't hit the DB in the same minute.
//
// Deliberately NOT using extractAction()/Gemini: Federal Register data is
// already structured (agency, docket number, deadline, title come straight
// from the API), so there's nothing free-text to extract. Leverage-point/
// strategy copy is template text for v1, not AI-generated — see
// buildTemplateCopy() below.

const cron = require('node-cron');
const {
  fetchFederalRegisterOpenComments,
  inferE4ABuckets,
  passesFrQualityGate,
  INFRASTRUCTURE_CATEGORIES,
} = require('../policy-feed');

// Template leverage_point/strategy_text — fixed copy per notice, with the
// project name/agency substituted in. Revisit AI-generated copy later if
// this reads too generic across a range of real notices; not solving that
// now.
function buildTemplateCopy(item) {
  const projectName = item.title || 'this project';
  const agency = item.agency_summary || 'the reviewing agency';
  return {
    action_ask: `Submit a public comment on ${projectName} before the comment period closes.`,
    leverage_point: `${agency} review of ${projectName}`.slice(0, 160),
    strategy_text:
      'This is a federal environmental review before construction is approved. ' +
      'A permit issued now typically locks in 30+ years of operation — this comment ' +
      'period is the last point of influence before that happens.',
  };
}

async function runPermittingJob(pool) {
  console.log('🏗  Permitting job starting...');

  let notices;
  try {
    notices = await fetchFederalRegisterOpenComments();
  } catch (err) {
    console.error('❌ Permitting job: Federal Register fetch failed:', err.message);
    return;
  }

  let inserted = 0;
  let skippedGate = 0;
  let skippedNoCategoryMatch = 0;
  let skippedDuplicate = 0;
  const insertedByCategory = {};

  for (const item of notices) {
    const e4aBuckets = inferE4ABuckets(item);
    if (!e4aBuckets.length || !passesFrQualityGate(item, e4aBuckets)) {
      skippedGate++;
      continue;
    }

    const category = INFRASTRUCTURE_CATEGORIES.find((c) => c.test(item));
    if (!category) {
      skippedNoCategoryMatch++;
      continue;
    }

    const docketNumber = item.document_number;
    if (!docketNumber) {
      skippedGate++;
      continue;
    }

    try {
      const existing = await pool.query(
        `SELECT id FROM actions WHERE fr_docket_number = $1 LIMIT 1`,
        [docketNumber]
      );
      if (existing.rows.length) {
        skippedDuplicate++;
        continue;
      }

      const { action_ask, leverage_point, strategy_text } = buildTemplateCopy(item);
      const turnaround_category = category.turnaround_category;
      const secondary_turnarounds = e4aBuckets.filter((b) => b !== turnaround_category);

      await pool.query(
        `INSERT INTO actions
           (org_name, action_ask, turnaround_category, secondary_turnarounds,
            action_type, leverage_point, strategy_text, source_url,
            decision_window_date, decision_window_label, timing_confidence,
            boundary_ids, source, fr_docket_number, fr_agency, fr_document_url,
            raw_content)
         VALUES
           ($1, $2, $3, $4, 'comment', $5, $6, $7,
            $8, 'Federal Register comment period', 9,
            $9, 'federal_register', $10, $11, $12, $13)`,
        [
          item.agency_summary || null,
          action_ask,
          turnaround_category,
          secondary_turnarounds,
          leverage_point,
          strategy_text,
          item.federal_register_url || null,
          item.comment_close_on,
          category.boundary_ids,
          docketNumber,
          item.agency_summary || null,
          item.federal_register_url || null,
          item.abstract || item.title || null,
        ]
      );
      inserted++;
      insertedByCategory[category.id] = (insertedByCategory[category.id] || 0) + 1;
      console.log(`  ✅ Inserted docket ${docketNumber} [${category.id}]: ${item.title}`);
    } catch (err) {
      console.error(`  ❌ Failed to insert docket ${docketNumber}:`, err.message);
    }
  }

  console.log(
    `🏗  Permitting job done. ${inserted} inserted (${JSON.stringify(insertedByCategory)}), ` +
      `${skippedNoCategoryMatch} no-category-match, ${skippedGate} failed quality gate, ${skippedDuplicate} duplicates.`
  );
}

function schedulePermittingJob(pool) {
  // Run at 04:00 UTC daily
  cron.schedule('0 4 * * *', () => runPermittingJob(pool), { timezone: 'UTC' });
  console.log('🏗  Permitting job scheduled (daily 04:00 UTC)');

  // Also run once at startup so fresh deploys don't wait until 4am
  runPermittingJob(pool);
}

module.exports = { schedulePermittingJob, runPermittingJob, buildTemplateCopy };
