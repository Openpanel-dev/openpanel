// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.
//
// `list`/`rules` have no access check here either — same gap V1's router has
// (ported verbatim, not fixed; see notification.service.ts's header for why
// `deleteRule` and `createOrUpdateRule` re-check access against the *existing*
// rule's project, not just the input's).
//
// The permission ladder itself is bound once, in auth.service.ts; every
// procedure here reaches it through `ctx.services.auth`.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { zCreateNotificationRule } from './notification.constants';
import {
  createOrUpdateNotificationRule,
  deleteNotificationRule,
  getNotificationRuleByIdOrThrow,
  getNotificationRulesByProjectId,
  listNotificationRules,
  listNotifications,
} from './notification.service';

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) => {
      return listNotifications(ctx, input.projectId);
    }),

  rules: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) => {
      return listNotificationRules(ctx, input.projectId);
    }),

  createOrUpdateRule: protectedProcedure
    .input(zCreateNotificationRule)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;

      // Clear the cache for the project
      await getNotificationRulesByProjectId.clear(ctx, input.projectId);

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

  deleteRule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const rule = await getNotificationRuleByIdOrThrow(ctx, input.id);

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: rule.projectId,
        level: 'write',
      });

      return deleteNotificationRule(ctx, input.id);
    }),
});
