import type { FC } from 'react';
import { ChatMetricsResult } from './chat-metrics-result';
import { ChatProfileFullResult } from './chat-profile-result';
import { ChatReportResult } from './chat-report-result';
import { ChatTableResult } from './chat-table-result';
import {
  ApplyFiltersResult,
  SetEventNamesFilterResult,
  SetPropertyFiltersResult,
} from './chat-ui-apply-result';
import { DefaultToolResult } from './default-tool-result';
import type { ToolResultProps } from './types';

/**
 * Map of tool-${toolName} → renderer. Anything not in this map falls
 * through to `DefaultToolResult` which renders an auto-inferred summary.
 *
 * Adding a new backend tool does NOT require touching this map — it'll
 * still render usefully via the default. Only add an entry here if you
 * want a custom UI.
 */
export const chatToolRenderers: Record<string, FC<ToolResultProps>> = {
  // Reports — these all return { chartType, report, data, ... }
  'tool-get_report_data': ChatReportResult,
  'tool-generate_report': ChatReportResult,
  'tool-preview_report_with_changes': ChatReportResult,
  'tool-get_rolling_active_users': ChatReportResult,
  'tool-get_funnel': ChatReportResult,

  // Metric cards
  'tool-get_analytics_overview': ChatMetricsResult,
  'tool-get_profile_metrics': ChatMetricsResult,

  // Compact tables for breakdowns / lists
  'tool-get_top_pages': ChatTableResult,
  'tool-get_top_referrers': ChatTableResult,
  'tool-get_country_breakdown': ChatTableResult,
  'tool-get_device_breakdown': ChatTableResult,
  'tool-get_entry_exit_pages': ChatTableResult,
  'tool-find_declining_pages': ChatTableResult,
  'tool-find_profiles': ChatTableResult,
  'tool-query_events': ChatTableResult,
  'tool-query_sessions': ChatTableResult,
  'tool-list_event_names': ChatTableResult,
  'tool-list_event_properties': ChatTableResult,
  'tool-list_dashboards': ChatTableResult,
  'tool-list_reports': ChatTableResult,
  'tool-list_insights': ChatTableResult,
  'tool-gsc_get_top_queries': ChatTableResult,
  'tool-gsc_get_top_pages': ChatTableResult,
  'tool-gsc_get_query_opportunities': ChatTableResult,
  'tool-correlate_seo_with_traffic': ChatTableResult,
  'tool-list_references': ChatTableResult,

  // Profile detail
  'tool-get_profile_full': ChatProfileFullResult,

  // Client-side UI mutators — render a "done" chip regardless of
  // state (no async work to shimmer for).
  'tool-apply_filters': ApplyFiltersResult,
  'tool-set_property_filters': SetPropertyFiltersResult,
  'tool-set_event_names_filter': SetEventNamesFilterResult,
};

export { DefaultToolResult } from './default-tool-result';
