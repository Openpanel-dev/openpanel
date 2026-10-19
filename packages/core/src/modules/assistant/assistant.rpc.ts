// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser — `models` takes no input and needs no object-id check of
// its own, so the handler is the query and nothing else.

import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import {
  getAvailableChatModels,
  getDefaultChatModelId,
} from './assistant.constants';

export const chatRouter = createTRPCRouter({
  models: protectedProcedure.query(({ ctx }) => {
    const providers = {
      openai: Boolean(ctx.config.ai.openai.apiKey),
      anthropic: Boolean(ctx.config.ai.anthropic.apiKey),
    };
    return {
      providers,
      models: getAvailableChatModels(providers),
      defaultModelId: getDefaultChatModelId(providers),
      // Cloud runs one vetted model; a self-hoster pays for their own keys and picks.
      canChooseModel: ctx.config.selfHosted,
    };
  }),
});
