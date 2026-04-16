import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  deleteConversation,
  getConversationById,
  getOrganizationByProjectIdCached,
  listConversations,
  upsertConversationTitle,
} from '@openpanel/db';

import { getProjectAccess } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * Conversation management — listing, fetching, renaming, deleting.
 * Conversation creation is implicit (lazy) on the first message via the
 * /ai/chat controller, so there's no `create` here.
 *
 * All procedures enforce ownership via `userId === session.userId` so a
 * user can never read or mutate another user's conversations.
 */
export const conversationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      return listConversations({
        projectId: input.projectId,
        userId: ctx.session.userId,
        limit: input.limit,
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const conv = await getConversationById(input.id, { withMessages: true });
      if (!conv || conv.userId !== ctx.session.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }
      return conv;
    }),

  rename: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(80),
        /**
         * Required so we can create the row if the titler finishes
         * before the agent's first persistence save. When the row
         * already exists this is ignored — the ownership check
         * below still applies. `organizationId` is derived from the
         * project, not trusted from the client.
         */
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // If the conversation already exists, enforce ownership. If it
      // doesn't, verify the caller has access to the project being
      // created under before letting the upsert create a fresh row.
      const conv = await getConversationById(input.id);
      if (conv) {
        if (conv.userId !== ctx.session.userId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conversation not found',
          });
        }
      } else {
        const access = await getProjectAccess({
          projectId: input.projectId,
          userId: ctx.session.userId,
        });
        if (!access) {
          throw TRPCAccessError('You do not have access to this project');
        }
      }
      // Derive organizationId from the project — we never trust a
      // client-supplied value here, even if the caller has access to
      // the project (they'd still be able to tag the conversation with
      // an unrelated org id).
      const organization = await getOrganizationByProjectIdCached(
        input.projectId,
      );
      if (!organization) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found',
        });
      }
      return upsertConversationTitle({
        id: input.id,
        title: input.title,
        projectId: input.projectId,
        organizationId: organization.id,
        userId: ctx.session.userId,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const conv = await getConversationById(input.id);
      if (!conv || conv.userId !== ctx.session.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }
      await deleteConversation(input.id);
      return { success: true };
    }),
});
