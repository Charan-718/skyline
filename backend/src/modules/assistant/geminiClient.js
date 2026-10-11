// Gemini REST client (POST /v1beta/models/{model}:generateContent). No SDK: plain fetch, so no new
// dependency. The API key (an AI Studio auth key) is sent in the x-goog-api-key header and never logged.
// generateContent is Google's "legacy but fully supported" API; it is used instead of the newer
// /v1beta/interactions API because it is stateless — Interactions stores conversations on Google's
// side by default (store=true), and member questions should not be kept there.
// Gemini 3.x models think before answering and thinking tokens count towards maxOutputTokens, so the
// limit is generous; the answer length itself is capped by the prompt and by the service.
// Returns the model's JSON reply parsed, or throws GeminiError { reason } where reason is one of
// RATE_LIMITED | TIMEOUT | BLOCKED | BAD_RESPONSE | MODEL_NOT_FOUND | AUTH | UPSTREAM.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// finishReason / blockReason values that mean the content was filtered.
const BLOCKED_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'OTHER']);

export class GeminiError extends Error {
  constructor(reason, status) {
    super(`gemini ${reason}`);
    this.name = 'GeminiError';
    this.reason = reason;
    this.status = status ?? null;
  }
}

function reasonFor(status) {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 400 || status === 401 || status === 403) return 'AUTH';
  return 'UPSTREAM';
}

/** Gemini's structured-output schema for every reply. */
export const REPLY_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: { inScope: { type: 'BOOLEAN' }, answer: { type: 'STRING' } },
  required: ['inScope', 'answer'],
});

export function createGeminiClient({ apiKey, model, timeoutMs = 15_000, fetchImpl = globalThis.fetch }) {
  const url = `${BASE_URL}/${encodeURIComponent(model)}:generateContent`;
  return Object.freeze({
    model,
    /** contents: [{ role: 'user' | 'model', text }] */
    async generate({ systemInstruction, contents }) {
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
              responseSchema: REPLY_SCHEMA,
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new GeminiError(err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'TIMEOUT' : 'UPSTREAM');
      }
      if (!res.ok) throw new GeminiError(reasonFor(res.status), res.status);
      const body = await res.json().catch(() => null);
      if (body?.promptFeedback?.blockReason) throw new GeminiError('BLOCKED', res.status);
      const candidate = body?.candidates?.[0];
      if (BLOCKED_REASONS.has(candidate?.finishReason)) throw new GeminiError('BLOCKED', res.status);
      const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      try {
        const reply = JSON.parse(text);
        if (typeof reply?.inScope !== 'boolean' || typeof reply?.answer !== 'string') throw new Error('shape');
        return { reply, usage: body?.usageMetadata ?? null };
      } catch {
        throw new GeminiError('BAD_RESPONSE', res.status);
      }
    },
  });
}
