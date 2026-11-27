import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { canWriteProject } from '../../shared/access-lookups';

const zProjectInput = z.object({ projectId: z.string() });

export const revenueCatRouter = createTRPCRouter({
  get: protectedProcedure.input(zProjectInput).query(async ({ input, ctx }) => {
    const access = await ctx.services.auth.getProjectAccess({
      userId: ctx.session.userId,
      projectId: input.projectId,
    });
    return ctx.services.revenueCat.view(input.projectId, {
      withSecret: canWriteProject(access),
    });
  }),

  enable: protectedProcedure
    .input(zProjectInput)
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });
      return ctx.services.revenueCat.enable(input.projectId);
    }),

  rotate: protectedProcedure
    .input(zProjectInput)
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });
      return ctx.services.revenueCat.rotate(input.projectId);
    }),

  disable: protectedProcedure
    .input(zProjectInput)
    .mutation(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });
      return ctx.services.revenueCat.disable(input.projectId);
    }),
});
