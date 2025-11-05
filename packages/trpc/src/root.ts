import { authRouter } from './routers/auth';
import { chartRouter } from './routers/chart';
import { chatRouter } from './routers/chat';
import { clientRouter } from './routers/client';
import { dashboardRouter } from './routers/dashboard';
import { eventRouter } from './routers/event';
import { importRouter } from './routers/import';
import { integrationRouter } from './routers/integration';
import { notificationRouter } from './routers/notification';
import { onboardingRouter } from './routers/onboarding';
import { organizationRouter } from './routers/organization';
import { overviewRouter } from './routers/overview';
import { profileRouter } from './routers/profile';
import { projectRouter } from './routers/project';
import { realtimeRouter } from './routers/realtime';
import { referenceRouter } from './routers/reference';
import { reportRouter } from './routers/report';
import { sessionRouter } from './routers/session';
import { shareRouter } from './routers/share';
import { subscriptionRouter } from './routers/subscription';
import { userRouter } from './routers/user';
import { createTRPCRouter } from './trpc';
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
  session: sessionRouter,
  share: shareRouter,
  onboarding: onboardingRouter,
  reference: referenceRouter,
  notification: notificationRouter,
  integration: integrationRouter,
  import: importRouter,
  auth: authRouter,
  subscription: subscriptionRouter,
  overview: overviewRouter,
  realtime: realtimeRouter,
  chat: chatRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
