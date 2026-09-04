// The composition root (ADR-007 build step 4). `auth` is the first module to
// land here (M4-007); the Ctx <-> Services circularity was proven compiling
// before it with an empty interface.

import type { Ctx } from './context';
import {
  type AuthService,
  createAuthService,
} from './modules/auth/auth.service';
import {
  type ChartService,
  createChartService,
} from './modules/chart/chart.service';
import {
  type CohortService,
  createCohortService,
} from './modules/cohort/cohort.service';
import {
  createEventService,
  type EventService,
} from './modules/event/event.service';
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
  createProfileService,
  type ProfileService,
} from './modules/profile/profile.service';
import {
  createSessionService,
  type SessionService,
} from './modules/session/session.service';

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
  onboarding: OnboardingService;
  notification: NotificationService;
  session: SessionService;
  event: EventService;
  profile: ProfileService;
  group: GroupService;
  chart: ChartService;
  misc: MiscService;
}

export function createServices(deps: ServiceDeps): Services {
  // When a second module needs to call this one, each factory takes `deps`
  // and a `() => container` thunk: captured, not copied, so two services may
  // call each other without a cycle.
  return {
    auth: createAuthService(deps),
    insight: createInsightService(deps),
    gsc: createGscService(deps),
    cohort: createCohortService(deps),
    import: createImportService(deps),
    ingest: createIngestService(deps),
    organization: createOrganizationService(deps),
    onboarding: createOnboardingService(deps),
    notification: createNotificationService(deps),
    session: createSessionService(deps),
    event: createEventService(deps),
    profile: createProfileService(deps),
    group: createGroupService(deps),
    chart: createChartService(deps),
    misc: createMiscService(deps),
  };
}
