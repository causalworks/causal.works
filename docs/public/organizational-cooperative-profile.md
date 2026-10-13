# Organizational `cooperative_profile` (JSONB)

`coop_orgs.cooperative_profile` stores **co-op–oriented metadata** separate from accounting fields. Until the UI writes structured data, the column may be `NULL` or a partial object.

## Intended shape (contract)

All keys are **optional**. Prefer this vocabulary so the field does not become an unstructured dump:

| Key | Type | Description |
|-----|------|-------------|
| `mission` | `string` | Short mission statement for dashboards and (formerly) AI context — see note below. |
| `program_areas` | `string[]` | Focus areas (e.g. `["food security", "housing"]`). |
| `region` | `string` | Geographic scope label (city, state, country, or free text). |
| `website` | `string` | Public website URL (https recommended). |
| `runway_months` (alias `cash_runway_months`) | `number` | Staff-reported months of runway. Read by the finance snapshot / executive summary as an override — see below. |
| `cash_balance_cents` (alias `cash_on_hand_cents`) | `number` (integer cents, ≥0) | Staff-reported cash on hand. Used with recent actuals burn rate to *estimate* runway when `runway_months` isn't set directly. |

> `mission` etc. once fed a Gemini-based org summary. That generator (`server/organizational/gemini/OrganizationalSummaryGenerator.js`) has been **removed** — the executive summary is now a deterministic template (`OrganizationalSummaryService.js`). The key still exists and is still shown on the org's public profile page; it just no longer reaches an LLM.

## Where each key is actually read/written

| Key group | Read by | Written by |
|-----------|---------|-----------|
| `mission`, `program_areas`, `region`, `website` | Org public profile page (`org.js`) | `PATCH /api/organizational/orgs/:slug` (Settings » Organization) — this handler explicitly allow-lists only these four keys when merging |
| `runway_months`/`cash_runway_months`, `cash_balance_cents`/`cash_on_hand_cents` | `OrganizationalFinanceSnapshot.js` (executive summary, board report), dashboard exec panel (`dashboard-exec.js`), org public profile (`org.js`) | **No UI writes these yet.** `POST /api/organizational/orgs` (org creation) will store whatever object is passed in `cooperative_profile` without an allow-list, so these keys can be seeded at creation time or set via a direct DB update — the settings PATCH path does not merge them. |

This split matters: if a value set via direct SQL for `runway_months` looks like it "won't save" from the Settings UI, that's expected — the Settings PATCH handler doesn't touch these two keys by design (not yet, anyway).

## Rules

- **Freeform is allowed for now**, but new UI and APIs should read/write only the keys above unless a spec extends the contract.
- **Do not** store secrets, tokens, or PII beyond what staff already see in the product.
- **Validation:** the Settings PATCH handler (`orgs.js`) enforces the four-key allow-list for updates; org creation currently accepts the object as-is. Treat this as accept-any-object-for-now, not a guarantee unknown keys survive future validation tightening.

## Example

```json
{
  "mission": "Neighbor-led mutual aid for food and warmth.",
  "program_areas": ["food pantry", "winter shelter"],
  "region": "VT, USA",
  "website": "https://example.org",
  "runway_months": 8.5,
  "cash_balance_cents": 4200000
}
```
