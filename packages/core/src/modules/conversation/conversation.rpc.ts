// Ported from packages/trpc/src/routers/conversation.ts (M5-006).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's conversation functions
// (DELEGATE PATTERN). `ctx.services.conversation` carries this module's
// factory the same as every other module now (M10-004).
//
// The per-project access ladder itself IS shared: `./src/access.ts` binds
// core's shared/access.ts ladder to @openpanel/db's real lookups, the same
// way packages/trpc/src/access.ts does for V1.

import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError, TRPCNotFoundError } from '../../rpc/errors';
import { getOrganizationByProjectIdCached } from '../organization/organization.service';

const LIST_LIMIT_MIN = 1;
const LIST_LIMIT_MAX = 200;
const LIST_LIMIT_DEFAULT = 50;
const TITLE_MIN_LENGTH = 1;
const TITLE_MAX_LENGTH = 80;

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

/**
 * Conversation management — listing, fetching, renaming, deleting.
 * Conversation creation is implicit (lazy) on the first message via the
 * /ai/agents/* route, so there's no `create` here.
 *
 * All procedures enforce ownership via `userId === session.userId` so a
 * user can never read or mutate another user's conversations.
 */
export const conversationRouter = createTRPCRouter({
  list: procedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z
          .number()
          .min(LIST_LIMIT_MIN)
          .max(LIST_LIMIT_MAX)
          .default(LIST_LIMIT_DEFAULT),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      return ctx.services.conversation.listConversations({
        projectId: input.projectId,
        userId,
        limit: input.limit,
      });
    }),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const conv = await ctx.services.conversation.getConversationById(
        input.id,
        { withMessages: true }
      );
      if (!conv || conv.userId !== userId) {
        throw new TRPCNotFoundError('Conversation not found');
      }
      return conv;
    }),

  rename: procedure
    // A conversation belongs to the caller, not to the project - titling your
    // own chat is not a project mutation. Ownership is enforced below.
    .meta({ readOnlyMutation: true })
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(TITLE_MIN_LENGTH).max(TITLE_MAX_LENGTH),
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
      const userId = requireLogin(ctx.session.userId);

      // If the conversation already exists, enforce ownership. If it
      // doesn't, verify the caller has access to the project being
      // created under before letting the upsert create a fresh row.
      const conv = await ctx.services.conversation.getConversationById(
        input.id
      );
      if (conv) {
        if (conv.userId !== userId) {
          throw new TRPCNotFoundError('Conversation not found');
        }
      } else {
        await ctx.services.auth.requireProjectAccess({
          userId,
          projectId: input.projectId,
          level: 'read',
        });
      }

      // Derive organizationId from the project — we never trust a
      // client-supplied value here, even if the caller has access to
      // the project (they'd still be able to tag the conversation with
      // an unrelated org id).
      const organization = await getOrganizationByProjectIdCached(
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

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
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
