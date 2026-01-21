import { z } from 'zod';
import { db } from '@openpanel/db';
import { verifyUnsubscribeToken } from '@openpanel/email';
import { createTRPCRouter, publicProcedure } from '../trpc';

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
        throw new Error('Invalid unsubscribe link');
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
});
