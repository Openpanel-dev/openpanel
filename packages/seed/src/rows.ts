// From a journey to ClickHouse rows, shaped the way the worker shapes them:
// `createEvent` for events, the session buffer's `newSession` / `extendSession`
// for the one sessions row, and the ingest handler's synthesized
// `session_start` / `session_end`. Kept in step with core by hand, on purpose:
// the seed stays out of the backend's dependency graph.

import { parsePath, toDots } from '@openpanel/shared';
import type { Archetype, JourneyEvent } from './archetypes/archetype';
import {
  type ClickhouseEventRow,
  type ClickhouseProfileRow,
  type ClickhouseSessionRow,
  toClickhouseDateTime,
} from './clickhouse-rows';
import { sessionReferrer } from './data/referrers';
import type { Referrer, Visitor } from './model';
import type { Rng } from './rng';
import {
  SESSION_END_OFFSET_MS,
  SESSION_START_OFFSET_MS,
} from './seed.constants';

export interface SessionInput {
  id: string;
  projectId: string;
  archetype: Archetype;
  visitor: Visitor;
  referrer: Referrer | null;
  utm: Record<string, string>;
  events: readonly JourneyEvent[];
}

export interface SessionRows {
  events: ClickhouseEventRow[];
  session: ClickhouseSessionRow;
  endedAt: Date;
  /** Whether the session ended identified, and whether any event went out anonymously. */
  identified: boolean;
  anonymousEvents: boolean;
}

/** What the ingest handler derives from one SDK request before the rows are shaped. */
interface EventPayload {
  name: string;
  profileId: string;
  createdAt: Date;
  path: string;
  origin: string;
  properties: Record<string, unknown>;
  duration: number;
  revenue?: number;
}

const UTM_KEYS = [
  'utm_medium',
  'utm_source',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

/** The SDK sends `__path` as a full URL on the web and a bare screen name in a native app. */
function eventUrl(
  archetype: Archetype,
  event: JourneyEvent,
  utm: Record<string, string>,
  isLanding: boolean
): string {
  if (archetype.deviceClass === 'native') {
    return event.path;
  }
  const query =
    isLanding && Object.keys(utm).length > 0
      ? `?${new URLSearchParams(utm).toString()}`
      : '';
  return `${archetype.origin}${event.path}${query}`;
}

function utmOf(
  properties: Record<string, unknown>,
  key: (typeof UTM_KEYS)[number]
): string {
  const query = properties.__query as Record<string, unknown> | undefined;
  const value = query?.[key];
  return value ? String(value) : '';
}

/** `createEvent`: every column, with the anonymous fallback `profile_id = device_id`. */
function eventRow(
  input: SessionInput,
  referrer: Referrer,
  payload: EventPayload,
  id: string
): ClickhouseEventRow {
  const { visitor, archetype } = input;
  return {
    id,
    name: payload.name,
    device_id: visitor.window.id,
    profile_id: payload.profileId || visitor.window.id,
    project_id: input.projectId,
    session_id: input.id,
    properties: toDots(payload.properties),
    path: payload.path,
    origin: payload.origin,
    created_at: toClickhouseDateTime(payload.createdAt),
    country: visitor.geo.country,
    city: visitor.geo.city,
    region: visitor.geo.region,
    longitude: visitor.geo.longitude,
    latitude: visitor.geo.latitude,
    os: visitor.device.os ?? '',
    os_version: visitor.device.osVersion ?? '',
    browser: visitor.device.browser ?? '',
    browser_version: visitor.device.browserVersion ?? '',
    device: visitor.device.device ?? '',
    brand: visitor.device.brand ?? '',
    model: visitor.device.model ?? '',
    duration: payload.duration,
    referrer: referrer.url,
    referrer_name: referrer.name,
    referrer_type: referrer.type,
    imported_at: null,
    inserted_at: toClickhouseDateTime(new Date()),
    sdk_name: archetype.sdk.name,
    sdk_version: archetype.sdk.version,
    revenue: payload.revenue,
    groups: [],
  };
}

/** The session buffer's `newSession`. */
function openSession(
  input: SessionInput,
  referrer: Referrer,
  first: EventPayload
): ClickhouseSessionRow {
  const { visitor } = input;
  const createdAt = toClickhouseDateTime(first.createdAt);
  const isScreenView = first.name === 'screen_view';
  return {
    id: input.id,
    project_id: input.projectId,
    device_id: visitor.window.id,
    profile_id: first.profileId || visitor.window.id,
    is_bounce: true,
    created_at: createdAt,
    ended_at: createdAt,
    event_count: isScreenView ? 0 : 1,
    screen_view_count: isScreenView ? 1 : 0,
    entry_path: first.path,
    entry_origin: first.origin,
    exit_path: first.path,
    exit_origin: first.origin,
    revenue: first.name === 'revenue' ? (first.revenue ?? 0) : 0,
    referrer: referrer.url,
    referrer_name: referrer.name,
    referrer_type: referrer.type,
    os: visitor.device.os ?? '',
    os_version: visitor.device.osVersion ?? '',
    browser: visitor.device.browser ?? '',
    browser_version: visitor.device.browserVersion ?? '',
    device: visitor.device.device ?? '',
    brand: visitor.device.brand ?? '',
    model: visitor.device.model ?? '',
    country: visitor.geo.country,
    region: visitor.geo.region,
    city: visitor.geo.city,
    longitude: visitor.geo.longitude,
    latitude: visitor.geo.latitude,
    duration: first.duration,
    utm_medium: utmOf(first.properties, 'utm_medium'),
    utm_source: utmOf(first.properties, 'utm_source'),
    utm_campaign: utmOf(first.properties, 'utm_campaign'),
    utm_content: utmOf(first.properties, 'utm_content'),
    utm_term: utmOf(first.properties, 'utm_term'),
    groups: [],
    sign: 1,
    version: 1,
  };
}

/** The session buffer's `extendSession`, for events that arrive in order. */
function extendSession(
  session: ClickhouseSessionRow,
  payload: EventPayload,
  deviceId: string
): void {
  session.version += 1;
  session.ended_at = toClickhouseDateTime(payload.createdAt);
  if (payload.path) {
    session.exit_path = payload.path;
  }
  if (payload.origin) {
    session.exit_origin = payload.origin;
  }
  if (!session.entry_path && payload.path) {
    session.entry_path = payload.path;
  }
  if (!session.entry_origin && payload.origin) {
    session.entry_origin = payload.origin;
  }
  session.duration =
    payload.createdAt.getTime() - new Date(`${session.created_at}Z`).getTime();
  if (payload.name === 'revenue') {
    session.revenue += payload.revenue ?? 0;
  }
  if (payload.name === 'screen_view' && payload.path) {
    session.screen_view_count += 1;
  } else {
    session.event_count += 1;
  }
  if (session.screen_view_count > 1) {
    session.is_bounce = false;
  }
  if (payload.profileId && payload.profileId !== deviceId) {
    session.profile_id = payload.profileId;
  }
}

export function buildSessionRows(rng: Rng, input: SessionInput): SessionRows {
  const { archetype, visitor, utm } = input;
  const payloads: EventPayload[] = [];
  let referrer: Referrer = { url: '', name: '', type: '' };

  for (const [index, event] of input.events.entries()) {
    const isLanding = index === 0;
    const { path, origin, query, hash } = parsePath(
      eventUrl(archetype, event, utm, isLanding)
    );
    if (isLanding) {
      referrer = sessionReferrer(input.referrer, query);
    }
    payloads.push({
      name: event.name,
      profileId: event.person?.id ?? '',
      createdAt: event.at,
      path,
      origin,
      // `__path` / `__referrer` never reach the row; `__hash` and `__query` are added by the handler.
      properties: {
        ...event.properties,
        __title: event.title || undefined,
        __hash: hash,
        __query: query,
      },
      duration: 0,
      revenue: event.name === 'revenue' ? event.revenue : undefined,
    });
  }

  const first = payloads[0];
  const last = payloads.at(-1);
  if (!(first && last)) {
    throw new Error('A session needs at least one event');
  }

  const session = openSession(input, referrer, first);
  for (const payload of payloads.slice(1)) {
    extendSession(session, payload, visitor.window.id);
  }

  const endedAt = new Date(last.createdAt.getTime());
  const sessionStart: EventPayload = {
    ...first,
    name: 'session_start',
    createdAt: new Date(first.createdAt.getTime() - SESSION_START_OFFSET_MS),
  };
  const sessionEnd: EventPayload = {
    ...last,
    name: 'session_end',
    properties: { ...last.properties, __bounce: session.is_bounce },
    duration: session.duration,
    path: session.exit_path,
    createdAt: new Date(endedAt.getTime() + SESSION_END_OFFSET_MS),
    profileId: session.profile_id,
  };

  visitor.lastPath = first.path;
  visitor.lastReferrer = referrer;

  return {
    events: [sessionStart, ...payloads, sessionEnd].map((payload) =>
      eventRow(input, referrer, payload, rng.uuid())
    ),
    session,
    endedAt,
    identified: last.profileId !== '',
    anonymousEvents: payloads.some((payload) => payload.profileId === ''),
  };
}

/** The properties `createEvent` snapshots onto a profile at a session boundary. */
function profileSnapshot(visitor: Visitor): Record<string, string> {
  const snapshot: Record<string, string | number | null | undefined> = {
    path: visitor.lastPath,
    country: visitor.geo.country,
    city: visitor.geo.city,
    region: visitor.geo.region,
    longitude: visitor.geo.longitude,
    latitude: visitor.geo.latitude,
    os: visitor.device.os,
    os_version: visitor.device.osVersion,
    browser: visitor.device.browser,
    browser_version: visitor.device.browserVersion,
    device: visitor.device.device,
    brand: visitor.device.brand,
    model: visitor.device.model,
    referrer: visitor.lastReferrer?.url,
    referrer_name: visitor.lastReferrer?.name,
    referrer_type: visitor.lastReferrer?.type,
  };
  const properties: Record<string, string> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (value !== undefined && value !== null && value !== '') {
      properties[key] = String(value);
    }
  }
  return properties;
}

/** The anonymous profile a device window leaves behind (`profile_id = device_id`). */
export function deviceProfileRow(
  visitor: Visitor,
  projectId: string
): ClickhouseProfileRow {
  return {
    id: visitor.window.id,
    first_name: '',
    last_name: '',
    email: '',
    avatar: '',
    is_external: false,
    properties: profileSnapshot(visitor),
    project_id: projectId,
    created_at: toClickhouseDateTime(visitor.window.firstSeen),
    last_seen_at: toClickhouseDateTime(visitor.window.lastSeen),
    groups: [],
  };
}

/** The identified person's profile: name, email, avatar and the archetype's person properties. */
export function personProfileRow(
  visitor: Visitor,
  projectId: string
): ClickhouseProfileRow {
  if (!visitor.person) {
    throw new Error('personProfileRow needs an identified visitor');
  }
  return {
    id: visitor.person.id,
    first_name: visitor.person.firstName,
    last_name: visitor.person.lastName,
    email: visitor.person.email,
    avatar: visitor.person.avatar,
    is_external: true,
    properties: { ...profileSnapshot(visitor), ...visitor.person.properties },
    project_id: projectId,
    created_at: toClickhouseDateTime(visitor.firstSeen),
    last_seen_at: toClickhouseDateTime(visitor.lastSeen),
    groups: [],
  };
}
