'use strict';

// Maps database errors raised while writing a bill or an invoice to the response a person sees.

const { isFiscalYearLockedError } = require('./fiscalYearLockError');

function translateBillWriteError(e) {
  if (isFiscalYearLockedError(e)) {
    return { status: 409, body: { error: e.message, code: 'fiscal_year_locked', message: e.message } };
  }
  if (e.code === 'CA003') {
    return { status: 422, body: { error: e.message, code: 'non_posting_account', message: 'One of these lines references an account that is a rollup/header account, not a postable account.' } };
  }
  if (e.code === '23505' && /number_unique/.test(String(e.constraint || e.message))) {
    return { status: 409, body: { error: 'That number is already used by another bill. Pick a different number.', code: 'duplicate_number' } };
  }
  if (e.code === 'CA004') {
    return { status: 422, body: { error: e.message, code: 'cross_org_reference', message: 'This bill references an account, program, grant, or vendor that belongs to a different organization, or a constituent that is not marked as a vendor.' } };
  }
  if (e.code === 'CA008') {
    return { status: 422, body: { error: e.message, code: 'self_approval_not_allowed', message: 'This bill touches a federal-award grant and needs sign-off from a different user than whoever created it.' } };
  }
  if (e.code === '23514' || e.code === '23503') {
    return { status: 422, body: { error: e.message, code: 'validation_failed', message: e.message } };
  }
  return null;
}

function translateInvoiceWriteError(e) {
  if (isFiscalYearLockedError(e)) {
    return { status: 409, body: { error: e.message, code: 'fiscal_year_locked', message: e.message } };
  }
  if (e.code === 'CA003') {
    return { status: 422, body: { error: e.message, code: 'non_posting_account', message: 'One of these lines references an account that is a rollup/header account, not a postable account.' } };
  }
  if (e.code === '23505' && /number_unique/.test(String(e.constraint || e.message))) {
    return { status: 409, body: { error: 'That number is already used by another invoice. Pick a different number.', code: 'duplicate_number' } };
  }
  if (e.code === 'CA004') {
    return { status: 422, body: { error: e.message, code: 'cross_org_reference', message: 'This invoice references an account, program, or constituent that belongs to a different organization, or a constituent that is not marked as a customer.' } };
  }
  if (e.code === '23514' || e.code === '23503') {
    return { status: 422, body: { error: e.message, code: 'validation_failed', message: e.message } };
  }
  return null;
}

module.exports = { translateBillWriteError, translateInvoiceWriteError };
