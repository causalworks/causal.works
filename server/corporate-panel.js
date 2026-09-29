const fs = require('fs');
const nodePath = require('path');

const DATA_PATH = nodePath.join(__dirname, 'data', 'corporate-highlights.json');

let cache = null;
let mtime = null;

function loadData() {
  try {
    const st = fs.statSync(DATA_PATH);
    if (cache && mtime === st.mtimeMs) return cache;
    cache = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    mtime = st.mtimeMs;
    return cache;
  } catch (e) {
    console.warn('corporate-panel: data not loaded:', e.message);
    return { thesis: '', cards: [] };
  }
}

function bankMatchesCard(bankStr, card) {
  const b = String(bankStr || '').toLowerCase().trim();
  if (!b) return false;
  const subs = Array.isArray(card.match_banks_substr) ? card.match_banks_substr : [];
  return subs.some((s) => s && b.includes(String(s).toLowerCase()));
}

function buildCorporatePanel(userBank) {
  const data = loadData();
  const bank = String(userBank || '').trim();
  const cards = (data.cards || []).map((c) => ({
    ...c,
    highlighted: bankMatchesCard(bank, c),
  }));
  return {
    thesis: data.thesis || '',
    bank_saved: bank || null,
    cards,
  };
}

module.exports = { buildCorporatePanel, bankMatchesCard };
