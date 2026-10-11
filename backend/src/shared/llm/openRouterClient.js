import { GeminiError as LlmError } from '../gemini/client.js';

// OpenRouter chat-completions client with the same interface as the Gemini client:
//   generateJson({ systemInstruction, contents, responseSchema, temperature, maxOutputTokens }) -> { json, usage }
// so the event agent can fall back across providers. Errors use the shared provider error type
// (reason: RATE_LIMITED | TIMEOUT | BLOCKED | BAD_RESPONSE | TRUNCATED | MODEL_NOT_FOUND | AUTH | UPSTREAM).
// The key goes in the Authorization header and is never logged. Free models (":free") are limited to
// 20 requests/minute and 50/day (1000/day once 10 credits have ever been bought).

const URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Gemini's OpenAPI-subset schema (OBJECT/STRING, nullable) -> JSON Schema (object/string, null unions). */
export function toJsonSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  const type = typeof schema.type === 'string' ? schema.type.toLowerCase() : undefined;
  if (type) out.type = schema.nullable ? [type, 'null'] : type;
  if (schema.enum) out.enum = schema.nullable ? [...schema.enum, null] : [...schema.enum];
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toJsonSchema(v)]));
    out.additionalProperties = false;
  }
  if (schema.required) out.required = [...schema.required];
  if (schema.items) out.items = toJsonSchema(schema.items);
  return out;
}

function reasonFor(status) {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 402) return 'RATE_LIMITED'; // out of credits / free quota
  return 'UPSTREAM';
}

/** Some models wrap JSON in ``` fences or add a sentence around it; take the outermost object. */
export function extractJson(text) {
  const trimmed = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('no json');
  }
}

export function createOpenRouterClient({ apiKey, model, timeoutMs = 30_000, appUrl, appName = 'Campus Flow', fetchImpl = globalThis.fetch }) {
  return Object.freeze({
    model: `openrouter:${model}`,
    async generateJson({ systemInstruction, contents, responseSchema, temperature = 0.2, maxOutputTokens = 4096 }) {
      let res;
      try {
        res = await fetchImpl(URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(appUrl ? { 'HTTP-Referer': appUrl } : {}),
            'X-Title': appName,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: systemInstruction }, ...contents.map((c) => ({ role: c.role === 'model' ? 'assistant' : 'user', content: c.text }))],
            temperature,
            max_tokens: maxOutputTokens,
            response_format: { type: 'json_schema', json_schema: { name: 'reply', strict: false, schema: toJsonSchema(responseSchema) } },
            // Only route to providers that honour response_format, and keep the model's reasoning out of the answer.
            provider: { require_parameters: true },
            reasoning: { exclude: true },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new LlmError(err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'TIMEOUT' : 'UPSTREAM');
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new LlmError(reasonFor(res.status), res.status, { code: body?.error?.code ?? null });
      if (body?.error) throw new LlmError(reasonFor(Number(body.error.code) || 502), Number(body.error.code) || 502, { code: body.error.code ?? null });
      const choice = body?.choices?.[0];
      const finish = choice?.finish_reason ?? choice?.native_finish_reason ?? null;
      if (finish === 'content_filter') throw new LlmError('BLOCKED', res.status);
      const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
      try {
        const usage = body?.usage ? { totalTokenCount: body.usage.total_tokens ?? null } : null;
        return { json: extractJson(text), usage };
      } catch {
        throw new LlmError(finish === 'length' ? 'TRUNCATED' : 'BAD_RESPONSE', res.status, { finishReason: finish, textLength: text.length });
      }
    },
  });
}
