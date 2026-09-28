// Deliberately R + C only (no `email.service.ts`): the three procedures' bodies
// are three small `db.emailUnsubscribe` calls, inlined here the same way
// conversation.rpc.ts inlines its organization lookup. Sending/templates stay
// in @openpanel/email; core's `clients/email.ts` already wraps that package
// for the one thing this module doesn't need — sending.
//
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.
//
// This module has no queue/cron of its own, so there is no
// `ctx.services.email`, same as `user`/`reference`.
//
// `verifyUnsubscribeToken` is imported from @openpanel/email's own
// `unsubscribe.ts` file, not its barrel: the barrel (`@openpanel/email` ->
// `./src`) pulls in @openpanel/db, which is exactly the cycle
// `clients/email.ts`'s header describes for `sendEmail`. `unsubscribe.ts`
// itself only touches `node:crypto`, so importing it directly sidesteps the
// cycle instead of deferring it.

import { verifyUnsubscribeToken } from '@openpanel/email/src/unsubscribe';
import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import { TRPCAccessError, TRPCBadRequestError } from '../../rpc/errors';
import { emailCategories } from './email.constants';

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
    .input(z.object({ categories: z.record(z.string(), z.boolean()) }))
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
