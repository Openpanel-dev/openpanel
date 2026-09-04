import { zChartEvent } from '@openpanel/core/modules/report/report.constants';
import { z } from 'zod';

// Moved into @openpanel/core's report module (M7-006, ADR-008's module map:
// report owns "C" for the chart/report/widget vocabulary). Re-exported here
// for existing @openpanel/validation importers (packages/trpc's chart/
// report/dashboard/widget routers, apps/start's report builder) — same
// shape as ./cohort.validation.ts's re-export since M5-003. `zChartEvent` is
// imported by name too (not just re-exported): `zProjectFilterEvent` below
// extends it as a bound identifier, which `export *` alone does not provide.
export * from '@openpanel/core/modules/report/report.constants';

/**
 * A per-project grant. `read` means exactly that: the member can look at the
 * project but no mutation will be accepted for it. `admin` is not offered here
 * - destructive operations hang off the organization role instead, so a third
 * project level would be a second way to say `write`.
 */
export const zProjectAccessGrant = z.object({
  projectId: z.string(),
  level: z.enum(['read', 'write']),
});
export type IProjectAccessGrant = z.infer<typeof zProjectAccessGrant>;

export const zInviteUser = z.object({
  email: z.string().email(),
  organizationId: z.string(),
  role: z.enum(['org:admin', 'org:member']),
  access: z.array(zProjectAccessGrant),
});

export const zUpdateMemberAccess = z.object({
  userId: z.string(),
  organizationId: z.string(),
  access: z.array(zProjectAccessGrant),
});

// Moved into @openpanel/core's share module (M6-004, ADR-008's module map:
// share owns "C"). Re-exported here for existing @openpanel/validation
// importers (packages/trpc's share router, apps/start's share modals) — same
// shape as ./onboarding.constants.ts re-export since M6-003.
export * from '@openpanel/core/modules/share/share.constants';

export const zCreateReference = z.object({
  title: z.string(),
  description: z.string().nullish(),
  projectId: z.string(),
  datetime: z.string(),
});

// Moved into @openpanel/core's integration module (M6-006, ADR-008's module
// map: integration owns "C"). Re-exported here for existing
// @openpanel/validation importers (packages/trpc's integration router,
// apps/start's integration forms) — same shape as ./onboarding.constants.ts
// re-export since M6-003. `zSlackAuthResponse` does NOT come along: it moved
// to the module's `src/` (Slack's own OAuth wire contract, not integration
// config) and is now reached through @openpanel/core's curated barrel
// instead — apps/api/src/controllers/webhook.controller.ts (the one former
// importer) updated to match.
export * from '@openpanel/core/modules/integration/integration.constants';
// Moved into @openpanel/core's notification module (M6-005, ADR-008's module
// map: notification owns "C"). Re-exported here for existing
// @openpanel/validation importers (packages/trpc's notification router,
// apps/start's notification rule form) — same shape as
// ./onboarding.constants.ts re-export since M6-003. `zChartEvent` (used
// above, and by notification.constants.ts itself) is imported earlier in
// this file from core's report.constants.ts (M7-006), so the resulting
// module cycle resolves at the value level: see notification.constants.ts's
// header.
export * from '@openpanel/core/modules/notification/notification.constants';
// Moved into @openpanel/core's onboarding module (M6-003, ADR-008's module
// map: onboarding owns "C"). Re-exported here for existing
// @openpanel/validation importers (packages/trpc's onboarding/project
// routers, apps/start's onboarding flow) — same shape as
// ./cohort.validation.ts since M5-003.
export * from '@openpanel/core/modules/onboarding/onboarding.constants';

export const zProjectFilterIp = z.object({
  type: z.literal('ip'),
  ip: z.string(),
});
export type IProjectFilterIp = z.infer<typeof zProjectFilterIp>;

export const zProjectFilterProfileId = z.object({
  type: z.literal('profile_id'),
  profileId: z.string(),
});
export type IProjectFilterProfileId = z.infer<typeof zProjectFilterProfileId>;

export const zProjectFilterEvent = zChartEvent.extend({
  type: z.literal('event'),
});
export type IProjectFilterEvent = z.infer<typeof zProjectFilterEvent>;

export const zProjectFilters = z.discriminatedUnion('type', [
  zProjectFilterIp,
  zProjectFilterProfileId,
  zProjectFilterEvent,
]);
export type IProjectFilters = z.infer<typeof zProjectFilters>;

export const zProject = z.object({
  id: z.string(),
  name: z.string().min(1),
  filters: z.array(zProjectFilters).default([]),
  domain: z.string().url().or(z.literal('').or(z.null())),
  cors: z.array(z.string()).default([]),
  crossDomain: z.boolean().default(false),
  allowUnsafeRevenueTracking: z.boolean().default(false),
});
export type IProjectEdit = z.infer<typeof zProject>;

export const zProjectUpdate = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  filters: z.array(zProjectFilters).optional(),
  domain: z.string().url().or(z.literal('').or(z.null())).optional(),
  cors: z.array(z.string()).optional(),
  crossDomain: z.boolean().optional(),
  allowUnsafeRevenueTracking: z.boolean().optional(),
});
export type IProjectUpdate = z.infer<typeof zProjectUpdate>;

// Moved into @openpanel/core's auth module (M6-003, ADR-008's module map:
// auth owns "C"). Re-exported here for existing @openpanel/validation
// importers (packages/trpc's auth router, apps/start's sign-in/sign-up
// forms) — same shape as ./cohort.validation.ts since M5-003.
export * from '@openpanel/core/modules/auth/auth.constants';
// Moved into @openpanel/core's group module (M7-002, ADR-008's module map:
// group owns "C"). Re-exported here for existing @openpanel/validation
// importers (packages/trpc's group router, apps/start's add-group /
// edit-group modals) — same shape as the subscription re-export above.
export * from '@openpanel/core/modules/group/group.constants';
// Moved into @openpanel/core's subscription module (M6-006, ADR-008's module
// map: subscription owns "C"). Re-exported here for existing
// @openpanel/validation importers (packages/trpc's subscription router,
// apps/start's billing forms) — same shape as ./onboarding.constants.ts
// re-export since M6-003.
export * from '@openpanel/core/modules/subscription/subscription.constants';

export const zEditOrganization = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
  timezone: z.string().min(1),
});

export * from './chat';
export * from './cohort.validation';
export * from './import.validation';
export * from './track.validation';
export * from './types.insights';
export * from './types.validation';
