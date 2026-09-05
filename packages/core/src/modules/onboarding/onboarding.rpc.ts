// Ported from packages/trpc/src/routers/onboarding.ts (M6-003).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed` — same shape as
// organization.rpc.ts/project.rpc.ts. `project`'s input can carry an
// existing `organizationId`, which V1's generic `enforceAccess` middleware
// gates on membership (not admin — joining an org you already belong to
// needs no more than that); this router does the same check explicitly,
// through the organization module's own db-bound lookup (dynamically
// imported, same as organization.rpc.ts's `./src/access`).
//
// V1 keeps serving the live route through packages/trpc's own
// `protectedProcedure`/`publicProcedure` and delegates every handler body to
// `./onboarding.service` (DELEGATE PATTERN) — the same functions this router
// calls.

import { zOnboardingProject } from '@openpanel/validation';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError, TRPCForbiddenError } from '../../rpc/errors';
import {
  canSkipOnboarding,
  createOnboardingProject,
} from './onboarding.service';

function loadOrganizationAccess() {
  return import('@openpanel/core');
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const onboardingRouter = createTRPCRouter({
  skipOnboardingCheck: procedure.query(({ ctx }) =>
    canSkipOnboarding(ctx.session.userId)
  ),

  project: procedure
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

      return createOnboardingProject(input, userId);
    }),
});
