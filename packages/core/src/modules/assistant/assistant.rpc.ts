// Ported from packages/trpc/src/routers/chat.ts (M5-005).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed` (same as cohort.rpc.ts / gsc.rpc.ts
// / import.rpc.ts). V1 keeps serving the live route through packages/trpc's
// own `protectedProcedure` (full stack included), now sourcing the model
// whitelist from `@openpanel/core` instead of `@openpanel/validation`
// directly (DELEGATE PATTERN), so nothing here is a live regression.

import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import {
  getAvailableChatModels,
  PREFERRED_DEFAULT_MODEL_ID,
} from './assistant.constants';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const chatRouter = createTRPCRouter({
  models: procedure.query(({ ctx }) => {
    requireLogin(ctx.session.userId);

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
