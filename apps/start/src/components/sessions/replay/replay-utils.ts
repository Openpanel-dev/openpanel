import type { IServiceEvent } from '@openpanel/core';
import { sortEventsAscending } from '../details/session-pages';

export interface ReplayRecordEvent {
  type: number;
  data: unknown;
  timestamp: number;
}

export interface EventWithOffset {
  event: IServiceEvent;
  offsetMs: number;
}

export interface PageSegment {
  id: string;
  path: string;
  origin: string;
  startMs: number;
  endMs: number;
}

export interface RageClick {
  offsetMs: number;
  clicks: number;
}

// rrweb's numeric enums (EventType, IncrementalSource, MouseInteractions).
const RRWEB_META = 4;
const RRWEB_INCREMENTAL = 3;
const SOURCE_MOUSE_MOVE = 1;
const SOURCE_MOUSE_INTERACTION = 2;
const SOURCE_SCROLL = 3;
const SOURCE_INPUT = 5;
const SOURCE_TOUCH_MOVE = 6;
const INTERACTION_CLICK = 2;
const USER_SOURCES = new Set([
  SOURCE_MOUSE_MOVE,
  SOURCE_MOUSE_INTERACTION,
  SOURCE_SCROLL,
  SOURCE_INPUT,
  SOURCE_TOUCH_MOVE,
]);

// Three clicks inside a second on roughly the same spot is the usual
// definition of a rage click (frustration with something that does not respond).
const RAGE_CLICK_MIN_CLICKS = 3;
const RAGE_CLICK_WINDOW_MS = 1000;
const RAGE_CLICK_RADIUS_PX = 30;

// Server events can land slightly before the recorder's first frame.
const EARLY_EVENT_TOLERANCE_MS = 10_000;

function toMs(date: Date | string): number {
  return date instanceof Date ? date.getTime() : new Date(date).getTime();
}

export function getEventOffsetMs(
  event: IServiceEvent,
  startTime: number
): number {
  return toMs(event.createdAt) - startTime;
}

export function sortEventsByOffset(
  events: IServiceEvent[],
  startTime: number
): EventWithOffset[] {
  const withOffsets = sortEventsAscending(events).map((event) => ({
    event,
    offsetMs: getEventOffsetMs(event, startTime),
  }));
  const isEarly = ({ offsetMs }: EventWithOffset) =>
    offsetMs < -EARLY_EVENT_TOLERANCE_MS;
  // The page the recording opened on can be viewed long before the recorder starts.
  const openingView = withOffsets
    .filter((item) => isEarly(item) && item.event.name === 'screen_view')
    .at(-1);
  return withOffsets.filter((item) => !isEarly(item) || item === openingView);
}

/** Index of the last item at or before `timeMs`, or -1 when none has happened yet. */
export function findLastIndexAtTime(
  sorted: EventWithOffset[],
  timeMs: number
): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((sorted[mid]?.offsetMs ?? 0) <= timeMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo - 1;
}

/** Each screen view owns the stretch of the recording until the next one. */
export function getPageSegments(
  sorted: EventWithOffset[],
  durationMs: number
): PageSegment[] {
  const views = sorted.filter(({ event }) => event.name === 'screen_view');
  return views.map(({ event, offsetMs }, index) => {
    const next = views[index + 1];
    return {
      id: event.id,
      path: event.path || '/',
      origin: event.origin ?? '',
      startMs: Math.max(0, offsetMs),
      endMs: Math.min(durationMs, next ? next.offsetMs : durationMs),
    };
  });
}

/** Viewport the recording started with, carried by rrweb's meta event. */
export function getRecordedDimensions(
  events: ReplayRecordEvent[]
): { width: number; height: number } | null {
  const meta = events.find((event) => event.type === RRWEB_META);
  if (
    meta &&
    typeof meta.data === 'object' &&
    meta.data !== null &&
    'width' in meta.data &&
    'height' in meta.data
  ) {
    const { width, height } = meta.data as { width: number; height: number };
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }
  return null;
}

interface IncrementalData {
  source?: number;
  type?: number;
  x?: number;
  y?: number;
}

function getIncrementalData(event: ReplayRecordEvent): IncrementalData | null {
  if (event.type !== RRWEB_INCREMENTAL) {
    return null;
  }
  if (typeof event.data !== 'object' || event.data === null) {
    return null;
  }
  return event.data as IncrementalData;
}

export function isUserInteraction(event: ReplayRecordEvent): boolean {
  const data = getIncrementalData(event);
  return data?.source !== undefined && USER_SOURCES.has(data.source);
}

export function getClick(
  event: ReplayRecordEvent
): { timestamp: number; x: number; y: number } | null {
  const data = getIncrementalData(event);
  const isClick =
    data?.source === SOURCE_MOUSE_INTERACTION &&
    data.type === INTERACTION_CLICK;
  if (!isClick) {
    return null;
  }
  return { timestamp: event.timestamp, x: data.x ?? 0, y: data.y ?? 0 };
}

/** Clicks elsewhere in between do not break a burst on one spot. */
export function detectRageClicks(
  clicks: { timestamp: number; x: number; y: number }[],
  startTime: number
): RageClick[] {
  const sorted = [...clicks].sort((a, b) => a.timestamp - b.timestamp);
  const counted = new Set<number>();
  const rageClicks: RageClick[] = [];
  for (const [index, first] of sorted.entries()) {
    if (counted.has(index)) {
      continue;
    }
    const burst = [index];
    for (let next = index + 1; next < sorted.length; next++) {
      const click = sorted[next]!;
      if (click.timestamp - first.timestamp > RAGE_CLICK_WINDOW_MS) {
        break;
      }
      const samePlace =
        Math.hypot(click.x - first.x, click.y - first.y) <=
        RAGE_CLICK_RADIUS_PX;
      if (samePlace && !counted.has(next)) {
        burst.push(next);
      }
    }
    if (burst.length >= RAGE_CLICK_MIN_CLICKS) {
      for (const member of burst) {
        counted.add(member);
      }
      rageClicks.push({
        offsetMs: first.timestamp - startTime,
        clicks: burst.length,
      });
    }
  }
  return rageClicks;
}

/** Interaction counts per bucket, normalised to 0..1 for drawing. */
export function getActivityHistogram(
  timestamps: number[],
  startTime: number,
  durationMs: number,
  buckets: number
): number[] {
  const counts = new Array<number>(buckets).fill(0);
  if (durationMs <= 0) {
    return counts;
  }
  for (const timestamp of timestamps) {
    const ratio = (timestamp - startTime) / durationMs;
    if (ratio < 0 || ratio > 1) {
      continue;
    }
    const bucket = Math.min(buckets - 1, Math.floor(ratio * buckets));
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  const max = Math.max(...counts, 1);
  // Square root keeps a single burst of mouse moves from flattening the rest.
  return counts.map((count) => Math.sqrt(count / max));
}

/** Format a duration in milliseconds as M:SS */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getEventLabel(event: IServiceEvent): string {
  if (event.name === 'screen_view' && event.path) {
    return event.path;
  }
  return event.name.replace(/_/g, ' ');
}
