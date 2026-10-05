// `enforceAccess` only sees a top-level `projectId` / `organizationId`, so
// anything resolved from another id needs its own explicit check in the handler.
//
// `verifyUnsubscribeToken` is imported from @openpanel/email's `unsubscribe.ts`,
// not its barrel: the barrel pulls in @openpanel/db, a cycle (see
// `clients/email.ts`). `unsubscribe.ts` only touches `node:crypto`.

import { verifyUnsubscribeToken } from '@openpanel/email/src/unsubscribe';
import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import { TRPCAccessError, TRPCBadRequestError } from '../../rpc/errors';
import { emailCategories, zUpdateEmailPreferences } from './email.constants';

export const emailRouter = createTRPCRouter({
  unsubscribe: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        category: z.string(),
        token: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { email, category, token } = input;

      if (!verifyUnsubscribeToken(email, category, token)) {
        throw new TRPCBadRequestError('Invalid unsubscribe link');
      }

      const db = ctx.db;
      await db.emailUnsubscribe.upsert({
        where: { email_category: { email, category } },
        create: { email, category },
        update: {},
      });

      return { success: true };
    }),

  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.user?.email) {
      throw new TRPCAccessError('Not authenticated');
    }
    const email = ctx.session.user.email;

    const db = ctx.db;
    const unsubscribes = await db.emailUnsubscribe.findMany({
      where: { email },
      select: { category: true },
    });
    const unsubscribedCategories = new Set(unsubscribes.map((u) => u.category));

    const preferences: Record<string, boolean> = {};
    for (const category of Object.keys(emailCategories)) {
      preferences[category] = !unsubscribedCategories.has(category);
    }
    return preferences;
  }),

  updatePreferences: protectedProcedure
    .input(zUpdateEmailPreferences)
    .mutation(async ({ input, ctx }) => {
      const email = ctx.session.user?.email;
      if (!email) {
        throw new TRPCAccessError('Not authenticated');
      }

      const db = ctx.db;
      for (const [category, subscribed] of Object.entries(input.categories)) {
        if (subscribed) {
          await db.emailUnsubscribe.deleteMany({ where: { email, category } });
        } else {
          await db.emailUnsubscribe.upsert({
            where: { email_category: { email, category } },
            create: { email, category },
            update: {},
          });
        }
      }

      return { success: true };
    }),
});
