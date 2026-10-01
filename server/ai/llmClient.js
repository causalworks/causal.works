'use strict';

/**
 * Shared LLM provider layer. Every AI call in the app goes through generate() with a task name,
 * so the provider/model can be switched per task from .env without touching call sites:
 *   LLM_PROVIDER_<TASK>=gemini   LLM_MODEL_<TASK>=gemini-2.5-flash
 * Defaults are Gemini 2.5 Flash for every task. Only the Gemini provider is implemented so far;
 * adding another means adding an entry to PROVIDERS with the same generate() shape.
 *
 * Tasks: email_extract, intervention_suggest, org_summary, receipt_ocr, bill_invoice_ocr,
 * grant_contract_ocr, bank_pressure.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const DEFAULT_PROVIDER = 'gemini';
const DEFAULT_MODELS = { gemini: 'gemini-2.5-flash' };

function taskConfig(task) {
  const key = String(task).toUpperCase();
  const provider = String(process.env[`LLM_PROVIDER_${key}`] || DEFAULT_PROVIDER).trim().toLowerCase();
  const model = String(process.env[`LLM_MODEL_${key}`] || DEFAULT_MODELS[provider] || '').trim();
  return { provider, model };
}

function geminiKey() {
  return String(process.env.GEMINI_API_KEY || '').trim();
}

const geminiModels = new Map();
function geminiModel(model, { json, temperature }) {
  const cacheKey = `${model}|${json ? 'json' : 'text'}|${temperature ?? ''}`;
  if (geminiModels.has(cacheKey)) return geminiModels.get(cacheKey);
  const generationConfig = {};
  if (json) generationConfig.responseMimeType = 'application/json';
  if (temperature != null) generationConfig.temperature = temperature;
  const genAI = new GoogleGenerativeAI(geminiKey());
  const m = genAI.getGenerativeModel(
    Object.keys(generationConfig).length ? { model, generationConfig } : { model }
  );
  geminiModels.set(cacheKey, m);
  return m;
}

const PROVIDERS = {
  gemini: {
    isConfigured: () => !!geminiKey(),

    async generate(model, input, opts) {
      const m = geminiModel(model, opts);
      const result = await m.generateContent(input);
      return result.response.text();
    },

    // Google Search grounding over raw REST. The key goes in a header, never the URL.
    async generateGrounded(model, prompt, { json, timeoutMs }) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(timeoutMs || 8000),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
          body: JSON.stringify({
            tools: [{ google_search: {} }],
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
          }),
        }
      );
      if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
      const data = await r.json().catch(() => null);
      return data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n').trim() || '';
    },
  },
};

function providerFor(task) {
  const { provider, model } = taskConfig(task);
  const impl = PROVIDERS[provider];
  if (!impl) throw new Error(`Unknown LLM provider "${provider}" for task ${task}`);
  return { impl, model };
}

/** True when the task's provider has credentials. Use before calling generate() for optional features. */
function isConfigured(task) {
  const { impl } = providerFor(task);
  return impl.isConfigured();
}

/**
 * @param {string} task
 * @param {string|Array} input  prompt text, or parts: [{ text }, { file: { buffer, mimeType } }]
 * @param {{ json?: boolean, temperature?: number, timeoutMs?: number }} [opts]
 * @returns {Promise<string>} raw response text (callers parse JSON themselves)
 */
async function generate(task, input, opts = {}) {
  const { impl, model } = providerFor(task);
  const parts = typeof input === 'string'
    ? input
    : input.map((p) => (p.file
      ? { inlineData: { data: p.file.buffer.toString('base64'), mimeType: p.file.mimeType } }
      : { text: p.text }));
  const call = impl.generate(model, parts, opts);
  if (!opts.timeoutMs) return call;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('LLM API timeout')), opts.timeoutMs);
  });
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Prompt with live web search grounding; returns raw response text. */
async function generateGrounded(task, prompt, opts = {}) {
  const { impl, model } = providerFor(task);
  if (!impl.generateGrounded) throw new Error(`Provider for ${task} does not support search grounding`);
  return impl.generateGrounded(model, prompt, opts);
}

module.exports = { generate, generateGrounded, isConfigured };
