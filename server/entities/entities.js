// entities.js — Target Entity matching for Causal Timing Layer.
// Entity records live in server/data/entities.js.

const { ENTITIES } = require('../data/entities');

// ── MATCHING FUNCTION ────────────────────────────────────────────────────────
// Returns { entity, window, date, label, daysUntil } or null

function findNextWindow(orgName, leveragePoint) {
  const searchText = `${orgName || ''} ${leveragePoint || ''}`.toLowerCase();

  let bestMatch = null;
  let bestScore = 0;

  for (const entity of ENTITIES) {
    let score = 0;
    for (const name of entity.names) {
      if (searchText.includes(name.toLowerCase())) {
        // Longer match = more specific = higher score
        score = Math.max(score, name.length);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entity;
    }
  }

  if (!bestMatch) return null;

  // Find the next upcoming window from today
  const now = new Date();
  const currentYear = now.getFullYear();

  let soonest = null;
  let soonestDays = Infinity;

  for (const w of bestMatch.known_windows) {
    // Try this year first, then next year
    for (const year of [currentYear, currentYear + 1]) {
      const candidate = new Date(year, w.month - 1, w.day);
      // Must be in the future (at least today)
      if (candidate >= now) {
        const daysUntil = Math.ceil((candidate - now) / (1000 * 60 * 60 * 24));
        if (daysUntil < soonestDays) {
          soonestDays = daysUntil;
          soonest = { entity: bestMatch, window: w, date: candidate, daysUntil };
        }
        break; // found a future date for this window, move to next window
      }
    }
  }

  if (!soonest) return null;

  return {
    entity: bestMatch,
    date: soonest.date,
    label: `${soonest.window.label} — ${soonest.daysUntil} day${soonest.daysUntil === 1 ? '' : 's'}`,
    daysUntil: soonest.daysUntil,
  };
}

module.exports = { ENTITIES, findNextWindow };
