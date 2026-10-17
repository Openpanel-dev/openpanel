import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import {
  zCustomEventInput,
  zCustomEventUpdate,
} from './custom-event.constants';

export const customEventRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      return ctx.services.customEvent.list(input.projectId);
    }),

  create: protectedProcedure
    .input(zCustomEventInput)
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });
      return ctx.services.customEvent.create(input);
    }),

  update: protectedProcedure
    .input(zCustomEventUpdate)
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });
      return ctx.services.customEvent.update(input);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid(), projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });
      return ctx.services.customEvent.delete(input);
    }),
});
