// The composition root (ADR-007 build step 4). `auth` is the first module to
// land here (M4-007); the Ctx <-> Services circularity was proven compiling
// before it with an empty interface.

import type { Ctx } from './context';
import { createAssistantService } from './modules/assistant/assistant.service';
import { createAuthService } from './modules/auth/auth.service';
import { createChartService } from './modules/chart/chart.service';
import { createConversionService } from './modules/chart/conversion.service';
import { createFunnelService } from './modules/chart/funnel.service';
import { createRetentionService } from './modules/chart/retention.service';
import { createSankeyService } from './modules/chart/sankey.service';
import { createClientService } from './modules/client/client.service';
import { createCohortService } from './modules/cohort/cohort.service';
import { createConversationService } from './modules/conversation/conversation.service';
import { createDashboardService } from './modules/dashboard/dashboard.service';
import { createEventService } from './modules/event/event.service';
import { createExportService } from './modules/export/export.service';
import { createGroupService } from './modules/group/group.service';
import { createGscService } from './modules/gsc/gsc.service';
import { createImportService } from './modules/import/import.service';
import { createIngestService } from './modules/ingest/ingest.service';
import { createInsightService } from './modules/insight/insight.service';
import { createIntegrationService } from './modules/integration/integration.service';
import { createMcpService } from './modules/mcp/mcp.service';
import { createMiscService } from './modules/misc/misc.service';
import { createNotificationService } from './modules/notification/notification.service';
import { createOnboardingService } from './modules/onboarding/onboarding.service';
import { createOrganizationService } from './modules/organization/organization.service';
import { createOverviewService } from './modules/overview/overview.service';
import { createPagesService } from './modules/overview/pages.service';
import { createProfileService } from './modules/profile/profile.service';
import { createProjectService } from './modules/project/project.service';
import { createRealtimeService } from './modules/realtime/realtime.service';
import { createReferenceService } from './modules/reference/reference.service';
import { createReportService } from './modules/report/report.service';
import { createSaltService } from './modules/salt/salt.service';
import { createSessionService } from './modules/session/session.service';
import { createShareService } from './modules/share/share.service';
import { createSubscriptionService } from './modules/subscription/subscription.service';
import { createUserService } from './modules/user/user.service';

/** What every service factory receives — derived from Ctx, so it cannot drift. */
export type ServiceDeps = Pick<
  Ctx,
  'db' | 'ch' | 'redis' | 'clients' | 'buffers' | 'logger' | 'queues'
>;

// Two type rules the compiler enforces but cannot explain:
//
// 1. `Services` must stay an INTERFACE. A type alias over
//    `ReturnType<typeof createServices>` is circular — resolving it needs
//    every factory's signature and every factory's signature names
//    `Services`. Interface members resolve lazily, which breaks the loop.
// 2. Every service method needs an explicit return type, or a factory's
//    return type cannot be computed from signatures alone. Omit one and
//    typecheck fails with ts7022/ts7023 naming the method.
export interface Services {
  auth: ReturnType<typeof createAuthService>;
  insight: ReturnType<typeof createInsightService>;
  gsc: ReturnType<typeof createGscService>;
  cohort: ReturnType<typeof createCohortService>;
  import: ReturnType<typeof createImportService>;
  ingest: ReturnType<typeof createIngestService>;
  organization: ReturnType<typeof createOrganizationService>;
  integration: ReturnType<typeof createIntegrationService>;
  onboarding: ReturnType<typeof createOnboardingService>;
  notification: ReturnType<typeof createNotificationService>;
  session: ReturnType<typeof createSessionService>;
  event: ReturnType<typeof createEventService>;
  profile: ReturnType<typeof createProfileService>;
  group: ReturnType<typeof createGroupService>;
  chart: ReturnType<typeof createChartService>;
  // One key per `*.service.ts` (M10-009): the chart module is four files
  // besides `chart.service.ts`, so each is bound here too. `chart` keeps the
  // composed facade its own callers already use — the factories build stateless
  // closures over `deps`, so binding a sub-module twice binds the same
  // functions, not a second piece of state.
  funnel: ReturnType<typeof createFunnelService>;
  conversion: ReturnType<typeof createConversionService>;
  sankey: ReturnType<typeof createSankeyService>;
  retention: ReturnType<typeof createRetentionService>;
  overview: ReturnType<typeof createOverviewService>;
  pages: ReturnType<typeof createPagesService>;
  realtime: ReturnType<typeof createRealtimeService>;
  misc: ReturnType<typeof createMiscService>;
  report: ReturnType<typeof createReportService>;
  dashboard: ReturnType<typeof createDashboardService>;
  export: ReturnType<typeof createExportService>;
  share: ReturnType<typeof createShareService>;
  reference: ReturnType<typeof createReferenceService>;
  client: ReturnType<typeof createClientService>;
  project: ReturnType<typeof createProjectService>;
  user: ReturnType<typeof createUserService>;
  subscription: ReturnType<typeof createSubscriptionService>;
  salt: ReturnType<typeof createSaltService>;
  conversation: ReturnType<typeof createConversationService>;
  assistant: ReturnType<typeof createAssistantService>;
  mcp: ReturnType<typeof createMcpService>;
}

// MUST stay a hoisted `function` declaration, not a `const` arrow: one static
// ESM cycle runs through it (subscription.service.ts -> v1-compat.ts ->
// services.ts -> subscription.service.ts) and hoisting is the only reason it
// evaluates. A `const` would put it in a temporal dead zone that no typecheck
// reports and that fails at process boot.
export function createServices(deps: ServiceDeps): Services {
  // The thunk is captured, not copied, so two services may call each other
  // without a cycle: `container` is assigned before any thunk body can run,
  // because every sibling reach lives inside a method body.
  const services = (): Services => container;
  const container: Services = {
    auth: createAuthService(deps, services),
    insight: createInsightService(deps, services),
    gsc: createGscService(deps, services),
    cohort: createCohortService(deps, services),
    import: createImportService(deps, services),
    ingest: createIngestService(deps, services),
    organization: createOrganizationService(deps, services),
    integration: createIntegrationService(deps, services),
    onboarding: createOnboardingService(deps, services),
    notification: createNotificationService(deps, services),
    session: createSessionService(deps, services),
    event: createEventService(deps, services),
    profile: createProfileService(deps, services),
    group: createGroupService(deps, services),
    chart: createChartService(deps, services),
    funnel: createFunnelService(deps, services),
    conversion: createConversionService(deps, services),
    sankey: createSankeyService(deps, services),
    retention: createRetentionService(deps, services),
    overview: createOverviewService(deps, services),
    pages: createPagesService(deps, services),
    realtime: createRealtimeService(deps, services),
    misc: createMiscService(deps, services),
    report: createReportService(deps, services),
    dashboard: createDashboardService(deps, services),
    export: createExportService(deps, services),
    share: createShareService(deps, services),
    reference: createReferenceService(deps, services),
    client: createClientService(deps, services),
    project: createProjectService(deps, services),
    user: createUserService(deps, services),
    subscription: createSubscriptionService(deps, services),
    salt: createSaltService(deps, services),
    conversation: createConversationService(deps, services),
    assistant: createAssistantService(deps, services),
    mcp: createMcpService(deps, services),
  };
  return container;
}
