import { emailCategories } from '@openpanel/constants';
import { db } from '@openpanel/db';
import { verifyUnsubscribeToken } from '@openpanel/email';
import { z } from 'zod';
import { TRPCBadRequestError } from '../errors';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

export const emailRouter = createTRPCRouter({
  unsubscribe: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        category: z.string(),
        token: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const { email, category, token } = input;

      // Verify token
      if (!verifyUnsubscribeToken(email, category, token)) {
        throw TRPCBadRequestError('Invalid unsubscribe link');
      }

      // Upsert the unsubscribe record
      await db.emailUnsubscribe.upsert({
        where: {
          email_category: {
            email,
            category,
          },
        },
        create: {
          email,
          category,
        },
        update: {},
      });

      return { success: true };
    }),

  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.userId || !ctx.session.user?.email) {
      throw new Error('User not authenticated');
    }

    const email = ctx.session.user.email;

    // Get all unsubscribe records for this user
    const unsubscribes = await db.emailUnsubscribe.findMany({
      where: {
        email,
      },
      select: {
        category: true,
      },
    });

    const unsubscribedCategories = new Set(unsubscribes.map((u) => u.category));

    // Return object with all categories, true = subscribed (not unsubscribed)
    const preferences: Record<string, boolean> = {};
    for (const [category] of Object.entries(emailCategories)) {
      preferences[category] = !unsubscribedCategories.has(category);
    }

    return preferences;
  }),

  updatePreferences: protectedProcedure
    .input(
      z.object({
        categories: z.record(z.string(), z.boolean()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.session.userId || !ctx.session.user?.email) {
        throw new Error('User not authenticated');
      }

      const email = ctx.session.user.email;

      // Process each category
      for (const [category, subscribed] of Object.entries(input.categories)) {
        if (subscribed) {
          // User wants to subscribe - delete unsubscribe record if exists
          await db.emailUnsubscribe.deleteMany({
            where: {
              email,
              category,
            },
          });
        } else {
          // User wants to unsubscribe - upsert unsubscribe record
          await db.emailUnsubscribe.upsert({
            where: {
              email_category: {
                email,
                category,
              },
            },
            create: {
              email,
              category,
            },
            update: {},
          });
        }
      }

      return { success: true };
    }),
});
