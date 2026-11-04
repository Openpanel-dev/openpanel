// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser — `models` takes no input and needs no object-id check of
// its own, so the handler is the query and nothing else.

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCNotFoundError } from '../../rpc/errors';
import {
  getOrganizationByProjectIdCached,
  getSettingsForProject,
} from '../organization/organization.service';
import {
  getAvailableChatModels,
  getDefaultChatModelId,
  zReportDraftRequest,
} from './assistant.constants';
import { checkChatLimits, resolveChatTier } from './src/limits';

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

  // The report editor's prompt box. Drafts a report for the caller's own
  // editor and changes no project state, but it is a model turn, so it counts
  // against the same spend limits as a chat message.
  draftReport: protectedProcedure
    .meta({ readOnlyMutation: true })
    .input(zReportDraftRequest)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });
      const [organization, settings] = await Promise.all([
        getOrganizationByProjectIdCached(ctx, input.projectId),
        getSettingsForProject(ctx, input.projectId),
      ]);
      if (!organization) {
        throw new TRPCNotFoundError('Project not found');
      }
      const limited = await checkChatLimits(ctx, {
        organizationId: organization.id,
        userId,
        tier: resolveChatTier(organization, ctx.config.selfHosted),
      });
      if (limited) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: limited.message,
        });
      }
      return ctx.services.assistant.draftReport({
        prompt: input.prompt,
        projectId: input.projectId,
        timezone: settings.timezone || 'UTC',
        userId,
      });
    }),
});
