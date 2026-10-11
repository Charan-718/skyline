import { createGeminiClient } from '../../shared/gemini/client.js';
import { createOpenRouterClient } from '../../shared/llm/openRouterClient.js';
import { createEventAgentService } from './service.js';
import { createEventAgentController } from './controller.js';
import { createEventAgentRoutes } from './routes.js';

/**
 * The ordered list of model clients from EVENT_AGENT_CHAIN. Gemini uses EVENT_AGENT_GEMINI_API_KEY,
 * falling back to GEMINI_API_KEY; OpenRouter uses OPENROUTER_API_KEY. Entries without a key, unknown
 * entries and duplicates are skipped. Empty chain -> agent unavailable, manual create still works.
 */
export function buildModelChain(config) {
  if (!config.EVENT_AGENT_ENABLED) return [];
  const geminiKey = config.EVENT_AGENT_GEMINI_API_KEY || config.GEMINI_API_KEY;
  const factories = {
    gemini: () => geminiKey && createGeminiClient({ apiKey: geminiKey, model: config.EVENT_AGENT_GEMINI_MODEL, timeoutMs: config.EVENT_AGENT_TIMEOUT_MS }),
    'gemini-fallback': () =>
      geminiKey &&
      config.EVENT_AGENT_FALLBACK_MODEL &&
      config.EVENT_AGENT_FALLBACK_MODEL !== 'none' &&
      createGeminiClient({ apiKey: geminiKey, model: config.EVENT_AGENT_FALLBACK_MODEL, timeoutMs: config.EVENT_AGENT_FALLBACK_TIMEOUT_MS }),
    openrouter: () =>
      config.OPENROUTER_API_KEY &&
      createOpenRouterClient({ apiKey: config.OPENROUTER_API_KEY, model: config.EVENT_AGENT_OPENROUTER_MODEL, timeoutMs: config.EVENT_AGENT_OPENROUTER_TIMEOUT_MS, appUrl: config.APP_BASE_URL }),
  };
  const seen = new Set();
  return config.EVENT_AGENT_CHAIN.split(',')
    .map((s) => s.trim())
    .filter((name) => factories[name] && !seen.has(name) && seen.add(name))
    .map((name) => factories[name]())
    .filter(Boolean)
    .filter((c, i, all) => all.findIndex((x) => x.model === c.model) === i);
}

export function createEventAgentModule({ db, eventService, authz, config, logger, gemini }) {
  const clients = gemini !== undefined ? [gemini].filter(Boolean) : buildModelChain(config);
  if (gemini === undefined) {
    logger.info({ chain: clients.map((c) => c.model), keySource: config.EVENT_AGENT_GEMINI_API_KEY ? 'EVENT_AGENT_GEMINI_API_KEY' : 'GEMINI_API_KEY' }, clients.length ? 'event-agent: enabled' : 'event-agent: disabled (no API key)');
  }
  const eventAgentService = createEventAgentService({ db, eventService, authz, clients, timeZone: config.APP_TIMEZONE, logger });
  const routes = createEventAgentRoutes({
    controller: createEventAgentController({ eventAgentService }),
    rateLimitPerMin: config.EVENT_AGENT_RATE_LIMIT_PER_MIN,
  });
  return Object.freeze({ eventAgentService, routes });
}
