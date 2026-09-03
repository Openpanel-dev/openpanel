// Dissolved into @openpanel/core's onboarding module (M6-003): the
// org+project+client creation and the "can I skip onboarding" check moved to
// packages/core/src/modules/onboarding/onboarding.service.ts. This router
// stays (DELEGATE PATTERN) — it keeps V1's protectedProcedure stack
// (session/access/logger/rate-limit middleware) and delegates every handler
// body to core's onboarding functions, same as organization's router does
// (M6-001).
import { canSkipOnboarding, createOnboardingProject } from '@openpanel/core';
import { zOnboardingProject } from '@openpanel/validation';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

export const onboardingRouter = createTRPCRouter({
  skipOnboardingCheck: publicProcedure.query(({ ctx }) =>
    canSkipOnboarding(ctx.session.userId)
  ),
  project: protectedProcedure
    .input(zOnboardingProject)
    .mutation(({ input, ctx }) =>
      createOnboardingProject(input, ctx.session.userId!)
    ),
});
