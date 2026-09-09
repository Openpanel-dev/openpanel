// The composition root (ADR-007 build step 4). `auth` is the first module to
// land here (M4-007); the Ctx <-> Services circularity was proven compiling
// before it with an empty interface.

import type { Ctx } from './context';
import {
  type AssistantService,
  createAssistantService,
} from './modules/assistant/assistant.service';
import {
  type AuthService,
  createAuthService,
} from './modules/auth/auth.service';
import {
  type ChartService,
  createChartService,
} from './modules/chart/chart.service';
import {
  type ConversionService,
  createConversionService,
} from './modules/chart/conversion.service';
import {
  createFunnelService,
  type FunnelService,
} from './modules/chart/funnel.service';
import {
  createRetentionService,
  type RetentionService,
} from './modules/chart/retention.service';
import {
  createSankeyService,
  type SankeyService,
} from './modules/chart/sankey.service';
import {
  type ClientService,
  createClientService,
} from './modules/client/client.service';
import {
  type CohortService,
  createCohortService,
} from './modules/cohort/cohort.service';
import {
  type ConversationService,
  createConversationService,
} from './modules/conversation/conversation.service';
import {
  createDashboardService,
  type DashboardService,
} from './modules/dashboard/dashboard.service';
import {
  createEventService,
  type EventService,
} from './modules/event/event.service';
import {
  createExportService,
  type ExportService,
} from './modules/export/export.service';
import {
  createGroupService,
  type GroupService,
} from './modules/group/group.service';
import { createGscService, type GscService } from './modules/gsc/gsc.service';
import {
  createImportService,
  type ImportService,
} from './modules/import/import.service';
import {
  createIngestService,
  type IngestService,
} from './modules/ingest/ingest.service';
import {
  createInsightService,
  type InsightService,
} from './modules/insight/insight.service';
import {
  createIntegrationService,
  type IntegrationService,
} from './modules/integration/integration.service';
import { createMcpService, type McpService } from './modules/mcp/mcp.service';
import {
  createMiscService,
  type MiscService,
} from './modules/misc/misc.service';
import {
  createNotificationService,
  type NotificationService,
} from './modules/notification/notification.service';
import {
  createOnboardingService,
  type OnboardingService,
} from './modules/onboarding/onboarding.service';
import {
  createOrganizationService,
  type OrganizationService,
} from './modules/organization/organization.service';
import {
  createOverviewService,
  type OverviewService,
} from './modules/overview/overview.service';
import {
  createPagesService,
  type PagesService,
} from './modules/overview/pages.service';
import {
  createProfileService,
  type ProfileService,
} from './modules/profile/profile.service';
import {
  createProjectService,
  type ProjectService,
} from './modules/project/project.service';
import {
  createRealtimeService,
  type RealtimeService,
} from './modules/realtime/realtime.service';
import {
  createReferenceService,
  type ReferenceService,
} from './modules/reference/reference.service';
import {
  createReportService,
  type ReportService,
} from './modules/report/report.service';
import {
  createSaltService,
  type SaltService,
} from './modules/salt/salt.service';
import {
  createSessionService,
  type SessionService,
} from './modules/session/session.service';
import {
  createShareService,
  type ShareService,
} from './modules/share/share.service';
import {
  createSubscriptionService,
  type SubscriptionService,
} from './modules/subscription/subscription.service';
import {
  createUserService,
  type UserService,
} from './modules/user/user.service';

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
  auth: AuthService;
  insight: InsightService;
  gsc: GscService;
  cohort: CohortService;
  import: ImportService;
  ingest: IngestService;
  organization: OrganizationService;
  integration: IntegrationService;
  onboarding: OnboardingService;
  notification: NotificationService;
  session: SessionService;
  event: EventService;
  profile: ProfileService;
  group: GroupService;
  chart: ChartService;
  // One key per `*.service.ts` (M10-009): the chart module is four files
  // besides `chart.service.ts`, so each is bound here too. `chart` keeps the
  // composed facade its own callers already use — the factories build stateless
  // closures over `deps`, so binding a sub-module twice binds the same
  // functions, not a second piece of state.
  funnel: FunnelService;
  conversion: ConversionService;
  sankey: SankeyService;
  retention: RetentionService;
  overview: OverviewService;
  pages: PagesService;
  realtime: RealtimeService;
  misc: MiscService;
  report: ReportService;
  dashboard: DashboardService;
  export: ExportService;
  share: ShareService;
  reference: ReferenceService;
  client: ClientService;
  project: ProjectService;
  user: UserService;
  subscription: SubscriptionService;
  salt: SaltService;
  conversation: ConversationService;
  assistant: AssistantService;
  mcp: McpService;
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
