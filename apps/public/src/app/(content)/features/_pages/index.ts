import { AiObservabilityPage } from './ai-observability';
import { ConversionPage } from './conversion';
import { DataVisualizationPage } from './data-visualization';
import { EventTrackingPage } from './event-tracking';
import { FunnelsPage } from './funnels';
import { IdentifyUsersPage } from './identify-users';
import { IntegrationsPage } from './integrations';
import { McpPage } from './mcp';
import { NotificationsPage } from './notifications';
import { RetentionPage } from './retention';
import { RevenueTrackingPage } from './revenue-tracking';
import { SessionReplayPage } from './session-replay';
import { SessionTrackingPage } from './session-tracking';
import { ShareAndCollaboratePage } from './share-and-collaborate';
import type { FeaturePage } from './shared';
import { WebAnalyticsPage } from './web-analytics';

// One composition per content/features/<slug>.json. A slug without a page
// here, or a page without a JSON, is a build error on purpose.
export const FEATURE_PAGES = {
  'ai-observability': AiObservabilityPage,
  conversion: ConversionPage,
  'data-visualization': DataVisualizationPage,
  'event-tracking': EventTrackingPage,
  funnels: FunnelsPage,
  'identify-users': IdentifyUsersPage,
  integrations: IntegrationsPage,
  mcp: McpPage,
  notifications: NotificationsPage,
  retention: RetentionPage,
  'revenue-tracking': RevenueTrackingPage,
  'session-replay': SessionReplayPage,
  'session-tracking': SessionTrackingPage,
  'share-and-collaborate': ShareAndCollaboratePage,
  'web-analytics': WebAnalyticsPage,
} satisfies Record<string, FeaturePage>;

export type FeatureSlug = keyof typeof FEATURE_PAGES;

export function isFeatureSlug(slug: string): slug is FeatureSlug {
  return Object.hasOwn(FEATURE_PAGES, slug);
}
