// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. `enforceAccess` gates a top-level `organizationId` on
// membership only, but adding a project and a write client to an existing
// organization is what `project.create` and `client.create` reserve for
// organization admins, so this router requires the same.

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import { zOnboardingProject } from './onboarding.constants';
import {
  canSkipOnboarding,
  createOnboardingProject,
} from './onboarding.service';

export const onboardingRouter = createTRPCRouter({
  skipOnboardingCheck: publicProcedure.query(({ ctx }) =>
    canSkipOnboarding(ctx, ctx.session.userId)
  ),

  project: protectedProcedure
    .input(zOnboardingProject)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;

      if (input.organizationId) {
        await ctx.services.auth.requireOrganizationAdmin({
          userId,
          organizationId: input.organizationId,
          message: 'Only organization admins can create projects',
        });
      }

      return createOnboardingProject(ctx, input, userId);
    }),
});
