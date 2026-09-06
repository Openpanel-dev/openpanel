// Ported from packages/trpc/src/routers/notification.ts (M6-005).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's notification functions (DELEGATE
// PATTERN), so nothing here is a live regression.
//
// `list`/`rules` have no access check here either — same gap V1's router has
// (ported verbatim, not fixed; see notification.service.ts's header for why
// `deleteRule` and `createOrUpdateRule` re-check access against the
// *existing* rule's project, not just the input's).
//
// The permission ladder itself is bound once, in auth.service.ts
// (M10-002); every procedure here reaches it through `ctx.services.auth`.

import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import { zCreateNotificationRule } from './notification.constants';
import {
  createOrUpdateNotificationRule,
  deleteNotificationRule,
  getNotificationRuleByIdOrThrow,
  getNotificationRulesByProjectId,
  listNotificationRules,
  listNotifications,
} from './notification.service';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const notificationRouter = createTRPCRouter({
  list: procedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return listNotifications(ctx, input.projectId);
    }),

  rules: procedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return listNotificationRules(ctx, input.projectId);
    }),

  createOrUpdateRule: procedure
    .input(zCreateNotificationRule)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);

      // Clear the cache for the project
      await getNotificationRulesByProjectId.clear(input.projectId);

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'write',
      });

      if (input.id) {
        const existing = await getNotificationRuleByIdOrThrow(ctx, input.id);
        await ctx.services.auth.requireProjectAccess({
          userId,
          projectId: existing.projectId,
          level: 'write',
        });
      }

      return createOrUpdateNotificationRule(ctx, input);
    }),

  deleteRule: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const rule = await getNotificationRuleByIdOrThrow(ctx, input.id);

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: rule.projectId,
        level: 'write',
      });

      return deleteNotificationRule(ctx, input.id);
    }),
});
