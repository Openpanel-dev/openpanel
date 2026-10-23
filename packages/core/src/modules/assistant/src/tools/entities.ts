import { tool } from 'ai';
import { z } from 'zod';
import { queryEventsCore } from '../../../event/event.service';
import {
  getProfileById,
  getProfileMetricsCore,
  getProfileSessionsCore,
  getProfileWithEvents,
} from '../../../profile/profile.service';
import { getSessionById } from '../../../session/session.service';
import type { ChatToolContext } from '../context';
import { dashboardUrl, errorResult } from './shared';

const RECENT_EVENTS = 15;
const RECENT_SESSIONS = 5;
const SESSION_EVENT_LIMIT = 100;
const SESSION_EVENTS_RETURNED = 50;

export function entityTools(ctx: ChatToolContext) {
  const { deps, projectId } = ctx;

  return {
    get_profile: tool({
      description:
        'One user in depth: profile fields, lifetime metrics, recent sessions and recent events. Defaults to the profile the chat was opened from.',
      inputSchema: z.object({ profileId: z.string().optional() }),
      execute: async ({ profileId }) => {
        const id = profileId || ctx.hint?.profileId || '';
        if (!id) {
          return errorResult('No profile id given.');
        }
        const [profile, withEvents, sessions, metrics] = await Promise.all([
          getProfileById(deps, id, projectId),
          getProfileWithEvents(deps, projectId, id, RECENT_EVENTS),
          getProfileSessionsCore(deps, projectId, id, RECENT_SESSIONS),
          getProfileMetricsCore(deps, { projectId, profileId: id }).catch(
            () => null
          ),
        ]);
        if (!profile) {
          return errorResult('Profile not found', { profileId: id });
        }
        return {
          profile,
          metrics,
          recentSessions: sessions,
          recentEvents: withEvents.recent_events,
          url: dashboardUrl(ctx, `/profiles/${id}`),
        };
      },
    }),

    get_session: tool({
      description:
        'One session in depth: device, referrer, duration, the pages visited in order and its events. Defaults to the session the chat was opened from.',
      inputSchema: z.object({ sessionId: z.string().optional() }),
      execute: async ({ sessionId }) => {
        const id = sessionId || ctx.hint?.sessionId || '';
        if (!id) {
          return errorResult('No session id given.');
        }
        const [session, events] = await Promise.all([
          getSessionById(deps, id, projectId),
          queryEventsCore(deps, {
            projectId,
            sessionId: id,
            limit: SESSION_EVENT_LIMIT,
          }),
        ]);
        if (!session) {
          return errorResult('Session not found', { sessionId: id });
        }
        const path = events
          .filter((event) => event.name === 'screen_view' && event.path)
          .map((event) => ({ path: event.path, at: event.created_at }));
        return {
          session,
          eventCount: events.length,
          path,
          events: events.slice(0, SESSION_EVENTS_RETURNED),
          url: dashboardUrl(ctx, `/sessions/${id}`),
        };
      },
    }),
  };
}
