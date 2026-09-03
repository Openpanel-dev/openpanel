// Dissolved into @openpanel/core's notification module (M6-005): the CRUD
// and rule-write bodies moved to
// packages/core/src/modules/notification/notification.service.ts. This
// router stays (DELEGATE PATTERN) — it keeps V1's protectedProcedure stack
// (session/access/logger/rate-limit middleware) and delegates every handler
// body to core's notification functions, same as organization's router does
// (M6-001).

import {
  createOrUpdateNotificationRule,
  deleteNotificationRule,
  getNotificationRuleByIdOrThrow,
  getNotificationRulesByProjectId,
  listNotificationRules,
  listNotifications,
} from '@openpanel/core';
import { zCreateNotificationRule } from '@openpanel/validation';
import { z } from 'zod';

import { requireProjectAccess } from '../access';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return listNotifications(input.projectId);
    }),
  rules: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return listNotificationRules(input.projectId);
    }),
  createOrUpdateRule: protectedProcedure
    .input(zCreateNotificationRule)
    .mutation(async ({ input, ctx }) => {
      // Clear the cache for the project
      await getNotificationRulesByProjectId.clear(input.projectId);

      // Authorize the target project (covers both create and update; the
      // create branch previously had no access check) and verify every
      // connected integration belongs to this project or is a legacy
      // org-wide one in the same org — never another project's.
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      if (input.id) {
        const existing = await getNotificationRuleByIdOrThrow(input.id);
        await requireProjectAccess({
          userId: ctx.session.userId,
          projectId: existing.projectId,
          level: 'write',
        });
      }

      return createOrUpdateNotificationRule(input);
    }),
  deleteRule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input: { id }, ctx }) => {
      const rule = await getNotificationRuleByIdOrThrow(id);

      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: rule.projectId,
        level: 'write',
      });

      return deleteNotificationRule(id);
    }),
});
