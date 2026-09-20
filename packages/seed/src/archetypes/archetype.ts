import type { ReferrerMix } from '../data/referrers';
import type { Person, Visitor } from '../model';
import type { Rng } from '../rng';
import type { TrafficShape } from '../traffic';

export type ArchetypeId = 'website' | 'saas' | 'ecommerce' | 'app';

export type ProjectType = 'website' | 'app' | 'backend';

/**
 * Share of a cohort that comes back after n days. Piecewise exponential
 * between the points; `sameDay` is a second visit within the first day.
 */
export interface RetentionCurve {
  sameDay: number;
  day1: number;
  day7: number;
  day30: number;
}

export interface SeedFunnel {
  name: string;
  steps: readonly string[];
  /** Properties worth breaking the funnel down by. */
  breakdowns: readonly string[];
}

export interface Archetype {
  id: ArchetypeId;
  projectName: string;
  /** The site the events come from; `''` for a native app (screens are named routes). */
  origin: string;
  domain: string | null;
  types: ProjectType[];
  sdk: { name: string; version: string };
  shape: TrafficShape;
  /** This project's share of the run's sessions per day. */
  trafficShare: number;
  /** Share of sessions that come from a visitor seen before. */
  returningShare: number;
  retention: RetentionCurve;
  /** Relative likelihood that this visitor is the one who comes back; 1 is the baseline. */
  stickiness(visitor: Visitor): number;
  mobileShare: number;
  deviceClass: 'web' | 'native';
  referrers: ReferrerMix;
  campaignChance: number;
  dwellMedianSeconds: number;
  /** Shifts the hourly curve so a European site peaks in European daytime. */
  utcOffsetHours: number;
  /** The person behind a visitor who will identify at some point; null for a never-identified one. */
  newPerson(rng: Rng): Person | null;
  /** One line on who gets identified and when, for `.seed.json`. */
  identity: string;
  /** Events the dashboard should treat as conversions (`EventMeta.conversion`). */
  conversions: readonly string[];
  /** The funnels this project's data is built to show, for `.seed.json` and whoever builds reports. */
  funnels: readonly SeedFunnel[];
  journey(rng: Rng, journey: Journey, visitor: Visitor): void;
}

const CUSTOM_EVENT_GAP_MEDIAN_SECONDS = 3;
const CUSTOM_EVENT_GAP_SIGMA = 0.7;
const REVENUE_GAP_MEDIAN_SECONDS = 2;
const REVENUE_GAP_SIGMA = 0.5;
const DWELL_SIGMA = 0.8;
const MS_PER_SECOND = 1000;

export interface JourneyEvent {
  name: string;
  path: string;
  title: string;
  at: Date;
  properties: Record<string, unknown>;
  revenue?: number;
  /** Who the event belongs to once identified; null while anonymous. */
  person: Person | null;
}

/** Appends events while advancing a clock, so timestamps read like a person browsing. */
export class Journey {
  readonly events: JourneyEvent[] = [];
  private cursor: Date;
  private person: Person | null;

  constructor(
    private readonly rng: Rng,
    start: Date,
    private readonly dwellMedianSeconds: number,
    person: Person | null
  ) {
    this.cursor = start;
    this.person = person;
  }

  get identified(): Person | null {
    return this.person;
  }

  /** From here on events carry this person; what `op.identify()` does in the SDK. */
  identify(person: Person): void {
    this.person = person;
  }

  view(
    path: string,
    title: string,
    properties: Record<string, unknown> = {}
  ): void {
    this.events.push({
      name: 'screen_view',
      path,
      title,
      at: this.cursor,
      properties,
      person: this.person,
    });
    this.advance(
      this.rng.logNormalSeconds(this.dwellMedianSeconds, DWELL_SIGMA)
    );
  }

  event(name: string, properties: Record<string, unknown> = {}): void {
    this.advance(
      this.rng.logNormalSeconds(
        CUSTOM_EVENT_GAP_MEDIAN_SECONDS,
        CUSTOM_EVENT_GAP_SIGMA
      )
    );
    this.events.push({
      name,
      ...this.currentScreen(),
      at: this.cursor,
      properties,
      person: this.person,
    });
  }

  /** Amount in whole currency units, integer: `events.revenue` is UInt64. */
  revenue(amount: number, properties: Record<string, unknown> = {}): void {
    this.advance(
      this.rng.logNormalSeconds(REVENUE_GAP_MEDIAN_SECONDS, REVENUE_GAP_SIGMA)
    );
    this.events.push({
      name: 'revenue',
      ...this.currentScreen(),
      at: this.cursor,
      properties,
      revenue: amount,
      person: this.person,
    });
  }

  private advance(seconds: number): void {
    this.cursor = new Date(
      this.cursor.getTime() + Math.round(seconds * MS_PER_SECOND)
    );
  }

  private currentScreen(): { path: string; title: string } {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      if (event?.name === 'screen_view') {
        return { path: event.path, title: event.title };
      }
    }
    return { path: '', title: '' };
  }
}
