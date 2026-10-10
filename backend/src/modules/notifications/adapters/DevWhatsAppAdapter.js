import { logger } from '../../../shared/logger.js';

export function createDevWhatsAppAdapter() {
  return {
    async send({ toE164, text }) {
      logger.info({ toE164, text: text?.slice(0, 200) }, 'DevWhatsAppAdapter send');
      return { providerMessageId: `dev-wa-${Date.now()}` };
    },
  };
}
