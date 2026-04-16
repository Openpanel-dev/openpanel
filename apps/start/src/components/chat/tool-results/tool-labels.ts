/**
 * Humanizes raw tool names into action-phrase labels for the UI.
 *
 * Each tool gets a tuple: (verb-form for in-progress, noun-form for
 * completed). E.g.
 *   list_event_names → ["Looking up event names", "Event names"]
 *
 * Falls back to a generic transformation when a tool isn't in the
 * map: snake_case → "Snake case", with verb-prefix heuristics
 * ("get_" → "Loading", "list_" → "Looking up", "find_" → "Finding").
 */

const VERB_PREFIXES: Array<[string, string]> = [
  ['list_', 'Looking up'],
  ['get_', 'Loading'],
  ['find_', 'Finding'],
  ['query_', 'Querying'],
  ['analyze_', 'Analyzing'],
  ['compare_', 'Comparing'],
  ['correlate_', 'Correlating'],
  ['explain_', 'Explaining'],
  ['suggest_', 'Suggesting'],
  ['preview_', 'Previewing'],
  ['generate_', 'Generating'],
  ['apply_', 'Applying'],
  ['set_', 'Updating'],
  ['gsc_', 'Loading SEO'],
];

const PHRASES: Record<
  string,
  { active: string; done: string }
> = {
  // Discovery
  list_event_names: { active: 'Looking up event names', done: 'Event names' },
  list_event_properties: {
    active: 'Looking up properties',
    done: 'Event properties',
  },
  get_event_property_values: {
    active: 'Loading property values',
    done: 'Property values',
  },

  // Saved reports & dashboards
  list_dashboards: { active: 'Loading dashboards', done: 'Dashboards' },
  list_reports: { active: 'Loading reports', done: 'Reports' },
  get_report_data: { active: 'Running report', done: 'Report' },
  generate_report: { active: 'Building report', done: 'Report' },

  // Aggregate analytics
  get_analytics_overview: { active: 'Loading overview', done: 'Overview' },
  get_top_pages: { active: 'Loading top pages', done: 'Top pages' },
  get_top_referrers: {
    active: 'Loading top referrers',
    done: 'Top referrers',
  },
  get_country_breakdown: {
    active: 'Loading geo breakdown',
    done: 'Geo breakdown',
  },
  get_device_breakdown: {
    active: 'Loading device breakdown',
    done: 'Device breakdown',
  },
  get_rolling_active_users: {
    active: 'Loading active users',
    done: 'Active users',
  },
  get_funnel: { active: 'Building funnel', done: 'Funnel' },
  get_retention_cohort: {
    active: 'Building retention cohort',
    done: 'Retention',
  },
  get_user_flow: { active: 'Building user flow', done: 'User flow' },

  // Free-form
  query_events: { active: 'Querying events', done: 'Events' },
  query_sessions: { active: 'Querying sessions', done: 'Sessions' },
  find_profiles: { active: 'Finding profiles', done: 'Profiles' },

  // Profile
  get_profile_full: { active: 'Loading profile', done: 'Profile' },
  get_profile_events: {
    active: 'Loading profile events',
    done: 'Profile events',
  },
  get_profile_sessions: {
    active: 'Loading profile sessions',
    done: 'Profile sessions',
  },
  get_profile_metrics: {
    active: 'Loading profile metrics',
    done: 'Profile metrics',
  },
  get_profile_journey: {
    active: 'Loading user journey',
    done: 'User journey',
  },
  get_profile_groups: {
    active: 'Loading profile groups',
    done: 'Profile groups',
  },
  compare_profile_to_average: {
    active: 'Comparing to average',
    done: 'Profile comparison',
  },

  // Session
  get_session_full: { active: 'Loading session', done: 'Session' },
  get_session_path: { active: 'Loading session path', done: 'Session path' },
  get_session_events: {
    active: 'Loading session events',
    done: 'Session events',
  },
  get_similar_sessions: {
    active: 'Finding similar sessions',
    done: 'Similar sessions',
  },
  compare_session_to_typical: {
    active: 'Comparing to typical',
    done: 'Session comparison',
  },
  get_session_referrer_context: {
    active: 'Loading referrer context',
    done: 'Referrer context',
  },
  get_session_replay_summary: {
    active: 'Loading session replay',
    done: 'Session replay',
  },

  // Pages
  get_page_performance: {
    active: 'Loading page performance',
    done: 'Page performance',
  },
  get_page_conversions: {
    active: 'Loading page conversions',
    done: 'Page conversions',
  },
  get_entry_exit_pages: {
    active: 'Loading entry/exit pages',
    done: 'Entry/exit pages',
  },
  find_declining_pages: {
    active: 'Finding declining pages',
    done: 'Declining pages',
  },

  // SEO / GSC
  gsc_get_overview: { active: 'Loading SEO overview', done: 'SEO overview' },
  gsc_get_top_queries: { active: 'Loading top queries', done: 'Top queries' },
  gsc_get_top_pages: {
    active: 'Loading top SEO pages',
    done: 'Top SEO pages',
  },
  gsc_get_query_details: {
    active: 'Loading query details',
    done: 'Query details',
  },
  gsc_get_page_details: {
    active: 'Loading page details',
    done: 'Page details',
  },
  gsc_get_query_opportunities: {
    active: 'Finding query opportunities',
    done: 'Query opportunities',
  },
  gsc_get_cannibalization: {
    active: 'Checking cannibalization',
    done: 'Cannibalization',
  },
  correlate_seo_with_traffic: {
    active: 'Correlating SEO with traffic',
    done: 'SEO/traffic correlation',
  },

  // Events
  analyze_event_distribution: {
    active: 'Analyzing event distribution',
    done: 'Event distribution',
  },
  correlate_events: { active: 'Correlating events', done: 'Event correlation' },
  get_event_property_distribution: {
    active: 'Loading property distribution',
    done: 'Property distribution',
  },
  list_properties_for_event: {
    active: 'Loading properties',
    done: 'Event properties',
  },

  // Insights
  list_insights: { active: 'Loading insights', done: 'Insights' },
  explain_insight: { active: 'Loading insight', done: 'Insight' },
  find_related_insights: {
    active: 'Finding related insights',
    done: 'Related insights',
  },

  // Group
  get_group_full: { active: 'Loading group', done: 'Group' },
  get_group_members: { active: 'Loading group members', done: 'Group members' },
  get_group_events: { active: 'Loading group events', done: 'Group events' },
  get_group_metrics: {
    active: 'Loading group metrics',
    done: 'Group metrics',
  },
  compare_groups: { active: 'Comparing groups', done: 'Group comparison' },

  // Report editor
  preview_report_with_changes: {
    active: 'Previewing changes',
    done: 'Report preview',
  },
  suggest_breakdowns: {
    active: 'Suggesting breakdowns',
    done: 'Breakdown suggestions',
  },
  compare_to_previous_period: {
    active: 'Comparing to previous period',
    done: 'Period comparison',
  },
  find_anomalies_in_current_report: {
    active: 'Finding anomalies',
    done: 'Anomalies',
  },
  explain_filter_impact: {
    active: 'Analyzing filter impact',
    done: 'Filter impact',
  },

  // UI mutators (client-side)
  apply_filters: {
    active: 'Applying date range',
    done: 'Date range updated',
  },
  set_property_filters: {
    active: 'Applying filters',
    done: 'Filters updated',
  },
  set_event_names_filter: {
    active: 'Applying event filter',
    done: 'Event filter updated',
  },

  // References
  list_references: {
    active: 'Loading references',
    done: 'References',
  },
  get_references_around: {
    active: 'Checking references around this date',
    done: 'Nearby references',
  },
};

export type ToolPhrasePhase = 'active' | 'done';

export function getToolPhrase(toolName: string, phase: ToolPhrasePhase): string {
  const explicit = PHRASES[toolName];
  if (explicit) return explicit[phase];

  const matchedPrefix = VERB_PREFIXES.find(([p]) => toolName.startsWith(p));
  const verb = matchedPrefix?.[0] ?? '';
  const verbLabel = matchedPrefix?.[1] ?? 'Running';

  const noun = humanizeNoun(toolName.slice(verb.length) || toolName);
  return phase === 'active' ? `${verbLabel} ${noun.toLowerCase()}` : noun;
}

function humanizeNoun(s: string): string {
  return s
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}
