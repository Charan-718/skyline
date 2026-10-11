// Gemini REST client shared by the AI features (POST /v1beta/models/{model}:generateContent).
// No SDK: plain fetch, so no new dependency. The API key (an AI Studio auth key) is sent in the
// x-goog-api-key header and never logged.
// generateContent is Google's "legacy but fully supported" API; it is used instead of the newer
// /v1beta/interactions API because it is stateless — Interactions stores conversations on Google's
// side by default (store=true), and member input should not be kept there.
// Gemini 3.x models think before answering and thinking tokens count towards maxOutputTokens, so the
// default limit is generous; callers cap the visible answer themselves.
//
// generateJson() returns the model's reply parsed as JSON (shape checked by the caller), or throws
// GeminiError { reason }: RATE_LIMITED | TIMEOUT | BLOCKED | BAD_RESPONSE | MODEL_NOT_FOUND | AUTH | UPSTREAM.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// finishReason / blockReason values that mean the content was filtered.
const BLOCKED_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'OTHER']);

export class GeminiError extends Error {
  /** detail: non-sensitive diagnostics only (finish reason, lengths) — never prompt or reply text. */
  constructor(reason, status, detail = null) {
    super(`gemini ${reason}`);
    this.name = 'GeminiError';
    this.reason = reason;
    this.status = status ?? null;
    this.detail = detail;
  }
}

function reasonFor(status) {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 400 || status === 401 || status === 403) return 'AUTH';
  return 'UPSTREAM';
}

export function createGeminiClient({ apiKey, model, timeoutMs = 15_000, fetchImpl = globalThis.fetch }) {
  const url = `${BASE_URL}/${encodeURIComponent(model)}:generateContent`;
  return Object.freeze({
    model,
    /** contents: [{ role: 'user' | 'model', text }]; responseSchema: Gemini (OpenAPI-subset) schema. */
    async generateJson({ systemInstruction, contents, responseSchema, temperature = 0.2, maxOutputTokens = 4096 }) {
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
            generationConfig: { temperature, maxOutputTokens, responseMimeType: 'application/json', responseSchema },
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
      // Thought parts (if any) are not the answer; only plain text parts are.
      const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
      try {
        return { json: JSON.parse(text), usage: body?.usageMetadata ?? null };
      } catch {
        const detail = { finishReason: candidate?.finishReason ?? null, textLength: text.length };
        throw new GeminiError(candidate?.finishReason === 'MAX_TOKENS' ? 'TRUNCATED' : 'BAD_RESPONSE', res.status, detail);
      }
    },
  });
}
