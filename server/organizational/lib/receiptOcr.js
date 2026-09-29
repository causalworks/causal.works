'use strict';

/**
 * Receipt OCR prefill for Expense Claims (2026-09-14 addendum). Reuses the same Gemini
 * provider/key already configured for the Individual app's action classification
 * (server/ai/ai-service.js) rather than introducing a second AI vendor -- this is a new
 * integration for the Organizational module specifically (confirmed by reading the whole
 * module: zero prior AI/OCR calls anywhere under server/organizational/).
 *
 * Read-only, best-effort, never a source of truth: this only ever pre-fills form fields a
 * human reviews before anything is written to org_expense_claims/org_expense_claim_lines,
 * the same "automation only ever pre-fills, a human always confirms" discipline already
 * established for Bank Rules and the coding-memory suggestion. Never throws for a bad
 * read -- always resolves to { extracted, error }.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

let cachedModel = null;
function getModel() {
  if (cachedModel) return cachedModel;
  if (!process.env.GEMINI_API_KEY) return null;
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  cachedModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });
  return cachedModel;
}

const PROMPT = `You are reading a scanned receipt or invoice image for a nonprofit staff/board expense reimbursement claim. Extract what you can read with confidence. Return ONLY a JSON object with this exact shape:

{
  "vendor": string or null,
  "expense_date": "YYYY-MM-DD" or null,
  "amount_cents": integer (the total amount paid, in cents) or null,
  "suggested_description": string or null (a short plain-English description, e.g. "Taxi to airport for site visit"),
  "suggested_category": string or null (one general category word/phrase, e.g. "travel", "meals", "lodging", "office supplies", "mileage", "parking" -- your best guess, not tied to any specific chart of accounts)
}

Rules for suggested_description specifically: staff frequently jot the business purpose by hand
directly on a receipt (a margin note, something written across the top/bottom, an added line) --
look for that FIRST, separately from the printed vendor/line-item text, and use it as the
description if present (e.g. a handwritten "site visit to grantee" or "client lunch w/ board
chair" is exactly what this field is for, even though it's handwritten rather than printed). Only
fall back to inferring a description from the printed vendor name/items (e.g. "Taxi to airport")
when there is no handwritten note to read.

Other rules:
- Only fill a field if you can read it with real confidence. Use null for anything unclear, cut off, or not a genuine receipt/invoice.
- amount_cents must be the FINAL total actually paid (including tax/tip if shown), not a subtotal.
- If the image does not appear to be a receipt or invoice at all, return every field as null.
- Return ONLY the JSON object, no other text.`;

/**
 * @param {Buffer} fileBuffer
 * @param {string} mimeType e.g. 'image/jpeg', 'image/png', 'application/pdf'
 * @returns {Promise<{ extracted: object|null, error: string|null }>}
 */
async function extractReceiptFields(fileBuffer, mimeType) {
  const model = getModel();
  if (!model) {
    return { extracted: null, error: 'Receipt scanning is not configured on this server.' };
  }
  const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
  if (!SUPPORTED_MIME.has(mimeType)) {
    return { extracted: null, error: 'Unsupported file type for receipt scanning: ' + mimeType };
  }

  try {
    const result = await model.generateContent([
      { text: PROMPT },
      { inlineData: { data: fileBuffer.toString('base64'), mimeType } },
    ]);
    const textResponse = result.response.text();
    if (!textResponse) return { extracted: null, error: 'No response from receipt scanner.' };

    const parsed = JSON.parse(textResponse.trim());
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const extracted = {
      vendor: typeof parsed.vendor === 'string' && parsed.vendor.trim() ? parsed.vendor.trim() : null,
      expense_date: typeof parsed.expense_date === 'string' && DATE_RE.test(parsed.expense_date) ? parsed.expense_date : null,
      amount_cents: Number.isInteger(parsed.amount_cents) && parsed.amount_cents > 0 ? parsed.amount_cents : null,
      suggested_description: typeof parsed.suggested_description === 'string' && parsed.suggested_description.trim() ? parsed.suggested_description.trim() : null,
      suggested_category: typeof parsed.suggested_category === 'string' && parsed.suggested_category.trim() ? parsed.suggested_category.trim().toLowerCase() : null,
    };
    const hasAnything = Object.values(extracted).some((v) => v != null);
    if (!hasAnything) return { extracted: null, error: 'Could not read this as a receipt.' };
    return { extracted, error: null };
  } catch (e) {
    console.error('extractReceiptFields:', e.message);
    return { extracted: null, error: 'Could not scan this receipt right now.' };
  }
}

module.exports = { extractReceiptFields };
