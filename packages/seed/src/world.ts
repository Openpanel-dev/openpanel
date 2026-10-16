// Per-project population: who comes back, and as whom. Visitors live in
// cohorts by first-seen day; a returning session picks a cohort through the
// archetype's retention curve, then a visitor through its stickiness. The
// device id rotates at UTC midnight like ingest's salted id, so anonymous
// traffic is only recognised within a day while identified people persist.
// Bounded: the oldest cohort is dropped when the pool is full, which is what
// lets profiles be written exactly once.

import { parseUserAgent } from '@openpanel/shared/server';
import type { Archetype, RetentionCurve } from './archetypes/archetype';
import type { ClickhouseProfileRow } from './clickhouse-rows';
import {
  DESKTOP_USER_AGENTS,
  MOBILE_USER_AGENTS,
  NATIVE_APP_USER_AGENTS,
} from './data/devices';
import { newGeo } from './data/geo';
import type { DeviceWindow, ParsedDevice, Visitor } from './model';
import type { Rng, Weighted } from './rng';
import { deviceProfileRow, personProfileRow } from './rows';
import { VISITOR_POOL_SIZE } from './seed.constants';

const DEVICE_ID_HEX_CHARS = 32;
const MS_PER_DAY = 86_400_000;
/** How many candidates a returning pick tries before settling for the last one. */
const STICKINESS_ATTEMPTS = 6;
const MAX_STICKINESS = 4;

const parsedDevices = new Map<string, ParsedDevice>();

function parseDevice(userAgent: string): ParsedDevice {
  let parsed = parsedDevices.get(userAgent);
  if (!parsed) {
    parsed = parseUserAgent(userAgent);
    parsedDevices.set(userAgent, parsed);
  }
  return parsed;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Share of a cohort active `days` after its first day, interpolated on a log scale. */
export function retentionAt(curve: RetentionCurve, days: number): number {
  if (days <= 0) {
    return curve.sameDay;
  }
  const points: [number, number][] = [
    [1, curve.day1],
    [7, curve.day7],
    [30, curve.day30],
  ];
  for (let i = 0; i < points.length - 1; i++) {
    const [fromDay, fromValue] = points[i] as [number, number];
    const [toDay, toValue] = points[i + 1] as [number, number];
    if (days <= toDay) {
      const t = (days - fromDay) / (toDay - fromDay);
      return fromValue * (toValue / fromValue) ** t;
    }
  }
  // Past day 30 the 7→30 decay continues.
  const weeklyDecay = (curve.day30 / curve.day7) ** (7 / 23);
  return curve.day30 * weeklyDecay ** ((days - 30) / 7);
}

export class World {
  private readonly cohorts = new Map<number, Visitor[]>();
  private size = 0;

  constructor(
    private readonly archetype: Archetype,
    private readonly projectId: string,
    private readonly runStart: Date,
    private readonly onProfiles: (rows: ClickhouseProfileRow[]) => void
  ) {}

  private dayIndex(at: Date): number {
    return Math.floor((at.getTime() - this.runStart.getTime()) / MS_PER_DAY);
  }

  /** A returning visitor with probability `returningShare`, else a new one added to today's cohort. */
  pick(rng: Rng, at: Date): Visitor {
    const visitor =
      (this.size > 0 && rng.chance(this.archetype.returningShare)
        ? this.returning(rng, at)
        : null) ?? this.newVisitor(rng, at);
    this.rotateDevice(rng, visitor, at);
    return visitor;
  }

  private returning(rng: Rng, at: Date): Visitor | null {
    const today = this.dayIndex(at);
    const weighted: Weighted<Visitor[]>[] = [];
    for (const [day, visitors] of this.cohorts) {
      const weight =
        visitors.length * retentionAt(this.archetype.retention, today - day);
      if (weight > 0) {
        weighted.push({ value: visitors, weight });
      }
    }
    if (weighted.length === 0) {
      return null;
    }
    const cohort = rng.pick(weighted);
    let candidate: Visitor | null = null;
    for (let attempt = 0; attempt < STICKINESS_ATTEMPTS; attempt++) {
      candidate = cohort[rng.int(0, cohort.length - 1)] ?? null;
      // A visitor "in the future" relative to this session cannot be its visitor.
      if (!candidate || candidate.lastSeen.getTime() > at.getTime()) {
        candidate = null;
        continue;
      }
      if (
        rng.chance(
          Math.min(MAX_STICKINESS, this.archetype.stickiness(candidate)) /
            MAX_STICKINESS
        )
      ) {
        return candidate;
      }
    }
    return candidate;
  }

  private newVisitor(rng: Rng, at: Date): Visitor {
    const userAgent = this.pickUserAgent(rng);
    const day = this.dayIndex(at);
    const visitor: Visitor = {
      userAgent,
      device: parseDevice(userAgent),
      geo: newGeo(rng),
      person: this.archetype.newPerson(rng),
      identified: false,
      window: this.newWindow(rng, at),
      cohortDay: day,
      sessions: 0,
      firstSeen: at,
      lastSeen: at,
      lastPath: '',
      lastReferrer: null,
      state: {},
    };
    if (this.size >= VISITOR_POOL_SIZE) {
      this.dropOldestCohort();
    }
    const cohort = this.cohorts.get(day) ?? [];
    cohort.push(visitor);
    this.cohorts.set(day, cohort);
    this.size += 1;
    return visitor;
  }

  private newWindow(rng: Rng, at: Date): DeviceWindow {
    return {
      id: rng.hex(DEVICE_ID_HEX_CHARS),
      day: utcDay(at),
      firstSeen: at,
      lastSeen: at,
      anonymousEvents: false,
    };
  }

  /** A new UTC day means a new salted id; the old one's anonymous profile is final. */
  private rotateDevice(rng: Rng, visitor: Visitor, at: Date): void {
    if (visitor.window.day === utcDay(at)) {
      return;
    }
    this.flushDevice(visitor);
    visitor.window = this.newWindow(rng, at);
  }

  private flushDevice(visitor: Visitor): void {
    if (visitor.window.anonymousEvents) {
      this.onProfiles([deviceProfileRow(visitor, this.projectId)]);
    }
  }

  /** Records a finished session: who it was sent as, and when it ended. */
  touch(
    visitor: Visitor,
    end: Date,
    options: { identified: boolean; anonymousEvents: boolean }
  ): void {
    visitor.sessions += 1;
    visitor.identified ||= options.identified;
    visitor.window.anonymousEvents ||= options.anonymousEvents;
    if (end.getTime() > visitor.lastSeen.getTime()) {
      visitor.lastSeen = end;
    }
    if (end.getTime() > visitor.window.lastSeen.getTime()) {
      visitor.window.lastSeen = end;
    }
  }

  private dropOldestCohort(): void {
    const oldest = Math.min(...this.cohorts.keys());
    const visitors = this.cohorts.get(oldest) ?? [];
    this.cohorts.delete(oldest);
    this.size -= visitors.length;
    this.flushVisitors(visitors);
  }

  private flushVisitors(visitors: readonly Visitor[]): void {
    for (const visitor of visitors) {
      this.flushDevice(visitor);
      if (visitor.identified && visitor.person) {
        this.onProfiles([personProfileRow(visitor, this.projectId)]);
      }
    }
  }

  /** Writes every remaining profile; call once generation is done. */
  drain(): void {
    for (const visitors of this.cohorts.values()) {
      this.flushVisitors(visitors);
    }
    this.cohorts.clear();
    this.size = 0;
  }

  private pickUserAgent(rng: Rng): string {
    if (this.archetype.deviceClass === 'native') {
      return rng.pick(NATIVE_APP_USER_AGENTS);
    }
    return rng.pick(
      rng.chance(this.archetype.mobileShare)
        ? MOBILE_USER_AGENTS
        : DESKTOP_USER_AGENTS
    );
  }
}
