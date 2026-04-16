import type {
  IImportConfig,
  IIntegrationConfig,
  INotificationRuleConfig,
  IProjectFilters,
  IWidgetOptions,
  InsightPayload,
} from '@openpanel/validation';
import type {
  IClickhouseBotEvent,
  IClickhouseEvent,
} from './services/event.service';
import type { INotificationPayload } from './services/notification.service';
import type { IClickhouseProfile } from './services/profile.service';

declare global {
  namespace PrismaJson {
    type IPrismaImportConfig = IImportConfig;
    type IPrismaNotificationRuleConfig = INotificationRuleConfig;
    type IPrismaIntegrationConfig = IIntegrationConfig;
    type IPrismaNotificationPayload = INotificationPayload;
    type IPrismaProjectFilters = IProjectFilters[];
    type IPrismaProjectInsightPayload = InsightPayload;
    type IPrismaWidgetOptions = IWidgetOptions;
    type IPrismaClickhouseEvent = IClickhouseEvent;
    type IPrismaClickhouseProfile = IClickhouseProfile;
    type IPrismaClickhouseBotEvent = IClickhouseBotEvent;
    // Each ChatMessage row stores one Better Agent `ConversationItem`
    // (message, tool call, or tool result) as JSON. Typed as `unknown[]`
    // here to avoid pulling `@better-agent/core` into @openpanel/db's
    // dependency graph; the real shape is narrowed at the API boundary
    // in apps/api/src/agents/persistence.ts.
    type IPrismaUIMessageParts = unknown[];
    type IPrismaSubscriptionStatus =
      | 'incomplete'
      | 'incomplete_expired'
      | 'trialing'
      | 'active'
      | 'past_due'
      | 'canceled'
      | 'unpaid';
  }
}
