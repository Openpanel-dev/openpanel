import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerActiveUserTools } from './analytics/active-users';
import { registerEngagementTools } from './analytics/engagement';
import { registerEventNameTools } from './analytics/event-names';
import { registerEventTools } from './analytics/events';
import { registerFunnelTools } from './analytics/funnel';
import { registerGroupTools } from './analytics/groups';
import { registerOverviewTools } from './analytics/overview';
import { registerPageConversionTools } from './analytics/page-conversions';
import { registerPagePerformanceTools } from './analytics/page-performance';
import { registerPageTools } from './analytics/pages';
import { registerProfileMetricTools } from './analytics/profile-metrics';
import { registerProfileTools } from './analytics/profiles';
import { registerPropertyValueTools } from './analytics/property-values';
import { registerReportTools } from './analytics/reports';
import { registerRetentionTools } from './analytics/retention';
import { registerSessionTools } from './analytics/sessions';
import { registerTrafficTools } from './analytics/traffic';
import { registerUserFlowTools } from './analytics/user-flow';
import { registerDashboardLinkTools } from './dashboard-links';
import { registerDashboardManagementTools } from './dashboard-management';
import { registerGscCannibalizationTools } from './gsc/cannibalization';
import { registerGscOverviewTools } from './gsc/overview';
import { registerGscPageTools } from './gsc/pages';
import { registerGscQueryTools } from './gsc/queries';
import { registerProjectTools } from './projects';
import type { McpToolDeps } from './shared';

export function registerAllTools(server: McpServer, tools: McpToolDeps): void {
  // Project access — always call first to discover available projects
  registerProjectTools(server, tools);
  registerDashboardLinkTools(server, tools);
  registerDashboardManagementTools(server, tools);
  registerReportTools(server, tools);

  // Analytics — discovery (call these first to understand the data)
  registerEventNameTools(server, tools);
  registerPropertyValueTools(server, tools);

  // Analytics — event data
  registerEventTools(server, tools);
  registerSessionTools(server, tools);

  // Analytics — profiles
  registerProfileTools(server, tools);
  registerProfileMetricTools(server, tools);

  // Analytics — groups (B2B)
  registerGroupTools(server, tools);

  // Analytics — aggregated metrics
  registerOverviewTools(server, tools);
  registerActiveUserTools(server, tools);
  registerPageTools(server, tools);
  registerPagePerformanceTools(server, tools);
  registerPageConversionTools(server, tools);
  registerTrafficTools(server, tools);

  // Analytics — user behavior
  registerFunnelTools(server, tools);
  registerRetentionTools(server, tools);
  registerEngagementTools(server, tools);
  registerUserFlowTools(server, tools);

  // Google Search Console
  registerGscOverviewTools(server, tools);
  registerGscPageTools(server, tools);
  registerGscQueryTools(server, tools);
  registerGscCannibalizationTools(server, tools);
}
