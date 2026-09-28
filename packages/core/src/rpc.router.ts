// The one static composition point for every tRPC procedure this package
// serves. No `defineModule`, no filesystem discovery — adding a module's RPC
// half is one line here, which is what keeps `AppRouter` a real type (ADR-007
// decision 19). Only `health` exists so far; the 28 real routers land with
// their module waves (P5-P8).

import { chatRouter } from './modules/assistant/assistant.rpc';
import { authRouter } from './modules/auth/auth.rpc';
import { chartRouter } from './modules/chart/chart.rpc';
import { clientRouter } from './modules/client/client.rpc';
import { cohortRouter } from './modules/cohort/cohort.rpc';
import { conversationRouter } from './modules/conversation/conversation.rpc';
import { dashboardRouter } from './modules/dashboard/dashboard.rpc';
import { emailRouter } from './modules/email/email.rpc';
import { eventRouter } from './modules/event/event.rpc';
import { groupRouter } from './modules/group/group.rpc';
import { gscRouter } from './modules/gsc/gsc.rpc';
import { healthRouter } from './modules/health/health.rpc';
import { importRouter } from './modules/import/import.rpc';
import { insightRouter } from './modules/insight/insight.rpc';
import { integrationRouter } from './modules/integration/integration.rpc';
import { notificationRouter } from './modules/notification/notification.rpc';
import { onboardingRouter } from './modules/onboarding/onboarding.rpc';
import { organizationRouter } from './modules/organization/organization.rpc';
import { overviewRouter } from './modules/overview/overview.rpc';
import { profileRouter } from './modules/profile/profile.rpc';
import { projectRouter } from './modules/project/project.rpc';
import { realtimeRouter } from './modules/realtime/realtime.rpc';
import { referenceRouter } from './modules/reference/reference.rpc';
import { reportRouter } from './modules/report/report.rpc';
import { sessionRouter } from './modules/session/session.rpc';
import { shareRouter } from './modules/share/share.rpc';
import { subscriptionRouter } from './modules/subscription/subscription.rpc';
import { userRouter } from './modules/user/user.rpc';
import { widgetRouter } from './modules/widget/widget.rpc';
import { createTRPCRouter } from './rpc/base';

export const appRouter = createTRPCRouter({
  health: healthRouter,
  insight: insightRouter,
  gsc: gscRouter,
  cohort: cohortRouter,
  import: importRouter,
  chat: chatRouter,
  conversation: conversationRouter,
  organization: organizationRouter,
  user: userRouter,
  project: projectRouter,
  client: clientRouter,
  auth: authRouter,
  onboarding: onboardingRouter,
  realtime: realtimeRouter,
  reference: referenceRouter,
  share: shareRouter,
  email: emailRouter,
  notification: notificationRouter,
  integration: integrationRouter,
  subscription: subscriptionRouter,
  session: sessionRouter,
  event: eventRouter,
  profile: profileRouter,
  group: groupRouter,
  chart: chartRouter,
  overview: overviewRouter,
  report: reportRouter,
  dashboard: dashboardRouter,
  widget: widgetRouter,
});

export type AppRouter = typeof appRouter;
