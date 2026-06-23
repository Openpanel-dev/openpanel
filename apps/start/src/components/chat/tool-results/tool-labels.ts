/**
 * Humanizes raw tool names into action-phrase labels for the UI.
 *
 * Each tool gets a tuple: (verb-form for in-progress, noun-form for
 * completed). E.g.
 *   list_event_names -> ["Looking up event names", "Event names"]
 *
 * Falls back to a generic transformation when a tool isn't in the
 * map: snake_case -> "Snake case", with verb-prefix heuristics
 * ("get_" -> "Loading", "list_" -> "Looking up", "find_" -> "Finding").
 */

const VERB_PREFIXES = [
  ['list_', 'chat.tool_fallback_verb_list', 'Looking up'],
  ['get_', 'chat.tool_fallback_verb_get', 'Loading'],
  ['find_', 'chat.tool_fallback_verb_find', 'Finding'],
  ['query_', 'chat.tool_fallback_verb_query', 'Querying'],
  ['analyze_', 'chat.tool_fallback_verb_analyze', 'Analyzing'],
  ['compare_', 'chat.tool_fallback_verb_compare', 'Comparing'],
  ['correlate_', 'chat.tool_fallback_verb_correlate', 'Correlating'],
  ['explain_', 'chat.tool_fallback_verb_explain', 'Explaining'],
  ['suggest_', 'chat.tool_fallback_verb_suggest', 'Suggesting'],
  ['preview_', 'chat.tool_fallback_verb_preview', 'Previewing'],
  ['generate_', 'chat.tool_fallback_verb_generate', 'Generating'],
  ['apply_', 'chat.tool_fallback_verb_apply', 'Applying'],
  ['set_', 'chat.tool_fallback_verb_set', 'Updating'],
  ['gsc_', 'chat.tool_fallback_verb_gsc', 'Loading SEO'],
] as const;

const PHRASES = {
  // Discovery
  list_event_names: {
    active: {
      key: 'chat.tool_list_event_names_active',
      fallback: 'Looking up event names',
    },
    done: {
      key: 'chat.tool_list_event_names_done',
      fallback: 'Event names',
    },
  },
  list_event_properties: {
    active: {
      key: 'chat.tool_list_event_properties_active',
      fallback: 'Looking up properties',
    },
    done: {
      key: 'chat.tool_list_event_properties_done',
      fallback: 'Event properties',
    },
  },
  get_event_property_values: {
    active: {
      key: 'chat.tool_get_event_property_values_active',
      fallback: 'Loading property values',
    },
    done: {
      key: 'chat.tool_get_event_property_values_done',
      fallback: 'Property values',
    },
  },

  // Saved reports & dashboards
  list_dashboards: {
    active: {
      key: 'chat.tool_list_dashboards_active',
      fallback: 'Loading dashboards',
    },
    done: {
      key: 'chat.tool_list_dashboards_done',
      fallback: 'Dashboards',
    },
  },
  list_reports: {
    active: {
      key: 'chat.tool_list_reports_active',
      fallback: 'Loading reports',
    },
    done: {
      key: 'chat.tool_list_reports_done',
      fallback: 'Reports',
    },
  },
  get_report_data: {
    active: {
      key: 'chat.tool_get_report_data_active',
      fallback: 'Running report',
    },
    done: {
      key: 'chat.tool_get_report_data_done',
      fallback: 'Report',
    },
  },
  generate_report: {
    active: {
      key: 'chat.tool_generate_report_active',
      fallback: 'Building report',
    },
    done: {
      key: 'chat.tool_generate_report_done',
      fallback: 'Report',
    },
  },

  // Aggregate analytics
  get_analytics_overview: {
    active: {
      key: 'chat.tool_get_analytics_overview_active',
      fallback: 'Loading overview',
    },
    done: {
      key: 'chat.tool_get_analytics_overview_done',
      fallback: 'Overview',
    },
  },
  get_top_pages: {
    active: {
      key: 'chat.tool_get_top_pages_active',
      fallback: 'Loading top pages',
    },
    done: {
      key: 'chat.tool_get_top_pages_done',
      fallback: 'Top pages',
    },
  },
  get_top_referrers: {
    active: {
      key: 'chat.tool_get_top_referrers_active',
      fallback: 'Loading top referrers',
    },
    done: {
      key: 'chat.tool_get_top_referrers_done',
      fallback: 'Top referrers',
    },
  },
  get_country_breakdown: {
    active: {
      key: 'chat.tool_get_country_breakdown_active',
      fallback: 'Loading geo breakdown',
    },
    done: {
      key: 'chat.tool_get_country_breakdown_done',
      fallback: 'Geo breakdown',
    },
  },
  get_device_breakdown: {
    active: {
      key: 'chat.tool_get_device_breakdown_active',
      fallback: 'Loading device breakdown',
    },
    done: {
      key: 'chat.tool_get_device_breakdown_done',
      fallback: 'Device breakdown',
    },
  },
  get_rolling_active_users: {
    active: {
      key: 'chat.tool_get_rolling_active_users_active',
      fallback: 'Loading active users',
    },
    done: {
      key: 'chat.tool_get_rolling_active_users_done',
      fallback: 'Active users',
    },
  },
  get_funnel: {
    active: {
      key: 'chat.tool_get_funnel_active',
      fallback: 'Building funnel',
    },
    done: {
      key: 'chat.tool_get_funnel_done',
      fallback: 'Funnel',
    },
  },
  get_retention_cohort: {
    active: {
      key: 'chat.tool_get_retention_cohort_active',
      fallback: 'Building retention cohort',
    },
    done: {
      key: 'chat.tool_get_retention_cohort_done',
      fallback: 'Retention',
    },
  },
  get_user_flow: {
    active: {
      key: 'chat.tool_get_user_flow_active',
      fallback: 'Building user flow',
    },
    done: {
      key: 'chat.tool_get_user_flow_done',
      fallback: 'User flow',
    },
  },

  // Free-form
  query_events: {
    active: {
      key: 'chat.tool_query_events_active',
      fallback: 'Querying events',
    },
    done: {
      key: 'chat.tool_query_events_done',
      fallback: 'Events',
    },
  },
  query_sessions: {
    active: {
      key: 'chat.tool_query_sessions_active',
      fallback: 'Querying sessions',
    },
    done: {
      key: 'chat.tool_query_sessions_done',
      fallback: 'Sessions',
    },
  },
  find_profiles: {
    active: {
      key: 'chat.tool_find_profiles_active',
      fallback: 'Finding profiles',
    },
    done: {
      key: 'chat.tool_find_profiles_done',
      fallback: 'Profiles',
    },
  },

  // Profile
  get_profile_full: {
    active: {
      key: 'chat.tool_get_profile_full_active',
      fallback: 'Loading profile',
    },
    done: {
      key: 'chat.tool_get_profile_full_done',
      fallback: 'Profile',
    },
  },
  get_profile_events: {
    active: {
      key: 'chat.tool_get_profile_events_active',
      fallback: 'Loading profile events',
    },
    done: {
      key: 'chat.tool_get_profile_events_done',
      fallback: 'Profile events',
    },
  },
  get_profile_sessions: {
    active: {
      key: 'chat.tool_get_profile_sessions_active',
      fallback: 'Loading profile sessions',
    },
    done: {
      key: 'chat.tool_get_profile_sessions_done',
      fallback: 'Profile sessions',
    },
  },
  get_profile_metrics: {
    active: {
      key: 'chat.tool_get_profile_metrics_active',
      fallback: 'Loading profile metrics',
    },
    done: {
      key: 'chat.tool_get_profile_metrics_done',
      fallback: 'Profile metrics',
    },
  },
  get_profile_journey: {
    active: {
      key: 'chat.tool_get_profile_journey_active',
      fallback: 'Loading user journey',
    },
    done: {
      key: 'chat.tool_get_profile_journey_done',
      fallback: 'User journey',
    },
  },
  get_profile_groups: {
    active: {
      key: 'chat.tool_get_profile_groups_active',
      fallback: 'Loading profile groups',
    },
    done: {
      key: 'chat.tool_get_profile_groups_done',
      fallback: 'Profile groups',
    },
  },
  compare_profile_to_average: {
    active: {
      key: 'chat.tool_compare_profile_to_average_active',
      fallback: 'Comparing to average',
    },
    done: {
      key: 'chat.tool_compare_profile_to_average_done',
      fallback: 'Profile comparison',
    },
  },

  // Session
  get_session_full: {
    active: {
      key: 'chat.tool_get_session_full_active',
      fallback: 'Loading session',
    },
    done: {
      key: 'chat.tool_get_session_full_done',
      fallback: 'Session',
    },
  },
  get_session_path: {
    active: {
      key: 'chat.tool_get_session_path_active',
      fallback: 'Loading session path',
    },
    done: {
      key: 'chat.tool_get_session_path_done',
      fallback: 'Session path',
    },
  },
  get_session_events: {
    active: {
      key: 'chat.tool_get_session_events_active',
      fallback: 'Loading session events',
    },
    done: {
      key: 'chat.tool_get_session_events_done',
      fallback: 'Session events',
    },
  },
  get_similar_sessions: {
    active: {
      key: 'chat.tool_get_similar_sessions_active',
      fallback: 'Finding similar sessions',
    },
    done: {
      key: 'chat.tool_get_similar_sessions_done',
      fallback: 'Similar sessions',
    },
  },
  compare_session_to_typical: {
    active: {
      key: 'chat.tool_compare_session_to_typical_active',
      fallback: 'Comparing to typical',
    },
    done: {
      key: 'chat.tool_compare_session_to_typical_done',
      fallback: 'Session comparison',
    },
  },
  get_session_referrer_context: {
    active: {
      key: 'chat.tool_get_session_referrer_context_active',
      fallback: 'Loading referrer context',
    },
    done: {
      key: 'chat.tool_get_session_referrer_context_done',
      fallback: 'Referrer context',
    },
  },
  get_session_replay_summary: {
    active: {
      key: 'chat.tool_get_session_replay_summary_active',
      fallback: 'Loading session replay',
    },
    done: {
      key: 'chat.tool_get_session_replay_summary_done',
      fallback: 'Session replay',
    },
  },

  // Pages
  get_page_performance: {
    active: {
      key: 'chat.tool_get_page_performance_active',
      fallback: 'Loading page performance',
    },
    done: {
      key: 'chat.tool_get_page_performance_done',
      fallback: 'Page performance',
    },
  },
  get_page_conversions: {
    active: {
      key: 'chat.tool_get_page_conversions_active',
      fallback: 'Loading page conversions',
    },
    done: {
      key: 'chat.tool_get_page_conversions_done',
      fallback: 'Page conversions',
    },
  },
  get_entry_exit_pages: {
    active: {
      key: 'chat.tool_get_entry_exit_pages_active',
      fallback: 'Loading entry/exit pages',
    },
    done: {
      key: 'chat.tool_get_entry_exit_pages_done',
      fallback: 'Entry/exit pages',
    },
  },
  find_declining_pages: {
    active: {
      key: 'chat.tool_find_declining_pages_active',
      fallback: 'Finding declining pages',
    },
    done: {
      key: 'chat.tool_find_declining_pages_done',
      fallback: 'Declining pages',
    },
  },

  // SEO / GSC
  gsc_get_overview: {
    active: {
      key: 'chat.tool_gsc_get_overview_active',
      fallback: 'Loading SEO overview',
    },
    done: {
      key: 'chat.tool_gsc_get_overview_done',
      fallback: 'SEO overview',
    },
  },
  gsc_get_top_queries: {
    active: {
      key: 'chat.tool_gsc_get_top_queries_active',
      fallback: 'Loading top queries',
    },
    done: {
      key: 'chat.tool_gsc_get_top_queries_done',
      fallback: 'Top queries',
    },
  },
  gsc_get_top_pages: {
    active: {
      key: 'chat.tool_gsc_get_top_pages_active',
      fallback: 'Loading top SEO pages',
    },
    done: {
      key: 'chat.tool_gsc_get_top_pages_done',
      fallback: 'Top SEO pages',
    },
  },
  gsc_get_query_details: {
    active: {
      key: 'chat.tool_gsc_get_query_details_active',
      fallback: 'Loading query details',
    },
    done: {
      key: 'chat.tool_gsc_get_query_details_done',
      fallback: 'Query details',
    },
  },
  gsc_get_page_details: {
    active: {
      key: 'chat.tool_gsc_get_page_details_active',
      fallback: 'Loading page details',
    },
    done: {
      key: 'chat.tool_gsc_get_page_details_done',
      fallback: 'Page details',
    },
  },
  gsc_get_query_opportunities: {
    active: {
      key: 'chat.tool_gsc_get_query_opportunities_active',
      fallback: 'Finding query opportunities',
    },
    done: {
      key: 'chat.tool_gsc_get_query_opportunities_done',
      fallback: 'Query opportunities',
    },
  },
  gsc_get_cannibalization: {
    active: {
      key: 'chat.tool_gsc_get_cannibalization_active',
      fallback: 'Checking cannibalization',
    },
    done: {
      key: 'chat.tool_gsc_get_cannibalization_done',
      fallback: 'Cannibalization',
    },
  },
  correlate_seo_with_traffic: {
    active: {
      key: 'chat.tool_correlate_seo_with_traffic_active',
      fallback: 'Correlating SEO with traffic',
    },
    done: {
      key: 'chat.tool_correlate_seo_with_traffic_done',
      fallback: 'SEO/traffic correlation',
    },
  },

  // Events
  analyze_event_distribution: {
    active: {
      key: 'chat.tool_analyze_event_distribution_active',
      fallback: 'Analyzing event distribution',
    },
    done: {
      key: 'chat.tool_analyze_event_distribution_done',
      fallback: 'Event distribution',
    },
  },
  correlate_events: {
    active: {
      key: 'chat.tool_correlate_events_active',
      fallback: 'Correlating events',
    },
    done: {
      key: 'chat.tool_correlate_events_done',
      fallback: 'Event correlation',
    },
  },
  get_event_property_distribution: {
    active: {
      key: 'chat.tool_get_event_property_distribution_active',
      fallback: 'Loading property distribution',
    },
    done: {
      key: 'chat.tool_get_event_property_distribution_done',
      fallback: 'Property distribution',
    },
  },
  list_properties_for_event: {
    active: {
      key: 'chat.tool_list_properties_for_event_active',
      fallback: 'Loading properties',
    },
    done: {
      key: 'chat.tool_list_properties_for_event_done',
      fallback: 'Event properties',
    },
  },

  // Insights
  list_insights: {
    active: {
      key: 'chat.tool_list_insights_active',
      fallback: 'Loading insights',
    },
    done: {
      key: 'chat.tool_list_insights_done',
      fallback: 'Insights',
    },
  },
  explain_insight: {
    active: {
      key: 'chat.tool_explain_insight_active',
      fallback: 'Loading insight',
    },
    done: {
      key: 'chat.tool_explain_insight_done',
      fallback: 'Insight',
    },
  },
  find_related_insights: {
    active: {
      key: 'chat.tool_find_related_insights_active',
      fallback: 'Finding related insights',
    },
    done: {
      key: 'chat.tool_find_related_insights_done',
      fallback: 'Related insights',
    },
  },

  // Group
  get_group_full: {
    active: {
      key: 'chat.tool_get_group_full_active',
      fallback: 'Loading group',
    },
    done: {
      key: 'chat.tool_get_group_full_done',
      fallback: 'Group',
    },
  },
  get_group_members: {
    active: {
      key: 'chat.tool_get_group_members_active',
      fallback: 'Loading group members',
    },
    done: {
      key: 'chat.tool_get_group_members_done',
      fallback: 'Group members',
    },
  },
  get_group_events: {
    active: {
      key: 'chat.tool_get_group_events_active',
      fallback: 'Loading group events',
    },
    done: {
      key: 'chat.tool_get_group_events_done',
      fallback: 'Group events',
    },
  },
  get_group_metrics: {
    active: {
      key: 'chat.tool_get_group_metrics_active',
      fallback: 'Loading group metrics',
    },
    done: {
      key: 'chat.tool_get_group_metrics_done',
      fallback: 'Group metrics',
    },
  },
  compare_groups: {
    active: {
      key: 'chat.tool_compare_groups_active',
      fallback: 'Comparing groups',
    },
    done: {
      key: 'chat.tool_compare_groups_done',
      fallback: 'Group comparison',
    },
  },

  // Report editor
  preview_report_with_changes: {
    active: {
      key: 'chat.tool_preview_report_with_changes_active',
      fallback: 'Previewing changes',
    },
    done: {
      key: 'chat.tool_preview_report_with_changes_done',
      fallback: 'Report preview',
    },
  },
  suggest_breakdowns: {
    active: {
      key: 'chat.tool_suggest_breakdowns_active',
      fallback: 'Suggesting breakdowns',
    },
    done: {
      key: 'chat.tool_suggest_breakdowns_done',
      fallback: 'Breakdown suggestions',
    },
  },
  compare_to_previous_period: {
    active: {
      key: 'chat.tool_compare_to_previous_period_active',
      fallback: 'Comparing to previous period',
    },
    done: {
      key: 'chat.tool_compare_to_previous_period_done',
      fallback: 'Period comparison',
    },
  },
  find_anomalies_in_current_report: {
    active: {
      key: 'chat.tool_find_anomalies_in_current_report_active',
      fallback: 'Finding anomalies',
    },
    done: {
      key: 'chat.tool_find_anomalies_in_current_report_done',
      fallback: 'Anomalies',
    },
  },
  explain_filter_impact: {
    active: {
      key: 'chat.tool_explain_filter_impact_active',
      fallback: 'Analyzing filter impact',
    },
    done: {
      key: 'chat.tool_explain_filter_impact_done',
      fallback: 'Filter impact',
    },
  },

  // UI mutators (client-side)
  apply_filters: {
    active: {
      key: 'chat.tool_apply_filters_active',
      fallback: 'Applying date range',
    },
    done: {
      key: 'chat.tool_apply_filters_done',
      fallback: 'Date range updated',
    },
  },
  set_property_filters: {
    active: {
      key: 'chat.tool_set_property_filters_active',
      fallback: 'Applying filters',
    },
    done: {
      key: 'chat.tool_set_property_filters_done',
      fallback: 'Filters updated',
    },
  },
  set_event_names_filter: {
    active: {
      key: 'chat.tool_set_event_names_filter_active',
      fallback: 'Applying event filter',
    },
    done: {
      key: 'chat.tool_set_event_names_filter_done',
      fallback: 'Event filter updated',
    },
  },

  // References
  list_references: {
    active: {
      key: 'chat.tool_list_references_active',
      fallback: 'Loading references',
    },
    done: {
      key: 'chat.tool_list_references_done',
      fallback: 'References',
    },
  },
  get_references_around: {
    active: {
      key: 'chat.tool_get_references_around_active',
      fallback: 'Checking references around this date',
    },
    done: {
      key: 'chat.tool_get_references_around_done',
      fallback: 'Nearby references',
    },
  },
} as const;

export type ToolPhrasePhase = 'active' | 'done';

export type ToolPhraseLabel =
  | {
      key: string;
      fallback: string;
      values?: Record<string, string | ToolPhraseLabel>;
    }
  | {
      text: string;
    };

export function getToolPhrase(
  toolName: string,
  phase: ToolPhrasePhase,
): ToolPhraseLabel {
  const explicit = PHRASES[toolName as keyof typeof PHRASES];
  if (explicit) {
    const phrase = explicit[phase];
    return {
      key: phrase.key,
      fallback: phrase.fallback,
    };
  }

  const matchedPrefix = VERB_PREFIXES.find(([p]) => toolName.startsWith(p));
  const verb = matchedPrefix?.[0] ?? '';
  const verbKey = matchedPrefix?.[1] ?? 'chat.tool_fallback_verb_running';
  const verbFallback = matchedPrefix?.[2] ?? 'Running';
  const noun = humanizeNoun(toolName.slice(verb.length) || toolName);
  return phase === 'active'
    ? {
        key: 'chat.tool_fallback_active',
        fallback: `${verbFallback} ${noun.toLowerCase()}`,
        values: {
          verb: { key: verbKey, fallback: verbFallback },
          tool: noun.toLowerCase(),
        },
      }
    : { text: noun };
}

function humanizeNoun(s: string): string {
  return s
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}
