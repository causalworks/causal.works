'use strict';
// What a donor received in return for a gift, and the receipt wording that follows from it.

const NONE = 'No goods or services were provided in exchange for this contribution.';
const DEDUCTIBLE = 'Your contribution is tax-deductible to the extent allowed by law.';

function fmt(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents) / 100);
}

function parseBenefit(body, amountCents, existingDescription) {
  const hasValue = body.benefit_value_cents !== undefined || body.benefit_value !== undefined;
  const hasText = body.benefit_description !== undefined;
  if (!hasValue && !hasText) return { touched: false };
  let value = null;
  if (body.benefit_value_cents != null && body.benefit_value_cents !== '') value = Number(body.benefit_value_cents);
  else if (body.benefit_value != null && body.benefit_value !== '') value = Math.round(Number(body.benefit_value) * 100);
  if (value != null && (!Number.isInteger(value) || value < 0)) return { error: 'The value of what the donor received must be zero or more.' };
  if (value != null && amountCents != null && value > Number(amountCents)) return { error: 'The value of what the donor received cannot be more than the amount paid.' };
  const description = hasText ? (String(body.benefit_description || '').trim().slice(0, 500) || null) : undefined;
  if (value != null && value > 0 && !(description !== undefined ? description : existingDescription)) return { error: 'Describe what the donor received.' };
  return { touched: true, value, description };
}

function receiptStatement(gift) {
  const value = gift.benefit_value_cents != null ? Number(gift.benefit_value_cents) : 0;
  if (!(value > 0)) return { benefit: false, lines: [NONE, DEDUCTIBLE] };
  const paid = Number(gift.amount_cents);
  const what = gift.benefit_description ? gift.benefit_description : 'goods or services';
  return {
    benefit: true,
    lines: [
      `In exchange for this payment of ${fmt(paid)}, you received ${what}, with an estimated value of ${fmt(value)}.`,
      `The amount of your payment that is tax-deductible is limited to the excess over the value of what you received: ${fmt(Math.max(0, paid - value))}.`,
    ],
  };
}

module.exports = { parseBenefit, receiptStatement, NONE, DEDUCTIBLE };
