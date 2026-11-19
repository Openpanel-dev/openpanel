import { tool } from 'ai';
import { z } from 'zod';
import {
  listEventNamesCore,
  queryEventsCore,
} from '../../../event/event.service';
import {
  findProfilesCore,
  getProfileById,
} from '../../../profile/profile.service';
import { getSessionById } from '../../../session/session.service';
import type { ChatToolContext } from '../context';
import { dashboardUrl } from './shared';

const PROFILE_LIMIT = 10;
const EVENT_LIMIT = 10;
const MAX_EVENT_NAME_MATCHES = 15;

interface ProfileHit {
  id: string;
  email: string;
  name: string;
  lastSeen: string;
  url: string;
}

export function searchTools(ctx: ChatToolContext) {
  const { deps, projectId } = ctx;

  return {
    search: tool({
      description:
        'Find what a pasted id, email, name, path or word refers to. Looks across profile ids, emails and names, session ids, event names and recent events on a path, and links each hit to the dashboard. Use it whenever the user pastes something that looks like an identifier.',
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async ({ query }) => {
        const trimmed = query.trim();
        const looksLikePath = trimmed.startsWith('/');
        const [byId, byEmail, byName, session, names, pathEvents] =
          await Promise.all([
            getProfileById(deps, trimmed, projectId).catch(() => null),
            findProfilesCore(deps, {
              projectId,
              email: trimmed,
              limit: PROFILE_LIMIT,
            }).catch(() => []),
            findProfilesCore(deps, {
              projectId,
              name: trimmed,
              limit: PROFILE_LIMIT,
            }).catch(() => []),
            getSessionById(deps, trimmed, projectId).catch(() => null),
            listEventNamesCore(deps, projectId).catch(() => []),
            looksLikePath
              ? queryEventsCore(deps, {
                  projectId,
                  path: trimmed,
                  limit: EVENT_LIMIT,
                }).catch(() => [])
              : Promise.resolve([]),
          ]);

        const seen = new Set<string>();
        const profiles: ProfileHit[] = [];
        const addProfile = (hit: ProfileHit) => {
          if (!seen.has(hit.id)) {
            seen.add(hit.id);
            profiles.push(hit);
          }
        };
        if (byId) {
          addProfile({
            id: byId.id,
            email: byId.email,
            name: `${byId.firstName} ${byId.lastName}`.trim(),
            lastSeen: byId.lastSeenAt.toISOString(),
            url: dashboardUrl(ctx, `/profiles/${byId.id}`),
          });
        }
        for (const profile of [...byEmail, ...byName]) {
          addProfile({
            id: profile.id,
            email: profile.email,
            name: `${profile.first_name} ${profile.last_name}`.trim(),
            lastSeen: profile.last_seen_at,
            url: dashboardUrl(ctx, `/profiles/${profile.id}`),
          });
        }
        const lowered = trimmed.toLowerCase();
        const eventNames = names
          .filter((name) => name.toLowerCase().includes(lowered))
          .slice(0, MAX_EVENT_NAME_MATCHES);

        return {
          query: trimmed,
          profiles,
          session: session
            ? { ...session, url: dashboardUrl(ctx, `/sessions/${trimmed}`) }
            : null,
          eventNames,
          pathEvents,
        };
      },
    }),
  };
}
