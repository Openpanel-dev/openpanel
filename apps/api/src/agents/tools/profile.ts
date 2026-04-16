import { z } from 'zod';
import {
  findProfilesCore,
  getProfileById,
  getProfileMetricsCore,
  getProfileSessionsCore,
  getProfileWithEvents,
  queryEventsCore,
} from '@openpanel/db';
import { chatTool, dashboardUrl, truncateRows } from './helpers';

export const getProfileFull = chatTool(
  {
    name: 'get_profile_full',
    description:
      'One-shot deep dive: profile data + lifetime metrics + last 5 sessions + last 10 events. CALL THIS FIRST when the user asks "tell me about this user" — it covers ~80% of follow-up questions in one round trip.',
    schema: z.object({
      profileId: z
        .string()
        .optional()
        .describe('Defaults to the currently-viewed profile.'),
    }),
  },
  async ({ profileId }, context) => {
    const id = profileId || context.pageContext?.ids?.profileId || '';
    const [profile, withEvents, sessions, metrics] = await Promise.all([
      getProfileById(id, context.projectId),
      getProfileWithEvents(context.projectId, id, 10),
      getProfileSessionsCore(context.projectId, id, 5),
      getProfileMetricsCore({ projectId: context.projectId, profileId: id }).catch(
        () => null,
      ),
    ]);
    if (!profile) {
      return { error: 'Profile not found', profileId: id };
    }
    return {
      profile,
      metrics,
      recent_sessions: sessions,
      recent_events: withEvents.recent_events,
      dashboard_url: dashboardUrl(context.organizationId, context.projectId, `/profiles/${id}`),
    };
  },
);

export const getProfileEvents = chatTool(
  {
    name: 'get_profile_events',
    description:
      'Recent events for this profile, optionally filtered by event name or property. Use when get_profile_full doesn\'t cover the question.',
    schema: z.object({
      profileId: z.string().optional(),
      eventNames: z
        .array(z.string())
        .optional()
        .describe('Filter to specific event names'),
      properties: z.record(z.string(), z.string()).optional(),
      limit: z.number().min(1).max(100).default(50).optional(),
    }),
  },
  async ({ profileId, eventNames, properties, limit }, context) => {
    const events = await queryEventsCore({
      projectId: context.projectId,
      profileId: profileId || context.pageContext?.ids?.profileId || '',
      eventNames,
      properties,
      limit: limit ?? 50,
    });
    return truncateRows(events, 100);
  },
);

export const getProfileSessions = chatTool(
  {
    name: 'get_profile_sessions',
    description:
      'All sessions for this profile, ordered most-recent-first.',
    schema: z.object({
      profileId: z.string().optional(),
      limit: z.number().min(1).max(100).default(20).optional(),
    }),
  },
  async ({ profileId, limit }, context) => {
    const sessions = await getProfileSessionsCore(
      context.projectId,
      profileId || context.pageContext?.ids?.profileId || '',
      limit ?? 20,
    );
    return truncateRows(
      sessions.map((s) => ({
        ...s,
        dashboard_url: dashboardUrl(context.organizationId, context.projectId, `/sessions/${s.id}`),
      })),
      100,
    );
  },
);

export const getProfileMetrics = chatTool(
  {
    name: 'get_profile_metrics',
    description:
      'Lifetime metrics for this profile: sessions, screen views, total events, avg/p90 session duration, bounce rate, conversion events, time between sessions, revenue.',
    schema: z.object({
      profileId: z.string().optional(),
    }),
  },
  async ({ profileId }, context) =>
    getProfileMetricsCore({
      projectId: context.projectId,
      profileId: profileId || context.pageContext?.ids?.profileId || '',
    }),
);

export const getProfileJourney = chatTool(
  {
    name: 'get_profile_journey',
    description:
      'Chronological narrative of this user\'s journey: first session, key conversion events, last 30 days summary. Designed for "tell me their story" questions — gives the LLM a structured timeline rather than a flat event list.',
    schema: z.object({
      profileId: z.string().optional(),
      sinceDays: z.number().min(1).max(365).default(90).optional(),
      maxEvents: z.number().min(5).max(100).default(50).optional(),
    }),
  },
  async ({ profileId, sinceDays, maxEvents }, context) => {
    const id = profileId || context.pageContext?.ids?.profileId || '';
    const [profile, events, sessions, metrics] = await Promise.all([
      getProfileById(id, context.projectId),
      queryEventsCore({
        projectId: context.projectId,
        profileId: id,
        limit: maxEvents ?? 50,
      }),
      getProfileSessionsCore(context.projectId, id, 20),
      getProfileMetricsCore({ projectId: context.projectId, profileId: id }).catch(
        () => null,
      ),
    ]);

    if (!profile) {
      return { error: 'Profile not found', profileId: id };
    }

    // Heuristic: events that look like conversions (purchase, signup,
    // checkout, subscribe, upgrade, complete, etc.)
    const conversionPattern =
      /^(purchase|sign_?up|signup|register|subscribe|checkout|upgrade|complete|paid|conversion)/i;
    const keyMoments = events.filter((e) => conversionPattern.test(e.name));

    return {
      profile_id: id,
      first_seen: metrics?.firstSeen ?? sessions[sessions.length - 1]?.created_at ?? null,
      last_seen: metrics?.lastSeen ?? sessions[0]?.created_at ?? null,
      total_sessions: metrics?.sessions ?? sessions.length,
      total_events: metrics?.totalEvents ?? events.length,
      key_moments: keyMoments.slice(0, 10),
      recent_sessions: sessions.slice(0, 5).map((s) => ({
        id: s.id,
        created_at: s.created_at,
        duration: s.duration,
        entry_path: s.entry_path,
        exit_path: s.exit_path,
        is_bounce: s.is_bounce,
        country: s.country,
        referrer: s.referrer,
      })),
      recent_events: events.slice(0, 20).map((e) => ({
        id: e.id,
        name: e.name,
        path: e.path,
        created_at: e.created_at,
      })),
      dashboard_url: dashboardUrl(context.organizationId, context.projectId, `/profiles/${id}`),
    };
  },
);

export const getProfileGroups = chatTool(
  {
    name: 'get_profile_groups',
    description:
      'Groups (B2B accounts) this profile belongs to. Returns the list of group IDs from the profile record.',
    schema: z.object({
      profileId: z.string().optional(),
    }),
  },
  async ({ profileId }, context) => {
    const id = profileId || context.pageContext?.ids?.profileId || '';
    const profile = await getProfileById(id, context.projectId);
    if (!profile) {
      return { error: 'Profile not found', profileId: id };
    }
    return {
      profileId: profile.id,
      group_count: (profile.groups ?? []).length,
      groups: profile.groups ?? [],
    };
  },
);

export const compareProfileToAverage = chatTool(
  {
    name: 'compare_profile_to_average',
    description:
      'How this profile\'s key metrics compare to the project average — sessions, total events, bounce rate, etc. Returns ratios and "above/below" labels for each metric. Useful for spotting power users vs lurkers.',
    schema: z.object({
      profileId: z.string().optional(),
    }),
  },
  async ({ profileId }, context) => {
    const id = profileId || context.pageContext?.ids?.profileId || '';

    // Get this profile's metrics + a sample of other profiles' metrics
    const [thisMetrics, allProfiles] = await Promise.all([
      getProfileMetricsCore({ projectId: context.projectId, profileId: id }).catch(
        () => null,
      ),
      findProfilesCore({ projectId: context.projectId, limit: 100 }),
    ]);

    if (!thisMetrics) {
      return { error: 'Profile not found or has no events', profileId: id };
    }

    // Compute averages from a sample of other profiles. We sample 100
    // and compute their metrics in parallel; for a precise project-wide
    // average we'd want a dedicated db helper, but this gives the LLM a
    // useful comparison without extra schema work.
    const sampleIds = allProfiles
      .filter((p) => p.id !== id)
      .slice(0, 30)
      .map((p) => p.id);

    const sampleMetrics = await Promise.all(
      sampleIds.map((sid) =>
        getProfileMetricsCore({ projectId: context.projectId, profileId: sid }).catch(
          () => null,
        ),
      ),
    );
    const valid = sampleMetrics.filter(
      (m): m is NonNullable<typeof m> => m != null,
    );

    if (valid.length === 0) {
      return {
        profile: thisMetrics,
        comparison: null,
        note: 'No other profiles available for comparison',
      };
    }

    const avg = (sel: (m: typeof valid[number]) => number) =>
      valid.reduce((s, m) => s + sel(m), 0) / valid.length;

    const project_avg = {
      sessions: avg((m) => m.sessions),
      totalEvents: avg((m) => m.totalEvents),
      screenViews: avg((m) => m.screenViews),
      avgSessionDurationMin: avg((m) => m.avgSessionDurationMin),
      bounceRate: avg((m) => m.bounceRate),
      revenue: avg((m) => m.revenue),
    };

    const ratio = (a: number, b: number): { ratio: number; label: 'above' | 'below' | 'equal' } => {
      if (b === 0) return { ratio: 0, label: a > 0 ? 'above' : 'equal' };
      const r = a / b;
      return {
        ratio: Number(r.toFixed(2)),
        label: r > 1.05 ? 'above' : r < 0.95 ? 'below' : 'equal',
      };
    };

    return {
      profile: thisMetrics,
      project_avg,
      comparison: {
        sessions: ratio(thisMetrics.sessions, project_avg.sessions),
        totalEvents: ratio(thisMetrics.totalEvents, project_avg.totalEvents),
        screenViews: ratio(thisMetrics.screenViews, project_avg.screenViews),
        avgSessionDurationMin: ratio(
          thisMetrics.avgSessionDurationMin,
          project_avg.avgSessionDurationMin,
        ),
        bounceRate: ratio(thisMetrics.bounceRate, project_avg.bounceRate),
        revenue: ratio(thisMetrics.revenue, project_avg.revenue),
      },
      sample_size: valid.length,
    };
  },
);
