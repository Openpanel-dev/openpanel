import type { AgentToolDefinition } from '@better-agent/core';
import type { ServiceDeps } from '../../../../services';
import type { ChatAgentContext } from '../context';
import * as base from './base';
import * as dashboard from './dashboard';
import * as events from './events';
import * as groups from './groups';
import * as insights from './insights';
import * as pages from './pages';
import * as profile from './profile';
import * as references from './references';
import * as report from './report';
import * as seo from './seo';
import * as session from './session';
import * as ui from './ui';

// `@better-agent/core`'s tool handler signature has no context parameter, so
// handlers close over `deps`. Lists are typed loosely: without the cast,
// TypeScript hits its instantiation depth limit computing the union of every
// tool's schema and result type.
type ToolFactory = (deps: ServiceDeps) => AgentToolDefinition;
type ToolList = ToolFactory[];

const BASE_TOOLS: ToolList = [
  base.listEventNames,
  base.listEventProperties,
  base.getEventPropertyValues,
  base.listDashboards,
  base.listReports,
  base.getReportData,
  base.generateReport,
  base.getAnalyticsOverview,
  base.getTopPages,
  base.getTopReferrers,
  base.getCountryBreakdown,
  base.getDeviceBreakdown,
  base.getRollingActiveUsers,
  base.getFunnel,
  base.getRetentionCohort,
  base.getUserFlow,
  base.queryEvents,
  base.querySessions,
  base.findProfiles,
  // Available on every page: "what happened around X?" is not overview-specific.
  references.listReferences,
  references.getReferencesAround,
] as ToolList;

const PROFILE_TOOLS: ToolList = [
  profile.getProfileFull,
  profile.getProfileEvents,
  profile.getProfileSessions,
  profile.getProfileMetrics,
  profile.getProfileJourney,
  profile.getProfileGroups,
  profile.compareProfileToAverage,
] as ToolList;

const SESSION_TOOLS: ToolList = [
  session.getSessionFull,
  session.getSessionPath,
  session.getSessionEvents,
  session.getSimilarSessions,
  session.compareSessionToTypical,
  session.getSessionReferrerContext,
  session.getSessionReplaySummary,
] as ToolList;

const REPORT_EDITOR_TOOLS: ToolList = [
  report.previewReportWithChanges,
  report.suggestBreakdowns,
  report.compareToPreviousPeriod,
  report.findAnomaliesInCurrentReport,
  report.explainFilterImpact,
] as ToolList;

const PAGES_TOOLS: ToolList = [
  pages.getPagePerformance,
  pages.getPageConversions,
  pages.getEntryExitPages,
  pages.findDecliningPages,
] as ToolList;

const SEO_TOOLS: ToolList = [
  seo.gscGetOverview,
  seo.gscGetTopQueries,
  seo.gscGetTopPages,
  seo.gscGetQueryDetails,
  seo.gscGetPageDetails,
  seo.gscGetQueryOpportunities,
  seo.gscGetCannibalization,
  seo.correlateSeoWithTraffic,
] as ToolList;

// No property-listing tool here: `base.listEventProperties` is already in BASE_TOOLS.
const EVENTS_TOOLS: ToolList = [
  events.analyzeEventDistribution,
  events.correlateEvents,
  events.getEventPropertyDistribution,
] as ToolList;

const INSIGHTS_TOOLS: ToolList = [
  insights.listInsights,
  insights.explainInsight,
  insights.findRelatedInsights,
] as ToolList;

const GROUP_TOOLS: ToolList = [
  groups.getGroupFull,
  groups.getGroupMembers,
  groups.getGroupEvents,
  groups.getGroupMetrics,
  groups.compareGroups,
] as ToolList;

const DASHBOARD_TOOLS: ToolList = [dashboard.summarizeDashboard] as ToolList;

// Client-side UI mutators, for pages with user-settable filters.
const UI_TOOLS: ToolList = [
  ui.applyFilters,
  ui.setEventNamesFilter,
  ui.setPropertyFilters,
] as ToolList;

/**
 * Compose the chat tool set for a request: base tools always, page-specific
 * tools only when their entity id is in pageContext, so the model is not
 * offered tools it cannot usefully call.
 */
export function composeChatTools(
  deps: ServiceDeps,
  context: ChatAgentContext
): AgentToolDefinition[] {
  const page = context.pageContext?.page;
  const ids = context.pageContext?.ids;
  const build = (...groups: ToolList[]): AgentToolDefinition[] =>
    groups.flat().map((tool) => tool(deps));

  switch (page) {
    case 'profileDetail':
      return ids?.profileId
        ? build(BASE_TOOLS, PROFILE_TOOLS, UI_TOOLS)
        : build(BASE_TOOLS, UI_TOOLS);
    case 'sessionDetail':
      return ids?.sessionId
        ? build(BASE_TOOLS, SESSION_TOOLS)
        : build(BASE_TOOLS);
    case 'reportEditor':
      return context.pageContext?.reportDraft
        ? build(BASE_TOOLS, REPORT_EDITOR_TOOLS)
        : build(BASE_TOOLS);
    case 'pages':
      return build(BASE_TOOLS, PAGES_TOOLS, UI_TOOLS);
    case 'seo':
      return build(BASE_TOOLS, SEO_TOOLS, UI_TOOLS);
    case 'events':
      return build(BASE_TOOLS, EVENTS_TOOLS, UI_TOOLS);
    case 'insights':
      return build(BASE_TOOLS, INSIGHTS_TOOLS, UI_TOOLS);
    case 'groupDetail':
      return ids?.groupId ? build(BASE_TOOLS, GROUP_TOOLS) : build(BASE_TOOLS);
    case 'dashboard':
      return ids?.dashboardId
        ? build(BASE_TOOLS, DASHBOARD_TOOLS, UI_TOOLS)
        : build(BASE_TOOLS, UI_TOOLS);
    case 'overview':
      return build(BASE_TOOLS, UI_TOOLS);
    default:
      return build(BASE_TOOLS);
  }
}
