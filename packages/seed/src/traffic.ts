// Turns an archetype's shape (hourly curve, weekday curve) into visitor counts
// per day and per hour. Ported from openpanel-mock's opmock/internal/traffic.
//
// The daily multiplier is a product of:
//   trend    slow growth/decline, anchored so "today" == 1.0
//   walk     a mean-reverting random walk across days (weeks drift)
//   weekday  the archetype's day-of-week curve
//   noise    small independent per-day jitter
//   anomaly  rare spike or dip days
// Everything is a pure function of (seed, key, day), so seeding twice gives
// the same curve.

import { Rng } from './rng';

export interface TrafficShape {
  /** Relative weight of each local hour, 0..23; scale is irrelevant. */
  hourly: readonly number[];
  /** Multiplies the daily total; index 0 = Sunday. */
  dayOfWeek: readonly number[];
  /** Fractional growth per week, e.g. 0.02 = +2 %/week, relative to today. */
  trendPerWeek: number;
  spikeChance: number;
  dipChance: number;
  spikeRange: readonly [number, number];
  dipRange: readonly [number, number];
}

export interface TrafficParams {
  seed: string;
  /** 0 = perfectly regular, 1 = lively, > 1 = chaotic. */
  variance: number;
  now: Date;
}

export interface Anomaly {
  kind: 'none' | 'spike' | 'dip';
  multiplier: number;
}

export interface TrafficDay {
  date: Date;
  visitors: number;
  weekday: number;
  trend: number;
  walk: number;
  noise: number;
  anomaly: Anomaly;
  multiplier: number;
}

const MS_PER_DAY = 86_400_000;
const HOURS_PER_DAY = 24;
/** An arbitrary fixed anchor so any day's walk value is computable on its own. */
const WALK_EPOCH_DAY = Date.UTC(2020, 0, 1);
const WALK_MEAN_REVERSION = 0.9;
const WALK_SIGMA = 0.1;
const WALK_MIN = 0.35;
const WALK_MAX = 3;
const NOISE_SIGMA = 0.06;
const NOISE_MIN = 0.5;
const HOUR_JITTER_SIGMA = 0.12;
const HOUR_JITTER_MIN = 0.2;
const MAX_ANOMALY_VARIANCE = 2;

function dayIndex(date: Date): number {
  const midnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return Math.floor((midnight - WALK_EPOCH_DAY) / MS_PER_DAY);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class TrafficModel {
  private walk: number[] = [];

  constructor(
    private readonly key: string,
    private readonly shape: TrafficShape,
    private readonly params: TrafficParams
  ) {}

  private rng(salt: string, day: Date): Rng {
    return new Rng(`${this.params.seed}/${this.key}/${salt}/${isoDay(day)}`);
  }

  /** AR(1): w[i] = 0.9·w[i-1] + N(0, σ), replayed from the epoch and cached. */
  private walkAt(index: number): number {
    if (index < 0) {
      return 0;
    }
    if (index < this.walk.length) {
      return this.walk[index] ?? 0;
    }
    const rng = new Rng(`${this.params.seed}/${this.key}/walk`);
    const sigma = WALK_SIGMA * this.params.variance;
    this.walk = [];
    let value = 0;
    for (let i = 0; i <= index; i++) {
      value = WALK_MEAN_REVERSION * value + rng.normal() * sigma;
      this.walk.push(value);
    }
    return this.walk[index] ?? 0;
  }

  private anomaly(day: Date): Anomaly {
    const rng = this.rng('anomaly', day);
    const roll = rng.float();
    const variance = Math.min(this.params.variance, MAX_ANOMALY_VARIANCE);
    if (roll < this.shape.spikeChance * variance) {
      const [low, high] = this.shape.spikeRange;
      return { kind: 'spike', multiplier: low + rng.float() * (high - low) };
    }
    if (roll < (this.shape.spikeChance + this.shape.dipChance) * variance) {
      const [low, high] = this.shape.dipRange;
      return { kind: 'dip', multiplier: low + rng.float() * (high - low) };
    }
    return { kind: 'none', multiplier: 1 };
  }

  dayFor(day: Date, baseVisitors: number): TrafficDay {
    const index = dayIndex(day);
    const weeksFromNow = (index - dayIndex(this.params.now)) / 7;
    const trend = (1 + this.shape.trendPerWeek) ** weeksFromNow;
    const walk = Math.min(
      WALK_MAX,
      Math.max(WALK_MIN, Math.exp(this.walkAt(index)))
    );
    const noise = Math.max(
      NOISE_MIN,
      1 + this.rng('noise', day).normal() * NOISE_SIGMA * this.params.variance
    );
    const weekday = this.shape.dayOfWeek[day.getUTCDay()] ?? 1;
    const anomaly = this.anomaly(day);
    const multiplier = trend * walk * noise * weekday * anomaly.multiplier;
    return {
      date: day,
      visitors: Math.round(baseVisitors * multiplier),
      weekday,
      trend,
      walk,
      noise,
      anomaly,
      multiplier,
    };
  }

  /** Fraction of a day's visitors per hour, with a little per-day jitter on the curve. */
  hourWeights(day: Date): number[] {
    const rng = this.rng('hours', day);
    const weights: number[] = [];
    let sum = 0;
    for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
      const jitter = Math.max(
        HOUR_JITTER_MIN,
        1 + rng.normal() * HOUR_JITTER_SIGMA * this.params.variance
      );
      const weight = (this.shape.hourly[hour] ?? 0) * jitter;
      weights.push(weight);
      sum += weight;
    }
    return weights.map((weight) => weight / sum);
  }
}
