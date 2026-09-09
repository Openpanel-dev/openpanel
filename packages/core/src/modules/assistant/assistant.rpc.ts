// Ported from packages/trpc/src/routers/chat.ts (M5-005).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).

import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import {
  getAvailableChatModels,
  PREFERRED_DEFAULT_MODEL_ID,
} from './assistant.constants';

export const chatRouter = createTRPCRouter({
  models: protectedProcedure.query(({ ctx }) => {
    const providers = {
      openai: Boolean(ctx.config.ai.openai.apiKey),
      anthropic: Boolean(ctx.config.ai.anthropic.apiKey),
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
