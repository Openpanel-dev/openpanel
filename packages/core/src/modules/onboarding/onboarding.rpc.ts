// Ported from packages/trpc/src/routers/onboarding.ts (M6-003).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// `project`'s input can carry an existing `organizationId`, which
// `enforceAccess` gates on membership (not admin — joining an org you
// already belong to needs no more than that); this router repeats the check
// explicitly through the organization module's own lookup.

import { zOnboardingProject } from '@openpanel/validation';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import { TRPCAccessError, TRPCForbiddenError } from '../../rpc/errors';
import {
  canSkipOnboarding,
  createOnboardingProject,
} from './onboarding.service';

function loadOrganizationAccess() {
  return import('../../shared/access-lookups');
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const onboardingRouter = createTRPCRouter({
  skipOnboardingCheck: publicProcedure.query(({ ctx }) =>
    canSkipOnboarding(ctx, ctx.session.userId)
  ),

  project: protectedProcedure
    .input(zOnboardingProject)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);

      if (input.organizationId) {
        const { getOrganizationAccess } = await loadOrganizationAccess();
        const access = await getOrganizationAccess({
          userId,
          organizationId: input.organizationId,
        });
        if (!access) {
          throw new TRPCForbiddenError(
            'You do not have access to this organization'
          );
        }
      }

      return createOnboardingProject(ctx, input, userId);
    }),
});
