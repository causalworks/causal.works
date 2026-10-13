'use strict';

const VOIDED_STATUSES = ['voided', 'void'];

function isVoided(status) {
  return VOIDED_STATUSES.includes(status);
}

function displayCents(status, cents) {
  return isVoided(status) ? 0 : cents;
}

function displayAmountSql(statusExpr, amountExpr) {
  return `CASE WHEN ${statusExpr} IN ('voided', 'void') THEN 0 ELSE (${amountExpr}) END`;
}

module.exports = { VOIDED_STATUSES, isVoided, displayCents, displayAmountSql };
