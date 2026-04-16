import { z } from 'zod';
import {
  queryEventsCore,
  querySessionsCore,
  sessionService,
} from '@openpanel/db';
import { chatTool, dashboardUrl, truncateRows } from './helpers';

export const getSessionFull = chatTool(
  {
    name: 'get_session_full',
    description:
      'One-shot session deep dive: session data + ordered events + path. CALL THIS FIRST for "what happened in this session".',
    schema: z.object({
      sessionId: z.string().optional(),
    }),
  },
  async ({ sessionId }, context) => {
    const id = sessionId || context.pageContext?.ids?.sessionId || '';
    const [session, events] = await Promise.all([
      sessionService.byId(id, context.projectId),
      queryEventsCore({
        projectId: context.projectId,
        sessionId: id,
        limit: 100,
      }),
    ]);

    const screenViews = events
      .filter((e) => e.name === 'screen_view' && e.path)
      .map((e) => ({ path: e.path, created_at: e.created_at }));

    return {
      session,
      event_count: events.length,
      path_length: screenViews.length,
      path: screenViews,
      events: events.slice(0, 50),
      dashboard_url: dashboardUrl(context.organizationId, context.projectId, `/sessions/${id}`),
    };
  },
);

export const getSessionPath = chatTool(
  {
    name: 'get_session_path',
    description:
      'The chronological list of pages visited in this session.',
    schema: z.object({
      sessionId: z.string().optional(),
    }),
  },
  async ({ sessionId }, context) => {
    const id = sessionId || context.pageContext?.ids?.sessionId || '';
    const events = await queryEventsCore({
      projectId: context.projectId,
      sessionId: id,
      eventNames: ['screen_view'],
      limit: 100,
    });
    const path = events
      .filter((e) => e.path)
      .map((e) => ({
        path: e.path,
        origin: e.origin,
        created_at: e.created_at,
      }));
    return { sessionId: id, page_count: path.length, path };
  },
);

export const getSessionEvents = chatTool(
  {
    name: 'get_session_events',
    description:
      'All events in this session, optionally filtered by event name.',
    schema: z.object({
      sessionId: z.string().optional(),
      eventNames: z.array(z.string()).optional(),
    }),
  },
  async ({ sessionId, eventNames }, context) => {
    const id = sessionId || context.pageContext?.ids?.sessionId || '';
    const events = await queryEventsCore({
      projectId: context.projectId,
      sessionId: id,
      eventNames,
      limit: 100,
    });
    return truncateRows(events, 100);
  },
);

export const getSimilarSessions = chatTool(
  {
    name: 'get_similar_sessions',
    description:
      'Find sessions with similar device + country + entry path to this one. Returns up to 10. Useful for "is this typical?" questions.',
    schema: z.object({
      sessionId: z.string().optional(),
      limit: z.number().min(1).max(20).default(10).optional(),
    }),
  },
  async ({ sessionId, limit }, context) => {
    const id = sessionId || context.pageContext?.ids?.sessionId || '';
    const session = await sessionService.byId(id, context.projectId);

    const similar = await querySessionsCore({
      projectId: context.projectId,
      country: session.country ?? undefined,
      device: session.device ?? undefined,
      limit: (limit ?? 10) + 1,
    });
    // Drop the session itself
    const filtered = similar.filter((s) => s.id !== id).slice(0, limit ?? 10);

    return {
      reference: {
        id: session.id,
        country: session.country,
        device: session.device,
        entryPath: session.entryPath,
      },
      similar_sessions: filtered.map((s) => ({
        ...s,
        dashboard_url: dashboardUrl(context.organizationId, context.projectId, `/sessions/${s.id}`),
      })),
    };
  },
);

export const compareSessionToTypical = chatTool(
  {
    name: 'compare_session_to_typical',
    description:
      'Compare this session\'s duration / event count / screen views against the project averages. Helps spot outliers.',
    schema: z.object({
      sessionId: z.string().optional(),
    }),
  },
  async ({ sessionId }, context) => {
    const id = sessionId || context.pageContext?.ids?.sessionId || '';
    const session = await sessionService.byId(id, context.projectId);

    // Sample recent sessions to compute project averages.
    const sample = await querySessionsCore({
      projectId: context.projectId,
      limit: 100,
    });
    if (sample.length === 0) {
      return { session, comparison: null };
    }

    const avg = (sel: (s: typeof sample[number]) => number) =>
      sample.reduce((s, sess) => s + sel(sess), 0) / sample.length;

    const project_avg = {
      duration: avg((s) => s.duration),
      event_count: avg((s) => s.event_count),
      screen_view_count: avg((s) => s.screen_view_count),
    };

    const ratio = (a: number, b: number) => {
      if (b === 0) return { ratio: 0, label: 'equal' as const };
      const r = a / b;
      return {
        ratio: Number(r.toFixed(2)),
        label: r > 1.05 ? ('above' as const) : r < 0.95 ? ('below' as const) : ('equal' as const),
      };
    };

    return {
      session: {
        id: session.id,
        duration: session.duration,
        event_count: session.eventCount,
        screen_view_count: session.screenViewCount,
        is_bounce: session.isBounce,
      },
      project_avg,
      comparison: {
        duration: ratio(session.duration, project_avg.duration),
        event_count: ratio(session.eventCount, project_avg.event_count),
        screen_view_count: ratio(
          session.screenViewCount,
          project_avg.screen_view_count,
        ),
      },
      sample_size: sample.length,
    };
  },
);

export const getSessionReferrerContext = chatTool(
  {
    name: 'get_session_referrer_context',
    description:
      'Context about how the user arrived: total traffic this period from the same referrer, plus a few sample sessions from that referrer.',
    schema: z.object({
      sessionId: z.string().optional(),
    }),
  },
  async ({ sessionId }, context) => {
    const id = sessionId || context.pageContext?.ids?.sessionId || '';
    const session = await sessionService.byId(id, context.projectId);

    if (!session.referrer && !session.referrerName) {
      return {
        session_id: id,
        referrer: null,
        note: 'This session has no referrer (direct traffic).',
      };
    }

    const fromSameReferrer = await querySessionsCore({
      projectId: context.projectId,
      referrerName: session.referrerName ?? undefined,
      limit: 20,
    });

    return {
      session_id: id,
      referrer: session.referrer,
      referrer_name: session.referrerName,
      referrer_type: session.referrerType,
      total_from_referrer: fromSameReferrer.length,
      sample_sessions: fromSameReferrer.slice(0, 5).map((s) => ({
        id: s.id,
        created_at: s.created_at,
        country: s.country,
        is_bounce: s.is_bounce,
        entry_path: s.entry_path,
      })),
    };
  },
);

export const getSessionReplaySummary = chatTool(
  {
    name: 'get_session_replay_summary',
    description:
      'Whether this session has a recorded replay available. Returns metadata if so. If no replay, returns { available: false }.',
    schema: z.object({
      sessionId: z.string().optional(),
    }),
  },
  async ({ sessionId }, context) => {
    const id = sessionId || context.pageContext?.ids?.sessionId || '';
    const session = await sessionService.byId(id, context.projectId);
    return {
      session_id: id,
      available: session.hasReplay ?? false,
      replay_url: session.hasReplay
        ? dashboardUrl(context.organizationId, context.projectId, `/sessions/${id}`)
        : null,
    };
  },
);
