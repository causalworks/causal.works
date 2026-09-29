// Target Entity Database for Causal Timing Layer — static list (see server/entities/entities.js for matching).
// known_windows: predictable annual events (month is 1-indexed)

const ENTITIES = [

  // ── FOSSIL FUEL MAJORS ──────────────────────────────────────────────────
  {
    id: "rbc",
    names: ["RBC", "Royal Bank of Canada", "RBC Capital Markets"],
    type: "corporation",
    calendar_url: "https://www.rbc.com/investor-relations/agm.html",
    known_windows: [
      { label: "RBC Annual General Meeting", month: 4, day: 6 },
      { label: "RBC Q1 Earnings", month: 2, day: 22 },
      { label: "RBC Q2 Earnings", month: 5, day: 29 },
      { label: "RBC Q3 Earnings", month: 8, day: 28 },
      { label: "RBC Q4 Earnings", month: 11, day: 27 },
    ]
  },
  {
    id: "td-bank",
    names: ["TD Bank", "TD", "Toronto-Dominion Bank"],
    type: "corporation",
    known_windows: [
      { label: "TD Annual General Meeting", month: 4, day: 10 },
      { label: "TD Q1 Earnings", month: 2, day: 27 },
      { label: "TD Q4 Earnings", month: 12, day: 5 },
    ]
  },
  {
    id: "jpmorgan",
    names: ["JPMorgan", "JP Morgan", "JPMorgan Chase", "Chase"],
    type: "corporation",
    known_windows: [
      { label: "JPMorgan Annual General Meeting", month: 5, day: 20 },
      { label: "JPMorgan Q1 Earnings", month: 4, day: 11 },
      { label: "JPMorgan Q4 Earnings", month: 1, day: 13 },
    ]
  },
  {
    id: "blackrock",
    names: ["BlackRock", "Black Rock"],
    type: "corporation",
    known_windows: [
      { label: "BlackRock Annual General Meeting", month: 5, day: 22 },
      { label: "BlackRock Q1 Earnings", month: 4, day: 12 },
      { label: "BlackRock Q4 Earnings", month: 1, day: 15 },
    ]
  },
  {
    id: "exxon",
    names: ["ExxonMobil", "Exxon", "Exxon Mobil"],
    type: "corporation",
    known_windows: [
      { label: "ExxonMobil Annual General Meeting", month: 5, day: 28 },
      { label: "ExxonMobil Q1 Earnings", month: 4, day: 26 },
      { label: "ExxonMobil Q4 Earnings", month: 1, day: 31 },
    ]
  },
  {
    id: "shell",
    names: ["Shell", "Shell plc", "Royal Dutch Shell"],
    type: "corporation",
    known_windows: [
      { label: "Shell Annual General Meeting", month: 5, day: 20 },
      { label: "Shell Q1 Earnings", month: 5, day: 2 },
      { label: "Shell Q4 Earnings", month: 2, day: 1 },
    ]
  },
  {
    id: "bp",
    names: ["BP", "BP plc", "British Petroleum"],
    type: "corporation",
    known_windows: [
      { label: "BP Annual General Meeting", month: 4, day: 24 },
      { label: "BP Q4 Earnings", month: 2, day: 11 },
    ]
  },
  {
    id: "chevron",
    names: ["Chevron"],
    type: "corporation",
    known_windows: [
      { label: "Chevron Annual General Meeting", month: 5, day: 28 },
      { label: "Chevron Q1 Earnings", month: 4, day: 25 },
      { label: "Chevron Q4 Earnings", month: 1, day: 31 },
    ]
  },

  // ── US FEDERAL REGULATORS ───────────────────────────────────────────────
  {
    id: "epa",
    names: ["EPA", "Environmental Protection Agency", "US EPA"],
    type: "regulator",
    calendar_url: "https://www.epa.gov/publicnotices",
    known_windows: [
      // EPA comment periods are dynamic; Phase 2 will scrape calendar_url
      // Static windows cover predictable rulemaking cycles
      { label: "EPA Spring Unified Agenda publication", month: 5, day: 15 },
      { label: "EPA Fall Unified Agenda publication", month: 11, day: 15 },
    ]
  },
  {
    id: "ferc",
    names: ["FERC", "Federal Energy Regulatory Commission"],
    type: "regulator",
    calendar_url: "https://www.ferc.gov/news-events/calendar",
    known_windows: [
      { label: "FERC Open Meeting", month: 1, day: 23 },
      { label: "FERC Open Meeting", month: 3, day: 20 },
      { label: "FERC Open Meeting", month: 5, day: 15 },
      { label: "FERC Open Meeting", month: 7, day: 17 },
      { label: "FERC Open Meeting", month: 9, day: 18 },
      { label: "FERC Open Meeting", month: 11, day: 20 },
    ]
  },
  {
    id: "sec",
    names: ["SEC", "Securities and Exchange Commission"],
    type: "regulator",
    known_windows: [
      { label: "SEC proxy season peak", month: 4, day: 15 },
      { label: "SEC proxy season peak", month: 5, day: 15 },
    ]
  },

  // ── US CONGRESS ─────────────────────────────────────────────────────────
  {
    id: "us-senate-epw",
    names: ["Senate Environment Committee", "Senate EPW", "Environment and Public Works Committee"],
    type: "legislature",
    known_windows: [
      { label: "Senate EPW markup session (spring)", month: 3, day: 15 },
      { label: "Senate EPW markup session (fall)", month: 9, day: 20 },
    ]
  },
  {
    id: "us-house-energy",
    names: ["House Energy Committee", "House Energy and Commerce", "Energy and Commerce Committee"],
    type: "legislature",
    known_windows: [
      { label: "House Energy Committee markup (spring)", month: 4, day: 10 },
      { label: "House Energy Committee markup (fall)", month: 10, day: 10 },
    ]
  },

  // ── INTERNATIONAL ───────────────────────────────────────────────────────
  {
    id: "unfccc-cop",
    names: ["COP", "UNFCCC", "UN Climate Conference", "COP30"],
    type: "regulator",
    known_windows: [
      { label: "COP30 Belém — pre-negotiation window", month: 9, day: 1 },
      { label: "COP30 Belém opens", month: 11, day: 10 },
    ]
  },
  {
    id: "world-bank",
    names: ["World Bank", "World Bank Group", "IBRD"],
    type: "corporation",
    known_windows: [
      { label: "World Bank Spring Meetings", month: 4, day: 21 },
      { label: "World Bank Annual Meetings", month: 10, day: 13 },
    ]
  },
  {
    id: "imf",
    names: ["IMF", "International Monetary Fund"],
    type: "corporation",
    known_windows: [
      { label: "IMF Spring Meetings", month: 4, day: 21 },
      { label: "IMF Annual Meetings", month: 10, day: 13 },
    ]
  },

  // ── CANADIAN REGULATORS ─────────────────────────────────────────────────
  {
    id: "crtc",
    names: ["CRTC", "Canadian Radio-television and Telecommunications Commission"],
    type: "regulator",
    known_windows: [
      { label: "CRTC public hearing (spring)", month: 4, day: 1 },
      { label: "CRTC public hearing (fall)", month: 10, day: 1 },
    ]
  },
  {
    id: "canada-neb",
    names: ["CER", "Canada Energy Regulator", "National Energy Board", "NEB"],
    type: "regulator",
    known_windows: [
      { label: "CER public comment window (spring)", month: 3, day: 1 },
      { label: "CER public comment window (fall)", month: 9, day: 1 },
    ]
  },

  // ── FINANCIAL MARKETS & INDICES ────────────────────────────────────────────────────
  {
    id: "sp500-rebalance",
    names: ["S&P 500", "S&P 500 index", "S&P index rebalancing"],
    type: "financial_market",
    calendar_url: "https://www.spglobal.com/spdji/en/",
    known_windows: [
      { label: "S&P 500 index rebalancing (March)", month: 3, day: 17 },
      { label: "S&P 500 index rebalancing (June)", month: 6, day: 21 },
      { label: "S&P 500 index rebalancing (September)", month: 9, day: 20 },
      { label: "S&P 500 index rebalancing (December)", month: 12, day: 16 },
    ]
  },
  {
    id: "russell-reconstitution",
    names: ["Russell index", "Russell reconstitution", "Russell 1000", "Russell 2000", "Russell indices"],
    type: "financial_market",
    calendar_url: "https://www.ftserussell.com/",
    known_windows: [
      { label: "Russell index reconstitution (annual)", month: 6, day: 28 },
    ]
  },
  {
    id: "calpers-board",
    names: ["CalPERS", "California Public Employees Retirement System", "CalPERS board meeting"],
    type: "financial_market",
    calendar_url: "https://www.calpers.ca.gov/",
    known_windows: [
      { label: "CalPERS Investment Committee meeting", month: 2, day: 15 },
      { label: "CalPERS Investment Committee meeting", month: 5, day: 15 },
      { label: "CalPERS Investment Committee meeting", month: 8, day: 15 },
      { label: "CalPERS Investment Committee meeting", month: 11, day: 15 },
    ]
  },
  {
    id: "calstrs-board",
    names: ["CalSTRS", "California State Teachers Retirement System", "CalSTRS board meeting"],
    type: "financial_market",
    calendar_url: "https://www.calstrs.com/",
    known_windows: [
      { label: "CalSTRS Investment Committee meeting", month: 3, day: 20 },
      { label: "CalSTRS Investment Committee meeting", month: 6, day: 20 },
      { label: "CalSTRS Investment Committee meeting", month: 9, day: 20 },
      { label: "CalSTRS Investment Committee meeting", month: 12, day: 20 },
    ]
  },
  {
    id: "tiaa-board",
    names: ["TIAA", "Teachers Insurance and Annuity Association", "TIAA investment committee"],
    type: "financial_market",
    calendar_url: "https://www.tiaa.org/",
    known_windows: [
      { label: "TIAA governance meeting (spring)", month: 4, day: 15 },
      { label: "TIAA governance meeting (fall)", month: 10, day: 15 },
    ]
  },
  {
    id: "nyc-pension-board",
    names: ["NYC Pension Funds", "NYC pension board", "NYCERS", "New York City Employees Retirement System"],
    type: "financial_market",
    calendar_url: "https://www1.nyc.gov/site/nycppf/index.page",
    known_windows: [
      { label: "NYC Pension Board meeting", month: 2, day: 1 },
      { label: "NYC Pension Board meeting", month: 5, day: 1 },
      { label: "NYC Pension Board meeting", month: 8, day: 1 },
      { label: "NYC Pension Board meeting", month: 11, day: 1 },
    ]
  },

];

module.exports = { ENTITIES };
