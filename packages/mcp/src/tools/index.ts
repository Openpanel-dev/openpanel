import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAuthContext } from '../auth';
import { registerActiveUserTools } from './analytics/active-users';
import { registerEngagementTools } from './analytics/engagement';
import { registerEventNameTools } from './analytics/event-names';
import { registerEventTools } from './analytics/events';
import { registerFunnelTools } from './analytics/funnel';
import { registerGroupTools } from './analytics/groups';
import { registerOverviewTools } from './analytics/overview';
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
import { registerGscCannibalizationTools } from './gsc/cannibalization';
import { registerGscOverviewTools } from './gsc/overview';
import { registerGscPageTools } from './gsc/pages';
import { registerGscQueryTools } from './gsc/queries';
import { registerDashboardLinkTools } from './dashboard-links';
import { registerProjectTools } from './projects';

export function registerAllTools(
  server: McpServer,
  context: McpAuthContext,
): void {
  // Project access — always call first to discover available projects
  registerProjectTools(server, context);
  registerDashboardLinkTools(server, context);
  registerReportTools(server, context);

  // Analytics — discovery (call these first to understand the data)
  registerEventNameTools(server, context);
  registerPropertyValueTools(server, context);

  // Analytics — event data
  registerEventTools(server, context);
  registerSessionTools(server, context);

  // Analytics — profiles
  registerProfileTools(server, context);
  registerProfileMetricTools(server, context);

  // Analytics — groups (B2B)
  registerGroupTools(server, context);

  // Analytics — aggregated metrics
  registerOverviewTools(server, context);
  registerActiveUserTools(server, context);
  registerPageTools(server, context);
  registerPagePerformanceTools(server, context);
  registerTrafficTools(server, context);

  // Analytics — user behavior
  registerFunnelTools(server, context);
  registerRetentionTools(server, context);
  registerEngagementTools(server, context);
  registerUserFlowTools(server, context);

  // Google Search Console
  registerGscOverviewTools(server, context);
  registerGscPageTools(server, context);
  registerGscQueryTools(server, context);
  registerGscCannibalizationTools(server, context);
}
