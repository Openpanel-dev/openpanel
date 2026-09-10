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

// A tool is BUILT per unit of work, from the `deps` the route already holds:
// `@better-agent/core`'s tool-handler signature has no context parameter, so
// each handler closes over them instead (ADR-022 R6/R15). The lists are typed
// loosely as `(deps) => AgentToolDefinition` — without the cast, TypeScript
// tries to compute the union of every tool's schema + result type and hits
// its instantiation depth limit.
type ToolFactory = (deps: ServiceDeps) => AgentToolDefinition;
type ToolList = ToolFactory[];

/**
 * Always-available base tool set: discovery + saved reports + aggregate
 * analytics + free-form queries. Every chat session starts here.
 */
const BASE_TOOLS: ToolList = [
  // Discovery
  base.listEventNames,
  base.listEventProperties,
  base.getEventPropertyValues,
  // Saved dashboards & reports
  base.listDashboards,
  base.listReports,
  base.getReportData,
  base.generateReport,
  // Aggregate analytics
  base.getAnalyticsOverview,
  base.getTopPages,
  base.getTopReferrers,
  base.getCountryBreakdown,
  base.getDeviceBreakdown,
  base.getRollingActiveUsers,
  base.getFunnel,
  base.getRetentionCohort,
  base.getUserFlow,
  // Free-form queries
  base.queryEvents,
  base.querySessions,
  base.findProfiles,
  // References — manual annotations the user adds for real-world
  // events (campaigns, deploys, announcements). Available everywhere
  // because "what happened around X?" is a useful question on
  // every page, not just the overview.
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

// No property-listing tool here on purpose: `base.listEventProperties` is in
// BASE_TOOLS, so it is already registered on this page. `list_properties_for_event`
// was a second wire name over the same handler, and the events page offered the
// model both at once.
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

// Client-side UI mutators. Available on pages that have user-
// settable filters (date range, event names, property filters) so
// the assistant can act on requests like "filter to last 7 days",
// "show me only signups", or "referrers from GitHub" instead of
// just describing data.
const UI_TOOLS: ToolList = [
  ui.applyFilters,
  ui.setEventNamesFilter,
  ui.setPropertyFilters,
] as ToolList;

/**
 * Compose the chat tool set for a given request. Base tools are always
 * present; page-specific tools layer on top.
 *
 * Page-specific tools are only included when the corresponding entity
 * id is present in pageContext (e.g. profile tools require profileId),
 * so the LLM doesn't see tools it can't usefully call.
 *
 * The LLM sees fewer-but-more-focused tools per page, which produces
 * better tool selection than one giant flat registry.
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
