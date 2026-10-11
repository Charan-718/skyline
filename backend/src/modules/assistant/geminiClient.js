import { createGeminiClient as createSharedClient, GeminiError } from '../../shared/gemini/client.js';

// The event assistant's view of Gemini: one call that must come back as { inScope, answer }.
// Transport, errors and safety handling live in the shared client (shared/gemini/client.js).

export { GeminiError };

/** Gemini's structured-output schema for every reply. */
export const REPLY_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: { inScope: { type: 'BOOLEAN' }, answer: { type: 'STRING' } },
  required: ['inScope', 'answer'],
});

export function createGeminiClient(options) {
  const client = createSharedClient(options);
  return Object.freeze({
    model: client.model,
    /** contents: [{ role: 'user' | 'model', text }] */
    async generate({ systemInstruction, contents }) {
      const { json: reply, usage } = await client.generateJson({ systemInstruction, contents, responseSchema: REPLY_SCHEMA });
      if (typeof reply?.inScope !== 'boolean' || typeof reply?.answer !== 'string') throw new GeminiError('BAD_RESPONSE', 200);
      return { reply, usage };
    },
  });
}
