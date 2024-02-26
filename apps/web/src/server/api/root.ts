import { createTRPCRouter } from '@/server/api/trpc';

import { chartRouter } from './routers/chart';
import { clientRouter } from './routers/client';
import { dashboardRouter } from './routers/dashboard';
import { eventRouter } from './routers/event';
import { onboardingRouter } from './routers/onboarding';
import { organizationRouter } from './routers/organization';
import { profileRouter } from './routers/profile';
import { projectRouter } from './routers/project';
import { reportRouter } from './routers/report';
import { shareRouter } from './routers/share';
import { uiRouter } from './routers/ui';
import { userRouter } from './routers/user';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  chart: chartRouter,
  report: reportRouter,
  dashboard: dashboardRouter,
  organization: organizationRouter,
  user: userRouter,
  project: projectRouter,
  client: clientRouter,
  event: eventRouter,
  profile: profileRouter,
  ui: uiRouter,
  share: shareRouter,
  onboarding: onboardingRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
