import type {
  IIntegrationConfig,
  INotificationRuleConfig,
  IProjectFilters,
} from '@openpanel/validation';
import type {
  IClickhouseBotEvent,
  IClickhouseEvent,
} from './services/event.service';
import type { INotificationPayload } from './services/notification.service';
import type { IClickhouseProfile } from './services/profile.service';

declare global {
  namespace PrismaJson {
    type IPrismaNotificationRuleConfig = INotificationRuleConfig;
    type IPrismaIntegrationConfig = IIntegrationConfig;
    type IPrismaNotificationPayload = INotificationPayload;
    type IPrismaProjectFilters = IProjectFilters[];
    type IPrismaClickhouseEvent = IClickhouseEvent;
    type IPrismaClickhouseProfile = IClickhouseProfile;
    type IPrismaClickhouseBotEvent = IClickhouseBotEvent;
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
