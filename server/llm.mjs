// Catálogo configurable de modelos de IA para el chat y adaptadores por proveedor.
// Cobertura exacta: NO "cualquier modelo". Solo los proveedores con adaptador aquí escrito
// (anthropic, openai-compatible, gemini) y solo los modelos que el administrador liste en CHAT_MODELS.
// "sim:reglas" siempre está disponible: asistente de reglas locales, sin red y sin IA externa.
//
// Formas de petición verificadas contra documentación oficial (27/11/2026):
// - Anthropic:  POST https://api.anthropic.com/v1/messages  (x-api-key + anthropic-version; body model/max_tokens/system/messages)
//               https://platform.claude.com/docs/en/api/http/messages
// - OpenAI:     POST {base}/chat/completions  (Authorization Bearer; body model/messages)
//               https://github.com/openai/openai-openapi (spec oficial, operationId createChatCompletion)
//               base por defecto https://api.openai.com/v1; configurable para servidores compatibles (p. ej. locales).
// - Gemini:     POST {base}/v1beta/models/{model}:generateContent  (x-goog-api-key; body contents/systemInstruction/generationConfig)
//               https://ai.google.dev/api/generate-content
//               base por defecto https://generativelanguage.googleapis.com
//
// Ningún adaptador se prueba contra la API real en tests: solo transportes ficticios.
export const PROVIDERS = ['anthropic', 'openai', 'gemini'];
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,80}$/;
const KEY_ENV = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };
const BASE_ENV = { openai: 'OPENAI_BASE_URL', gemini: 'GEMINI_BASE_URL' };
const DEFAULT_BASE = { openai: 'https://api.openai.com/v1', gemini: 'https://generativelanguage.googleapis.com' };

export function parseCatalog(env = process.env) {
  const approved = env.CHAT_DATA_APPROVED === 'true';
  const models = [{ ref: 'sim:reglas', provider: 'simulated', model: 'reglas', label: 'Reglas locales · sin IA externa (SIMULACIÓN)', simulated: true, ready: true }];
  const seen = new Set(['sim:reglas']);
  for (const entry of String(env.CHAT_MODELS || '').split(',').map(x => x.trim()).filter(Boolean)) {
    const i = entry.indexOf(':');
    const provider = i < 0 ? '' : entry.slice(0, i).trim().toLowerCase();
    const model = i < 0 ? '' : entry.slice(i + 1).trim();
    if (!PROVIDERS.includes(provider) || !MODEL_RE.test(model)) continue; // entrada ignorada: la valida scripts/config.mjs
    const ref = provider + ':' + model;
    if (seen.has(ref)) continue;
    seen.add(ref);
    models.push({ ref, provider, model, label: provider + ' · ' + model, simulated: false, ready: approved && !!env[KEY_ENV[provider]] });
  }
  return models;
}

async function callJson(transport, url, { headers, body, timeoutMs = 45000 }) {
  let r;
  try {
    r = await transport(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch { throw Error('AI_REQUEST_FAILED'); }
  if (!r.ok) throw Error('AI_REQUEST_FAILED');
  try { return await r.json(); } catch { throw Error('AI_BAD_RESPONSE'); }
}

const anthropic = async (env, transport, { model, system, messages, maxTokens }) => {
  const j = await callJson(transport, 'https://api.anthropic.com/v1/messages', {
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: { model, max_tokens: maxTokens, system, messages: messages.map(m => ({ role: m.role, content: m.content })) },
  });
  const text = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
  if (!text) throw Error('AI_EMPTY_RESULT');
  return { text, model: j.model || model, usage: j.usage };
};

const openai = async (env, transport, { model, system, messages, maxTokens }) => {
  const base = String(env.OPENAI_BASE_URL || DEFAULT_BASE.openai).replace(/\/+$/, '');
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)) throw Error('AI_BASE_URL_NOT_HTTPS');
  // Sin tope de tokens en la petición: los servidores compatibles difieren (max_tokens vs max_completion_tokens).
  const j = await callJson(transport, base + '/chat/completions', {
    headers: { authorization: 'Bearer ' + env.OPENAI_API_KEY },
    body: { model, messages: [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))] },
  });
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw Error('AI_EMPTY_RESULT');
  return { text, model: j.model || model, usage: j.usage };
};

const gemini = async (env, transport, { model, system, messages, maxTokens }) => {
  const base = String(env.GEMINI_BASE_URL || DEFAULT_BASE.gemini).replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) throw Error('AI_BASE_URL_NOT_HTTPS');
  const j = await callJson(transport, base + '/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens },
    },
  });
  const text = (j.candidates?.[0]?.content?.parts || []).filter(p => typeof p.text === 'string').map(p => p.text).join('\n');
  if (!text) throw Error('AI_EMPTY_RESULT');
  return { text, model, usage: j.usageMetadata };
};

const ADAPTERS = { anthropic, openai, gemini };

export function llmService(env = process.env, transport = globalThis.fetch) {
  const catalog = parseCatalog(env);
  return {
    catalog,
    get(ref) { return catalog.find(m => m.ref === ref) || null; },
    // Una llamada de redacción. Nunca ejecuta acciones: las acciones las deciden y validan las reglas del servidor.
    async complete({ ref, system, messages, maxTokens = 800 }) {
      const m = this.get(ref);
      if (!m) throw Error('AI_UNKNOWN_MODEL');
      if (m.simulated) throw Error('AI_SIMULATED_NO_CALL');
      if (!m.ready) throw Error('AI_MODEL_NOT_READY');
      if (!Number.isInteger(maxTokens) || maxTokens < 100 || maxTokens > 2000) throw Error('INVALID_TOKEN_LIMIT');
      if (typeof system !== 'string' || !system.trim() || system.length > 4000) throw Error('INVALID_SYSTEM');
      if (!Array.isArray(messages) || !messages.length || messages.length > 12) throw Error('INVALID_MESSAGES');
      for (const x of messages) if (!['user', 'assistant'].includes(x.role) || typeof x.content !== 'string' || x.content.length > 20000) throw Error('INVALID_MESSAGES');
      return ADAPTERS[m.provider](env, transport, { model: m.model, system, messages, maxTokens });
    },
  };
}
