// `protectedProcedure` runs `enforceAccess` BEFORE the input parser, and it only reads a
// TOP-LEVEL `projectId`. `list` and `rename` take one, so their project access is already
// enforced; `get` and `delete` take only `id`, so their ownership check stays in the
// handler. `get` denies with NOT_FOUND rather than FORBIDDEN on purpose.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCNotFoundError } from '../../rpc/errors';
import { getOrganizationByProjectIdCached } from '../organization/organization.service';
import {
  CONVERSATION_LIST_LIMIT_DEFAULT,
  CONVERSATION_TITLE_MAX_LENGTH,
  CONVERSATION_TITLE_MIN_LENGTH,
} from './conversation.constants';

const LIST_LIMIT_MIN = 1;
const LIST_LIMIT_MAX = 200;

/**
 * Listing, fetching, renaming, deleting. Creation is implicit on the first message via
 * the /ai/agents/* route. Every procedure enforces `userId === session.userId`.
 */
export const conversationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z
          .number()
          .min(LIST_LIMIT_MIN)
          .max(LIST_LIMIT_MAX)
          .default(CONVERSATION_LIST_LIMIT_DEFAULT),
      })
    )
    .query(({ input, ctx }) =>
      ctx.services.conversation.listConversations({
        projectId: input.projectId,
        userId: ctx.session.userId,
        limit: input.limit,
      })
    ),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const conv = await ctx.services.conversation.getConversationById(
        input.id,
        { withMessages: true }
      );
      if (!conv || conv.userId !== userId) {
        throw new TRPCNotFoundError('Conversation not found');
      }
      return conv;
    }),

  rename: protectedProcedure
    // A conversation belongs to the caller, not to the project - titling your
    // own chat is not a project mutation. Ownership is enforced below.
    .meta({ readOnlyMutation: true })
    .input(
      z.object({
        id: z.string(),
        title: z
          .string()
          .min(CONVERSATION_TITLE_MIN_LENGTH)
          .max(CONVERSATION_TITLE_MAX_LENGTH),
        /**
         * Required so we can create the row if the titler finishes
         * before the agent's first persistence save. When the row
         * already exists this is ignored — the ownership check
         * below still applies. `organizationId` is derived from the
         * project, not trusted from the client.
         */
        projectId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;

      // If the conversation already exists, enforce ownership. Access to
      // `input.projectId` itself is already enforced by `enforceAccess`
      // (a top-level field), so a fresh row needs no further check here.
      const conv = await ctx.services.conversation.getConversationById(
        input.id
      );
      if (conv && conv.userId !== userId) {
        throw new TRPCNotFoundError('Conversation not found');
      }

      // Derive organizationId from the project — we never trust a
      // client-supplied value here, even if the caller has access to
      // the project (they'd still be able to tag the conversation with
      // an unrelated org id).
      const organization = await getOrganizationByProjectIdCached(
        ctx,
        input.projectId
      );
      if (!organization) {
        throw new TRPCNotFoundError('Project not found');
      }

      return ctx.services.conversation.upsertConversationTitle({
        id: input.id,
        title: input.title,
        projectId: input.projectId,
        organizationId: organization.id,
        userId,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const conv = await ctx.services.conversation.getConversationById(
        input.id
      );
      if (!conv || conv.userId !== userId) {
        throw new TRPCNotFoundError('Conversation not found');
      }
      await ctx.services.conversation.deleteConversation(input.id);
      return { success: true };
    }),
});
