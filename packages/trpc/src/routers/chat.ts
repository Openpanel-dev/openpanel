import {
  getAvailableChatModels,
  PREFERRED_DEFAULT_MODEL_ID,
} from '@openpanel/validation';

import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * Chat config — provider availability is derived from the API process's env
 * vars and returned to the client so the model picker only shows models the
 * server can actually serve.
 *
 * The Better Agent app still registers every model in the whitelist (it's
 * built eagerly at import time); this filter only governs what the UI offers.
 */
export const chatRouter = createTRPCRouter({
  models: protectedProcedure.query(() => {
    const providers = {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    };
    const models = getAvailableChatModels(providers);
    const preferred = models.find((m) => m.id === PREFERRED_DEFAULT_MODEL_ID);
    const defaultModelId = preferred?.id ?? models[0]?.id ?? null;
    return {
      providers,
      models,
      defaultModelId,
    };
  }),
});
