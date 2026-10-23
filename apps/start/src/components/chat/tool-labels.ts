/** What the chat says while a tool runs and once it is done. */
const TOOL_PHRASES: Record<string, { active: string; done: string }> = {
  describe_data: {
    active: 'Looking at what is tracked',
    done: 'Checked the tracked events',
  },
  get_property_values: {
    active: 'Listing property values',
    done: 'Listed property values',
  },
  get_overview: {
    active: 'Fetching the overview',
    done: 'Fetched the overview',
  },
  get_traffic_attribution: {
    active: 'Attributing traffic',
    done: 'Attribution ready',
  },
  get_breakdown: {
    active: 'Breaking down the traffic',
    done: 'Breakdown fetched',
  },
  query_events: { active: 'Querying events', done: 'Events queried' },
  query_sessions: { active: 'Querying sessions', done: 'Sessions queried' },
  get_active_users: {
    active: 'Counting active users',
    done: 'Active users counted',
  },
  get_funnel: { active: 'Running the funnel', done: 'Funnel ready' },
  get_retention: { active: 'Computing retention', done: 'Retention ready' },
  get_user_flow: { active: 'Tracing user flows', done: 'User flow ready' },
  create_chart: { active: 'Building a chart', done: 'Chart ready' },
  get_report: { active: 'Running the report', done: 'Report ready' },
  search: { active: 'Searching', done: 'Search done' },
  get_profile: { active: 'Loading the profile', done: 'Profile loaded' },
  get_session: { active: 'Loading the session', done: 'Session loaded' },
  list_references: {
    active: 'Checking references',
    done: 'References checked',
  },
  gsc_overview: {
    active: 'Fetching Search Console',
    done: 'Search Console fetched',
  },
  gsc_top_queries: {
    active: 'Fetching top queries',
    done: 'Top queries fetched',
  },
  gsc_top_pages: { active: 'Fetching top pages', done: 'Top pages fetched' },
  gsc_opportunities: {
    active: 'Finding SEO opportunities',
    done: 'SEO opportunities found',
  },
  gsc_cannibalization: {
    active: 'Checking cannibalization',
    done: 'Cannibalization checked',
  },
  list_dashboards: { active: 'Listing dashboards', done: 'Dashboards listed' },
  list_reports: { active: 'Listing reports', done: 'Reports listed' },
  create_dashboard: {
    active: 'Creating the dashboard',
    done: 'Dashboard created',
  },
  save_chart: { active: 'Saving the chart', done: 'Chart saved' },
  create_reference: { active: 'Adding the reference', done: 'Reference added' },
  invite_member: { active: 'Sending the invite', done: 'Invite sent' },
  update_project: { active: 'Updating the project', done: 'Project updated' },
  search_docs: { active: 'Reading the docs', done: 'Docs checked' },
  get_billing: { active: 'Looking up the plan', done: 'Plan looked up' },
  list_plans: { active: 'Listing plans', done: 'Plans listed' },
  change_plan: { active: 'Changing the plan', done: 'Plan changed' },
  diagnose_tracking: {
    active: 'Checking the tracking setup',
    done: 'Tracking checked',
  },
  navigate: { active: 'Opening the page', done: 'Opened' },
  open_dialog: { active: 'Opening the dialog', done: 'Dialog opened' },
};

export function toolPhrase(toolName: string, phase: 'active' | 'done'): string {
  const known = TOOL_PHRASES[toolName];
  if (known) {
    return known[phase];
  }
  const readable = toolName.replace(/_/g, ' ');
  return phase === 'active' ? `Running ${readable}` : `Ran ${readable}`;
}

/** Tools the user needs to approve before they run. */
export function approvalPrompt(toolName: string, input: unknown): string {
  const fields = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case 'create_dashboard':
      return `Create the dashboard "${String(fields.name ?? '')}"?`;
    case 'save_chart': {
      const chart = fields.chart as { title?: string } | undefined;
      return `Save "${chart?.title ?? 'this chart'}" to the dashboard?`;
    }
    case 'create_reference':
      return `Add the reference "${String(fields.title ?? '')}" on ${String(fields.date ?? '')}?`;
    case 'invite_member':
      return `Invite ${String(fields.email ?? '')} as ${String(fields.role ?? 'member')}?`;
    case 'update_project':
      return 'Update the project settings?';
    case 'change_plan':
      return 'Change the workspace plan?';
    default:
      return `Run ${toolName.replace(/_/g, ' ')}?`;
  }
}
