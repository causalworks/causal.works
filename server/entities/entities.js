// entities.js — Target Entity matching for Causal Timing Layer.
// Entity records live in server/data/entities.js.

const { ENTITIES } = require('../data/entities');

// ── MATCHING FUNCTION ────────────────────────────────────────────────────────

function findNextWindow(orgName, leveragePoint) {
  const searchText = `${orgName || ''} ${leveragePoint || ''}`.toLowerCase();

  let bestMatch = null;
  let bestScore = 0;

  for (const entity of ENTITIES) {
    let score = 0;
    for (const name of entity.names) {
      if (searchText.includes(name.toLowerCase())) {
        score = Math.max(score, name.length);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entity;
    }
  }

  if (!bestMatch) return null;

  const now = new Date();
  const currentYear = now.getFullYear();

  let soonest = null;
  let soonestDays = Infinity;

  for (const w of bestMatch.known_windows) {
    for (const year of [currentYear, currentYear + 1]) {
      const candidate = new Date(year, w.month - 1, w.day);
      if (candidate >= now) {
        const daysUntil = Math.ceil((candidate - now) / (1000 * 60 * 60 * 24));
        if (daysUntil < soonestDays) {
          soonestDays = daysUntil;
          soonest = { entity: bestMatch, window: w, date: candidate, daysUntil };
        }
        break;
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
