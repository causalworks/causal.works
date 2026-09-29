'use strict';

/**
 * Cooperative workspace “standard category” dropdown (maps to org_accounts.standard_category).
 *
 * To use your own nonprofit chart (e.g. UCOA / funder reporting buckets):
 *  - Replace the `STANDARD_COA_CATEGORIES` array below with your codes + labels.
 *  - Keep `code` as the stored value (string, max length matches onboarding CAT_MAX).
 *  - Optionally adjust `suggestCategory()` / server `suggestStandardCategory` heuristics
 *    so auto-mapping from account names lines up with your codes.
 *
 * The API `GET /api/organizational/orgs/:slug/standard-categories` serves this list to onboarding.
 */
const STANDARD_COA_CATEGORIES = [
  { code: 'ASSET_CURRENT', label: 'Current Assets' },
  { code: 'ASSET_FIXED', label: 'Fixed Assets' },
  { code: 'LIAB_CURRENT', label: 'Current Liabilities' },
  { code: 'NET_ASSETS', label: 'Net Assets' },
  { code: 'REV_EARNED', label: 'Earned Revenue' },
  { code: 'REV_CONTRIB', label: 'Contributed Revenue' },
  { code: 'EXP_PERSONNEL', label: 'Personnel Expenses' },
  { code: 'EXP_PROGRAM', label: 'Program Expenses' },
  { code: 'EXP_OPERATING', label: 'Operating Expenses' },
];

module.exports = { STANDARD_COA_CATEGORIES };
