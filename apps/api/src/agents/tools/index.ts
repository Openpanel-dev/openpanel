import type { AgentToolDefinition } from '@better-agent/core';
import type { ChatAgentContext } from '../context';
import * as base from './base';
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

// Tool arrays are typed loosely as `AgentToolDefinition[]` — without
// this, TypeScript tries to compute the union of every tool's schema +
// result type and hits its instantiation depth limit.
type ToolList = AgentToolDefinition[];

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
] as AgentToolDefinition[];

const PROFILE_TOOLS: ToolList = [
  profile.getProfileFull,
  profile.getProfileEvents,
  profile.getProfileSessions,
  profile.getProfileMetrics,
  profile.getProfileJourney,
  profile.getProfileGroups,
  profile.compareProfileToAverage,
] as AgentToolDefinition[];

const SESSION_TOOLS: ToolList = [
  session.getSessionFull,
  session.getSessionPath,
  session.getSessionEvents,
  session.getSimilarSessions,
  session.compareSessionToTypical,
  session.getSessionReferrerContext,
  session.getSessionReplaySummary,
] as AgentToolDefinition[];

const REPORT_EDITOR_TOOLS: ToolList = [
  report.previewReportWithChanges,
  report.suggestBreakdowns,
  report.compareToPreviousPeriod,
  report.findAnomaliesInCurrentReport,
  report.explainFilterImpact,
] as AgentToolDefinition[];

const PAGES_TOOLS: ToolList = [
  pages.getPagePerformance,
  pages.getPageConversions,
  pages.getEntryExitPages,
  pages.findDecliningPages,
] as AgentToolDefinition[];

const SEO_TOOLS: ToolList = [
  seo.gscGetOverview,
  seo.gscGetTopQueries,
  seo.gscGetTopPages,
  seo.gscGetQueryDetails,
  seo.gscGetPageDetails,
  seo.gscGetQueryOpportunities,
  seo.gscGetCannibalization,
  seo.correlateSeoWithTraffic,
] as AgentToolDefinition[];

const EVENTS_TOOLS: ToolList = [
  events.analyzeEventDistribution,
  events.correlateEvents,
  events.getEventPropertyDistribution,
  events.listPropertiesForEvent,
] as AgentToolDefinition[];

const INSIGHTS_TOOLS: ToolList = [
  insights.listInsights,
  insights.explainInsight,
  insights.findRelatedInsights,
] as AgentToolDefinition[];

const GROUP_TOOLS: ToolList = [
  groups.getGroupFull,
  groups.getGroupMembers,
  groups.getGroupEvents,
  groups.getGroupMetrics,
  groups.compareGroups,
] as AgentToolDefinition[];

// Client-side UI mutators. Available on pages that have user-
// settable filters (date range, event names, property filters) so
// the assistant can act on requests like "filter to last 7 days",
// "show me only signups", or "referrers from GitHub" instead of
// just describing data.
const UI_TOOLS: ToolList = [
  ui.applyFilters,
  ui.setEventNamesFilter,
  ui.setPropertyFilters,
] as AgentToolDefinition[];

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
export function composeChatTools(context: ChatAgentContext) {
  const page = context.pageContext?.page;
  const ids = context.pageContext?.ids;

  switch (page) {
    case 'profileDetail':
      return ids?.profileId
        ? [...BASE_TOOLS, ...PROFILE_TOOLS, ...UI_TOOLS]
        : [...BASE_TOOLS, ...UI_TOOLS];
    case 'sessionDetail':
      return ids?.sessionId ? [...BASE_TOOLS, ...SESSION_TOOLS] : BASE_TOOLS;
    case 'reportEditor':
      return context.pageContext?.reportDraft
        ? [...BASE_TOOLS, ...REPORT_EDITOR_TOOLS]
        : BASE_TOOLS;
    case 'pages':
      return [...BASE_TOOLS, ...PAGES_TOOLS, ...UI_TOOLS];
    case 'seo':
      return [...BASE_TOOLS, ...SEO_TOOLS, ...UI_TOOLS];
    case 'events':
      return [...BASE_TOOLS, ...EVENTS_TOOLS, ...UI_TOOLS];
    case 'insights':
      return [...BASE_TOOLS, ...INSIGHTS_TOOLS, ...UI_TOOLS];
    case 'groupDetail':
      return ids?.groupId ? [...BASE_TOOLS, ...GROUP_TOOLS] : BASE_TOOLS;
    case 'overview':
      return [...BASE_TOOLS, ...UI_TOOLS];
    default:
      return BASE_TOOLS;
  }
}
