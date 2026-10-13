'use strict';

function isFiscalYearLockedError(e) {
  return !!(e && e.code === 'CA001');
}

module.exports = { isFiscalYearLockedError };
