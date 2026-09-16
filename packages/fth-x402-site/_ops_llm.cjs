'use strict';
// Paid LLM inference task for the Genesis402 rail (2026-09-16).
//
// Provider chain, cheapest true cost first:
//   1. Ollama on this workstation (RTX 5090)      — zero marginal cost; used when the requested model is local or
//                                                    no model is named.
//   2. OpenRouter (OPENROUTER_API_KEY)             — hosted models; the rail only exposes an allowlist whose
//                                                    per-call cost stays far under the price charged.
// Every response names the provider and model actually used and the token counts, so the buyer can verify what
// they paid for. No provider fallback ever silently swaps a paid model for a weaker one without saying so.
const http = require('http');
const https = require('https');

const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_INPUT_CHARS = Number(process.env.LLM_MAX_INPUT_CHARS || 24000);   // ~6k tokens
const MAX_OUTPUT_TOKENS = Number(process.env.LLM_MAX_OUTPUT_TOKENS || 1024);
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60000);

// Hosted allowlist: id -> approximate cost per 1M prompt tokens (USD) at listing time; refuse anything dearer than
// the ceiling so a $0.02 call never costs more than a fraction of a cent upstream.
const HOSTED = Object.freeze({
  'openai/gpt-oss-20b': 0.03,
  'qwen/qwen3.7-flash': 0.03,
  'meta-llama/llama-3.2-1b-instruct': 0.027,
  'mistralai/mistral-nemo': 0.019,
  'ibm-granite/granite-4.0-h-micro': 0.017
});
const HOSTED_COST_CEILING = 0.05;
const DEFAULT_LOCAL = process.env.LLM_DEFAULT_LOCAL || 'qwen2.5:7b';
const DEFAULT_HOSTED = 'openai/gpt-oss-20b';

let localModelsCache = { at: 0, list: [] };
function fetchJson(url, opts, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = mod.request({ hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: opts.method || 'GET', timeout: opts.timeoutMs || TIMEOUT_MS,
      headers: Object.assign({ 'content-type': 'application/json', accept: 'application/json' }, opts.headers || {}, payload ? { 'content-length': Buffer.byteLength(payload) } : {}) }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) { /* raw */ } resolve({ status: res.statusCode, json: j, raw: d.slice(0, 400) }); });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('upstream timeout')); });
    if (payload) req.write(payload); req.end();
  });
}

async function localModels() {
  if (Date.now() - localModelsCache.at < 60000) return localModelsCache.list;
  try {
    const r = await fetchJson(OLLAMA + '/api/tags', { timeoutMs: 3000 });
    localModelsCache = { at: Date.now(), list: ((r.json && r.json.models) || []).map((m) => m.name) };
  } catch (e) { localModelsCache = { at: Date.now(), list: [] }; }
  return localModelsCache.list;
}

function normaliseMessages(params) {
  if (Array.isArray(params.messages) && params.messages.length) {
    return params.messages.filter((m) => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role)).map((m) => ({ role: m.role, content: m.content }));
  }
  if (typeof params.prompt === 'string' && params.prompt.trim()) {
    return [{ role: 'user', content: params.prompt }];
  }
  return null;
}

/** Health for /health and the well-known doc: which backends are actually reachable right now. */
async function status() {
  const local = await localModels();
  return { local: { reachable: local.length > 0, models: local.slice(0, 12), default: DEFAULT_LOCAL }, hosted: { configured: !!process.env.OPENROUTER_API_KEY, models: Object.keys(HOSTED), default: DEFAULT_HOSTED } };
}

/**
 * Run one chat completion. params: { model?, messages? | prompt?, max_tokens?, temperature? }
 * Returns { provider, model, output, usage, finish_reason } or throws with userMessage.
 */
async function run(params, ctx) {
  params = params || {};
  const messages = normaliseMessages(params);
  if (!messages) { const e = new Error('messages_or_prompt_required'); e.userMessage = 'send `messages` (OpenAI shape) or `prompt`'; throw e; }
  const inputChars = messages.reduce((n, m) => n + m.content.length, 0);
  if (inputChars > MAX_INPUT_CHARS) { const e = new Error('input_too_long'); e.userMessage = 'input exceeds ' + MAX_INPUT_CHARS + ' characters for one paid call'; throw e; }
  const maxTokens = Math.min(Math.max(1, Number(params.max_tokens) || 512), MAX_OUTPUT_TOKENS);
  const temperature = Number.isFinite(Number(params.temperature)) ? Math.min(2, Math.max(0, Number(params.temperature))) : 0.2;
  const requested = String(params.model || '').trim();

  const local = await localModels();
  const wantsLocal = !requested || local.includes(requested);
  if (wantsLocal && local.length) {
    const model = requested && local.includes(requested) ? requested : (local.includes(DEFAULT_LOCAL) ? DEFAULT_LOCAL : local[0]);
    const r = await fetchJson(OLLAMA + '/api/chat', { method: 'POST' }, { model, messages, stream: false, options: { num_predict: maxTokens, temperature } });
    if (r.status !== 200 || !r.json || !r.json.message) { const e = new Error('local_inference_failed'); e.userMessage = 'local model did not answer: ' + (r.raw || r.status); throw e; }
    return { provider: 'ollama-local', model, output: r.json.message.content || '', usage: { prompt_tokens: r.json.prompt_eval_count || null, completion_tokens: r.json.eval_count || null }, finish_reason: r.json.done_reason || (r.json.done ? 'stop' : null), duration_ms: r.json.total_duration ? Math.round(r.json.total_duration / 1e6) : null };
  }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) { const e = new Error('no_backend'); e.userMessage = requested ? 'model "' + requested + '" is not served here; local models: ' + local.join(', ') : 'no inference backend is available right now'; e.supported = local; throw e; }
  const model = requested && HOSTED[requested] !== undefined ? requested : (requested ? null : DEFAULT_HOSTED);
  if (!model) { const e = new Error('model_not_offered'); e.userMessage = 'model "' + requested + '" is not on the served list'; e.supported = [...local, ...Object.keys(HOSTED)]; throw e; }
  if (HOSTED[model] > HOSTED_COST_CEILING) { const e = new Error('model_above_cost_ceiling'); e.userMessage = 'model temporarily withdrawn'; throw e; }
  const r = await fetchJson(OPENROUTER, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'HTTP-Referer': 'https://twin.unykorn.org', 'X-Title': 'Genesis402 rail' } }, { model, messages, max_tokens: maxTokens, temperature });
  const choice = r.json && r.json.choices && r.json.choices[0];
  if (r.status !== 200 || !choice) { const e = new Error('hosted_inference_failed'); e.userMessage = 'hosted model did not answer: ' + ((r.json && r.json.error && r.json.error.message) || r.status); throw e; }
  return { provider: 'openrouter', model: r.json.model || model, output: (choice.message && choice.message.content) || '', usage: r.json.usage || null, finish_reason: choice.finish_reason || null };
}

module.exports = { run, status, HOSTED, DEFAULT_LOCAL, DEFAULT_HOSTED, MAX_INPUT_CHARS, MAX_OUTPUT_TOKENS };
