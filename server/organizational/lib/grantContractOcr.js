'use strict';

/**
 * Grant contract/agreement OCR prefill (2026-09-17 addendum). Same shape and same discipline
 * as receiptOcr.js (Expense Claims, 2026-09-14): reuses the already-configured Gemini
 * provider/key rather than introducing a second AI vendor, is read-only and best-effort, and
 * never writes anything itself -- it only ever pre-fills the New Grant form for a human to
 * review and correct before anything is POSTed to org_grants.
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

const PROMPT = `You are reading a scanned grant agreement, award letter, or contract for a nonprofit's Grants/Funders tracker. Extract what you can read with confidence. Return ONLY a JSON object with this exact shape:

{
  "funder": string or null (the funding organization's name),
  "institution_type": string or null (one of: "Foundation", "Government", "Corporation", "Individual" -- your best guess of what kind of entity the funder is, or null if unclear),
  "grant_name": string or null (the grant/program title, e.g. "General Operating Support" or "Capacity Building Grant"),
  "funder_grant_id": string or null (the funder's own grant/contract/award number, if stated),
  "amount_cents": integer (the total award amount, in cents) or null,
  "grant_type": string or null (a short label for the type of support, e.g. "General operating", "Program/restricted", "Capacity building"),
  "start_date": "YYYY-MM-DD" or null (grant period start),
  "end_date": "YYYY-MM-DD" or null (grant period end),
  "next_report_due": "YYYY-MM-DD" or null (the next reporting deadline, if one is stated),
  "restrictions": string or null (a short plain-English summary of any use restrictions or conditions stated in the document),
  "is_federal_award": boolean or null (true only if this is clearly a U.S. federal award or passed through from one),
  "federal_awarding_agency": string or null (only if is_federal_award is true),
  "aln": string or null (Assistance Listing Number / CFDA number, only if stated),
  "pass_through_entity_name": string or null (only if this award was received via a pass-through entity rather than directly from the federal agency)
}

Rules:
- Only fill a field if you can read it with real confidence. Use null for anything unclear, cut off, or not actually stated in the document.
- amount_cents must be the total award/grant amount, not a partial payment or installment amount.
- If the document does not appear to be a grant agreement, award letter, or funder contract at all, return every field as null.
- Return ONLY the JSON object, no other text.`;

/**
 * @param {Buffer} fileBuffer
 * @param {string} mimeType e.g. 'image/jpeg', 'image/png', 'application/pdf'
 * @returns {Promise<{ extracted: object|null, error: string|null }>}
 */
async function extractGrantContractFields(fileBuffer, mimeType) {
  const model = getModel();
  if (!model) {
    return { extracted: null, error: 'Contract scanning is not configured on this server.' };
  }
  const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
  if (!SUPPORTED_MIME.has(mimeType)) {
    return { extracted: null, error: 'Unsupported file type for contract scanning: ' + mimeType };
  }

  try {
    const result = await model.generateContent([
      { text: PROMPT },
      { inlineData: { data: fileBuffer.toString('base64'), mimeType } },
    ]);
    const textResponse = result.response.text();
    if (!textResponse) return { extracted: null, error: 'No response from contract scanner.' };

    const parsed = JSON.parse(textResponse.trim());
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const VALID_INSTITUTION_TYPES = new Set(['Foundation', 'Government', 'Corporation', 'Individual']);
    const extracted = {
      funder:                   typeof parsed.funder === 'string' && parsed.funder.trim() ? parsed.funder.trim() : null,
      institution_type:         VALID_INSTITUTION_TYPES.has(parsed.institution_type) ? parsed.institution_type : null,
      grant_name:               typeof parsed.grant_name === 'string' && parsed.grant_name.trim() ? parsed.grant_name.trim() : null,
      funder_grant_id:          typeof parsed.funder_grant_id === 'string' && parsed.funder_grant_id.trim() ? parsed.funder_grant_id.trim() : null,
      amount_cents:             Number.isInteger(parsed.amount_cents) && parsed.amount_cents > 0 ? parsed.amount_cents : null,
      grant_type:               typeof parsed.grant_type === 'string' && parsed.grant_type.trim() ? parsed.grant_type.trim() : null,
      start_date:               typeof parsed.start_date === 'string' && DATE_RE.test(parsed.start_date) ? parsed.start_date : null,
      end_date:                 typeof parsed.end_date === 'string' && DATE_RE.test(parsed.end_date) ? parsed.end_date : null,
      next_report_due:          typeof parsed.next_report_due === 'string' && DATE_RE.test(parsed.next_report_due) ? parsed.next_report_due : null,
      restrictions:             typeof parsed.restrictions === 'string' && parsed.restrictions.trim() ? parsed.restrictions.trim() : null,
      is_federal_award:         typeof parsed.is_federal_award === 'boolean' ? parsed.is_federal_award : null,
      federal_awarding_agency:  typeof parsed.federal_awarding_agency === 'string' && parsed.federal_awarding_agency.trim() ? parsed.federal_awarding_agency.trim() : null,
      aln:                      typeof parsed.aln === 'string' && parsed.aln.trim() ? parsed.aln.trim() : null,
      pass_through_entity_name: typeof parsed.pass_through_entity_name === 'string' && parsed.pass_through_entity_name.trim() ? parsed.pass_through_entity_name.trim() : null,
    };
    const hasAnything = Object.values(extracted).some((v) => v != null);
    if (!hasAnything) return { extracted: null, error: 'Could not read this as a grant agreement or contract.' };
    return { extracted, error: null };
  } catch (e) {
    console.error('extractGrantContractFields:', e.message);
    return { extracted: null, error: 'Could not scan this document right now.' };
  }
}

module.exports = { extractGrantContractFields };
