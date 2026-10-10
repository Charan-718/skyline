import { logger } from '../../../shared/logger.js';

export function createDevEmailAdapter() {
  return {
    async send({ to, subject, text }) {
      logger.info({ to, subject, text: text?.slice(0, 200) }, 'DevEmailAdapter send');
      return { providerMessageId: `dev-email-${Date.now()}` };
    },
  };
}
