import { SeventySevenClient } from '@seventy-seven/sdk';
import { z } from 'zod';

import { getUserById } from '@openpanel/db';

import { createTRPCRouter, protectedProcedure } from '../trpc';

const API_KEY = process.env.SEVENTY_SEVEN_API_KEY!;
const client = new SeventySevenClient(API_KEY);

export const ticketRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        subject: z.string(),
        body: z.string(),
        meta: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!API_KEY) {
        throw new Error('Ticket system not configured');
      }

      const user = await getUserById(ctx.session.userId);

      return client.createTicket({
        subject: input.subject,
        body: input.body,
        meta: input.meta,
        senderEmail: user?.email || 'none',
        senderFullName: user?.firstName
          ? [user?.firstName, user?.lastName].filter(Boolean).join(' ')
          : 'none',
      });
    }),
});
