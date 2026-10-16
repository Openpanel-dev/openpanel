// The in-memory shapes the generator produces before they become ClickHouse rows.

import type { parseUserAgent } from '@openpanel/shared/server';

export type ParsedDevice = ReturnType<typeof parseUserAgent>;

export interface Geo {
  ip: string;
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
  properties: Record<string, string>;
}

export interface Referrer {
  url: string;
  name: string;
  type: string;
}

/**
 * The device id ingest mints from user agent + IP + a salt that rotates at
 * midnight UTC: the same browser is one device within a UTC day and a new
 * one the next. Anonymous analytics only ever sees these.
 */
export interface DeviceWindow {
  id: string;
  /** The UTC day this id is valid for. */
  day: string;
  firstSeen: Date;
  lastSeen: Date;
  /** Whether any event was sent anonymously from it, which is what leaves a profile behind. */
  anonymousEvents: boolean;
}

/** A person (or an unidentified browser) that can come back. */
export interface Visitor {
  userAgent: string;
  device: ParsedDevice;
  geo: Geo;
  person: Person | null;
  /** `identify()` has been sent once, so later sessions start identified. */
  identified: boolean;
  window: DeviceWindow;
  /** Days since the run's first day, for retention cohorts. */
  cohortDay: number;
  sessions: number;
  firstSeen: Date;
  lastSeen: Date;
  /** What the worker snapshots onto the profile at each session boundary. */
  lastPath: string;
  lastReferrer: Referrer | null;
  /** Archetype-specific memory (plan, cart, ...). */
  state: Record<string, unknown>;
}
