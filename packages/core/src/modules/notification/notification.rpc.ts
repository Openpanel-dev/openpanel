// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.
//
// `list`/`rules` have no access check here either. `deleteRule` and
// `createOrUpdateRule` re-check access against the *existing* rule's project,
// not just the input's.

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

      const rule = await createOrUpdateNotificationRule(ctx, input);
      // After the write, not before: the cache is what session-end reads to
      // decide which rules fire, so it is stale only once the row has changed.
      await getNotificationRulesByProjectId.clear(ctx, input.projectId);
      return rule;
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

      const deleted = await deleteNotificationRule(ctx, input.id);
      await getNotificationRulesByProjectId.clear(ctx, rule.projectId);
      return deleted;
    }),
});
