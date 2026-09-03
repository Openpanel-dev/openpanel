// Ported from packages/trpc/src/routers/email.ts (M6-004).
//
// Deliberately R + C only (no `email.service.ts`): the three procedures'
// bodies are three small `db.emailUnsubscribe` calls, inlined here the same
// way conversation.rpc.ts inlines its organization lookup. Sending/templates
// stay in @openpanel/email (TARGET_ARCHITECTURE §7); core's
// `clients/email.ts` already wraps that package for the one thing this
// module doesn't need — sending.
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's `verifyUnsubscribeToken` +
// `emailCategories` (DELEGATE PATTERN) — this module has no queue/cron of
// its own, so there is no `ctx.services.email`, same as `user`/`reference`.
//
// `verifyUnsubscribeToken` is imported from @openpanel/email's own
// `unsubscribe.ts` file, not its barrel: the barrel (`@openpanel/email` ->
// `./src`) pulls in @openpanel/db, which is exactly the cycle
// `clients/email.ts`'s header describes for `sendEmail`. `unsubscribe.ts`
// itself only touches `node:crypto`, so importing it directly sidesteps the
// cycle instead of deferring it.

import { verifyUnsubscribeToken } from '@openpanel/email/src/unsubscribe';
import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError, TRPCBadRequestError } from '../../rpc/errors';
import { emailCategories } from './email.constants';

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const emailRouter = createTRPCRouter({
  unsubscribe: procedure
    .input(
      z.object({
        email: z.string().email(),
        category: z.string(),
        token: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { email, category, token } = input;

      if (!verifyUnsubscribeToken(email, category, token)) {
        throw new TRPCBadRequestError('Invalid unsubscribe link');
      }

      const db = await loadDb();
      await db.emailUnsubscribe.upsert({
        where: { email_category: { email, category } },
        create: { email, category },
        update: {},
      });

      return { success: true };
    }),

  getPreferences: procedure.query(async ({ ctx }) => {
    requireLogin(ctx.session.userId);
    if (!ctx.session.user?.email) {
      throw new Error('User not authenticated');
    }
    const email = ctx.session.user.email;

    const db = await loadDb();
    const unsubscribes = await db.emailUnsubscribe.findMany({
      where: { email },
      select: { category: true },
    });
    const unsubscribedCategories = new Set(
      unsubscribes.map((u) => u.category)
    );

    const preferences: Record<string, boolean> = {};
    for (const category of Object.keys(emailCategories)) {
      preferences[category] = !unsubscribedCategories.has(category);
    }
    return preferences;
  }),

  updatePreferences: procedure
    .input(z.object({ categories: z.record(z.string(), z.boolean()) }))
    .mutation(async ({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      const email = ctx.session.user?.email;
      if (!email) {
        throw new Error('User not authenticated');
      }

      const db = await loadDb();
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
