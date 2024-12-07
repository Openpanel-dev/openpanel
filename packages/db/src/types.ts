import type {
  IIntegrationConfig,
  INotificationRuleConfig,
  IProjectFilters,
} from '@openpanel/validation';
import type { INotificationPayload } from './services/notification.service';

declare global {
  namespace PrismaJson {
    type IPrismaNotificationRuleConfig = INotificationRuleConfig;
    type IPrismaIntegrationConfig = IIntegrationConfig;
    type IPrismaNotificationPayload = INotificationPayload;
    type IPrismaProjectFilters = IProjectFilters[];
  }
}
