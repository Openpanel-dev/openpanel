import type {
  CohortDefinition,
  IImportConfig,
  IProjectAccessGrant,
  IIntegrationConfig,
  INotificationRuleConfig,
  IProjectFilters,
  IWidgetOptions,
  InsightPayload,
} from '@openpanel/validation';
// `IClickhouseEvent`/`IClickhouseBotEvent`/`IClickhouseProfile`/
// `INotificationPayload` all moved to @openpanel/core (M9-CLEANUP-001,
// packages/db's final-surface shrink) — the three local re-export shims that
// used to bridge them are gone. This is the type-only `db -> core` back-edge
// ADR-007 named and explicitly declined to resolve ("belongs to P8's db
// slim-down"; three options, none picked). Taken here: option 3, "accept a
// declared type-only devDependency edge" — `@openpanel/db` already depends on
// `@openpanel/core` (these shims were the reason), the edge is `import type`
// only so it creates no runtime cycle, and it is the same shape as this
// repo's existing type-only `db -> queue` cycle. Revisit if a future task
// picks a different one of the three named resolutions.
import type {
  IClickhouseBotEvent,
  IClickhouseEvent,
  IClickhouseProfile,
  INotificationPayload,
} from '@openpanel/core';

declare global {
  namespace PrismaJson {
    type IPrismaImportConfig = IImportConfig;
    type IPrismaNotificationRuleConfig = INotificationRuleConfig;
    type IPrismaIntegrationConfig = IIntegrationConfig;
    type IPrismaNotificationPayload = INotificationPayload;
    type IPrismaProjectFilters = IProjectFilters[];
    type IPrismaInviteProjectAccess = IProjectAccessGrant[];
    type IPrismaProjectInsightPayload = InsightPayload;
    type IPrismaWidgetOptions = IWidgetOptions;
    type IPrismaClickhouseEvent = IClickhouseEvent;
    type IPrismaClickhouseProfile = IClickhouseProfile;
    type IPrismaClickhouseBotEvent = IClickhouseBotEvent;
    type IPrismaCohortDefinition = CohortDefinition;
    // Each ChatMessage row stores one Better Agent `ConversationItem`
    // (message, tool call, or tool result) as JSON. Typed as `unknown[]`
    // here to avoid pulling `@better-agent/core` into @openpanel/db's
    // dependency graph; the real shape is narrowed at the API boundary
    // in packages/core/src/modules/assistant/src/persistence.ts.
    type IPrismaUIMessageParts = unknown[];
    type IPrismaSubscriptionStatus =
      | 'incomplete'
      | 'incomplete_expired'
      | 'trialing'
      | 'active'
      | 'past_due'
      | 'canceled'
      | 'unpaid'
      | 'paused';
    // Compact summary of the discount applied to the subscription, synced
    // from Polar's embedded discount object so the dashboard can show it.
    type IPrismaSubscriptionDiscount = {
      id: string;
      name: string;
      type: 'percentage' | 'fixed';
      // Set for percentage discounts (3000 = 30%).
      basisPoints: number | null;
      // Set for fixed discounts (minor units + currency).
      amount: number | null;
      currency: string | null;
      duration: 'once' | 'forever' | 'repeating';
      durationInMonths: number | null;
    };
    // Steps of the wind-down sequence, in order. The column stores the last
    // step whose email was sent; `blocked` and `final_warning` also mean
    // ingestion is rejected. See apps/worker/src/jobs/cron.wind-down.ts.
    type IPrismaWindDownStep =
      | 'expired_notice'
      | 'stopping_soon'
      | 'blocked'
      | 'final_warning';
    // Mirrors Polar's CustomerCancellationReason enum.
    type IPrismaCancellationReason =
      | 'too_expensive'
      | 'missing_features'
      | 'switched_service'
      | 'unused'
      | 'customer_service'
      | 'low_quality'
      | 'too_complex'
      | 'other';
  }
}
