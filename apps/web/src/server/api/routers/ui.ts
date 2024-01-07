import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { z } from 'zod';

export const config = {
  api: {
    responseLimit: false,
  },
};

export const uiRouter = createTRPCRouter({
  breadcrumbs: protectedProcedure
    .input(
      z.object({
        url: z.string(),
      })
    )
    .query(({ input: { url } }) => {
      const parts = url.split('/').filter(Boolean);
      return parts;
    }),
});
