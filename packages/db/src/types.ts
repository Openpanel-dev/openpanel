// `@openpanel/db` takes a type-only `db -> core` dependency edge here,
// accepted deliberately: `@openpanel/db` already depends on `@openpanel/core`,
// the edge is `import type` only so it creates no runtime cycle, and it is
// the same shape as this repo's existing type-only `db -> queue` cycle.
import type {
  IClickhouseBotEvent,
  IClickhouseEvent,
  IClickhouseProfile,
  INotificationPayload,
} from '@openpanel/core';
import type { CohortDefinition } from '@openpanel/core/modules/cohort/cohort.constants';
import type { IImportConfig } from '@openpanel/core/modules/import/import.constants';
import type { InsightPayload } from '@openpanel/core/modules/insight/insight.constants';
import type { IIntegrationConfig } from '@openpanel/core/modules/integration/integration.constants';
import type { INotificationRuleConfig } from '@openpanel/core/modules/notification/notification.constants';
import type { IProjectAccessGrant } from '@openpanel/core/modules/organization/organization.constants';
import type { IProjectFilters } from '@openpanel/core/modules/project/project.constants';
import type { IWidgetOptions } from '@openpanel/core/modules/report/report.constants';

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
    // ingestion is rejected.
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
