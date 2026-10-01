'use strict';

/**
 * Bill/invoice OCR prefill (2026-09-17 addendum). Same shape and discipline as
 * receiptOcr.js (Expense Claims, 2026-09-14) and grantContractOcr.js (Grants, 2026-09-17):
 * reuses the already-configured Gemini provider, is read-only and best-effort, and never
 * writes anything -- it only ever prefills the New Bill/Invoice form for a human to review.
 *
 * Deliberately header-only for v1 (vendor/customer name, dates, reference, total amount, one
 * suggested description) -- it does NOT propose per-line account_id/program_id splits, since
 * no scanned document can know this org's chart of accounts or program structure. That gap is
 * covered separately by a vendor/customer coding-history suggestion (see bills.js/invoices.js
 * :vendor-coding-suggestion / :customer-coding-suggestion), not by OCR guessing a GL account.
 */

const { generate, isConfigured } = require('../../ai/llmClient');

function getModel() {
  return isConfigured('bill_invoice_ocr');
}

function buildPrompt(kind) {
  const docLabel = kind === 'invoice' ? 'a customer invoice this org issued (or a copy of one)' : 'a vendor bill this org received';
  const counterpartyLabel = kind === 'invoice' ? 'the customer being billed' : 'the vendor who issued this bill';
  return `You are reading a scanned document: ${docLabel}. Extract what you can read with confidence. Return ONLY a JSON object with this exact shape:

{
  "counterparty_name": string or null (the name of ${counterpartyLabel}),
  "document_date": "YYYY-MM-DD" or null,
  "due_date": "YYYY-MM-DD" or null,
  "reference": string or null (the document's own invoice/bill number),
  "total_amount_cents": integer (the total amount due, in cents) or null,
  "suggested_description": string or null (a short plain-English description of what this is for, e.g. "Office supplies delivery" or "Monthly consulting retainer")
}

Rules:
- Only fill a field if you can read it with real confidence. Use null for anything unclear, cut off, or not genuinely stated.
- total_amount_cents must be the FINAL total due (including tax if shown), not a subtotal or a partial/deposit amount.
- Do not attempt to identify individual line items, general ledger accounts, or programs -- this document alone cannot tell you this organization's internal chart of accounts.
- If the image does not appear to be ${docLabel.replace('a copy of ', '')}, return every field as null.
- Return ONLY the JSON object, no other text.`;
}

/**
 * @param {Buffer} fileBuffer
 * @param {string} mimeType e.g. 'image/jpeg', 'image/png', 'application/pdf'
 * @param {'bill'|'invoice'} kind
 * @returns {Promise<{ extracted: object|null, error: string|null }>}
 */
async function extractBillOrInvoiceFields(fileBuffer, mimeType, kind) {
  const model = getModel();
  if (!model) {
    return { extracted: null, error: 'Document scanning is not configured on this server.' };
  }
  const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
  if (!SUPPORTED_MIME.has(mimeType)) {
    return { extracted: null, error: 'Unsupported file type for document scanning: ' + mimeType };
  }

  try {
    const textResponse = await generate('bill_invoice_ocr', [
      { text: buildPrompt(kind) },
      { file: { buffer: fileBuffer, mimeType } },
    ], { json: true });
    if (!textResponse) return { extracted: null, error: 'No response from document scanner.' };

    const parsed = JSON.parse(textResponse.trim());
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const extracted = {
      counterparty_name: typeof parsed.counterparty_name === 'string' && parsed.counterparty_name.trim() ? parsed.counterparty_name.trim() : null,
      document_date: typeof parsed.document_date === 'string' && DATE_RE.test(parsed.document_date) ? parsed.document_date : null,
      due_date: typeof parsed.due_date === 'string' && DATE_RE.test(parsed.due_date) ? parsed.due_date : null,
      reference: typeof parsed.reference === 'string' && parsed.reference.trim() ? parsed.reference.trim() : null,
      total_amount_cents: Number.isInteger(parsed.total_amount_cents) && parsed.total_amount_cents > 0 ? parsed.total_amount_cents : null,
      suggested_description: typeof parsed.suggested_description === 'string' && parsed.suggested_description.trim() ? parsed.suggested_description.trim() : null,
    };
    const hasAnything = Object.values(extracted).some((v) => v != null);
    if (!hasAnything) return { extracted: null, error: 'Could not read this as a ' + kind + '.' };
    return { extracted, error: null };
  } catch (e) {
    console.error('extractBillOrInvoiceFields:', e.message);
    return { extracted: null, error: 'Could not scan this document right now.' };
  }
}

module.exports = { extractBillOrInvoiceFields };
