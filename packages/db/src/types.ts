import type {
  IIntegrationConfig,
  INotificationRuleConfig,
} from '@openpanel/validation';
import type { INotificationPayload } from './services/notification.service';

declare global {
  namespace PrismaJson {
    type IPrismaNotificationRuleConfig = INotificationRuleConfig;
    type IPrismaIntegrationConfig = IIntegrationConfig;
    type IPrismaNotificationPayload = INotificationPayload;
  }
}
