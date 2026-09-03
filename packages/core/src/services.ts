// The composition root (ADR-007 build step 4). `auth` is the first module to
// land here (M4-007); the Ctx <-> Services circularity was proven compiling
// before it with an empty interface.

import type { Ctx } from './context';
import {
  type AuthService,
  createAuthService,
} from './modules/auth/auth.service';
import {
  type CohortService,
  createCohortService,
} from './modules/cohort/cohort.service';
import { createGscService, type GscService } from './modules/gsc/gsc.service';
import {
  createImportService,
  type ImportService,
} from './modules/import/import.service';
import {
  createInsightService,
  type InsightService,
} from './modules/insight/insight.service';
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
  organization: OrganizationService;
  onboarding: OnboardingService;
  notification: NotificationService;
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
    organization: createOrganizationService(deps),
    onboarding: createOnboardingService(deps),
    notification: createNotificationService(deps),
  };
}
