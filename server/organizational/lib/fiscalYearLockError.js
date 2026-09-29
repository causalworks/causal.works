'use strict';

/**
 * Matches the custom SQLSTATE the fiscal-year-lock triggers raise (migration 164) --
 * exact code match, not string-matching the error message.
 * @param {Error & { code?: string }} e
 * @returns {boolean}
 */
function isFiscalYearLockedError(e) {
  return !!(e && e.code === 'CA001');
}

module.exports = { isFiscalYearLockedError };
