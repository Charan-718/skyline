import { createGeminiClient } from './geminiClient.js';
import { createAssistantService } from './service.js';
import { createAssistantController } from './controller.js';
import { createAssistantRoutes } from './routes.js';

/** Per-event assistant. Without GEMINI_API_KEY only the suggested prompts work. */
export function createAssistantModule({ db, eventService, config, logger, gemini }) {
  const client =
    gemini !== undefined
      ? gemini
      : config.ASSISTANT_ENABLED && config.GEMINI_API_KEY
        ? createGeminiClient({ apiKey: config.GEMINI_API_KEY, model: config.GEMINI_MODEL, timeoutMs: config.GEMINI_TIMEOUT_MS })
        : null;
  if (client && gemini === undefined && config.GEMINI_API_KEY.startsWith('AIza')) {
    // Old-style "standard" keys: Gemini rejects unrestricted ones; new AI Studio keys are auth keys.
    logger.warn('assistant: GEMINI_API_KEY looks like an old standard key (AIza…). If calls fail with AUTH, create a new key in Google AI Studio.');
  }
  const assistantService = createAssistantService({ db, eventService, gemini: client, timeZone: config.APP_TIMEZONE, logger });
  const routes = createAssistantRoutes({
    controller: createAssistantController({ assistantService }),
    rateLimitPerMin: config.ASSISTANT_RATE_LIMIT_PER_MIN,
  });
  return Object.freeze({ assistantService, routes });
}
