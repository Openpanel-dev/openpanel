import type { IChartEventFilter, IInterval } from '@openpanel/validation';
import {
  TABLE_NAMES,
  ch,
  convertClickhouseDateToJs,
} from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { overviewService } from './overview.service';

// Spike detection thresholds. Conservative defaults — markers should be rare
// and obviously meaningful when they appear. Tune here if real usage shows
// too many / too few annotations.
const MIN_SESSIONS_FLOOR = 10;
const RATIO_MULTIPLIER = 3;
const P75_MULTIPLIER = 2;
const MIN_SHARE = 0.15;
const MIN_BUCKETS_FOR_BASELINE = 5;
const MAX_REFERRERS = 50;
const MAX_OTHERS_IN_TOOLTIP = 3;
// Hard cap as a safety bound. The relative filter below usually keeps the
// return count well under this for any real project.
const MAX_SPIKE_BUCKETS = 30;
// Relative "stand-out" filter: only return spikes whose score sits above
// `median(scores) * SIGNIFICANCE_MULTIPLIER`. Self-adjusting — if every
// candidate has a similar score (median is high), most get filtered out;
// if one clearly dominates (median is low), it passes easily.
const SIGNIFICANCE_MULTIPLIER = 1.5;
// Skip the relative filter when we have very few candidates — at low N
// the median is unstable and everything is "notable" anyway.
const MIN_CANDIDATES_FOR_RELATIVE_FILTER = 4;

export interface ReferrerSpike {
  /** Bucket start, ISO string. Frontend reformats to match overview.stats series. */
  date: string;
  referrer_name: string;
  sessions: number;
  /** Median sessions per bucket for this referrer in the range. 0 when isNew. */
  baseline: number;
  /** sessions / max(baseline, 1). For isNew, equals sessions. */
  ratio: number;
  /** This referrer's fraction of total sessions in this bucket (0..1). */
  share: number;
  /** True when the referrer only appears in this single bucket across the range. */
  isNew: boolean;
  /** Secondary spikes that hit on the same bucket, ranked by score. */
  others: Array<{ referrer_name: string; sessions: number; ratio: number }>;
}

/**
 * One bucket's worth of spike data. The wire format keeps the cluster
 * shape (anchorDate + spikes array) for forward-compatibility, but the
 * backend no longer groups across buckets — every entry has
 * `spikes.length === 1`. Visual density grouping happens on the frontend,
 * where the live `xScale` knows actual pixel distances and the right
 * threshold doesn't depend on the chosen interval.
 */
export interface ReferrerSpikeCluster {
  /** Bucket date — used to position the marker. */
  anchorDate: string;
  /** Spikes for this bucket. Currently always length 1; shape kept for forward-compat. */
  spikes: ReferrerSpike[];
}

export interface GetReferrerSpikesInput {
  projectId: string;
  filters: IChartEventFilter[];
  startDate: string;
  endDate: string;
  interval: IInterval;
  timezone: string;
}

export async function getReferrerSpikes(
  input: GetReferrerSpikesInput,
): Promise<ReferrerSpikeCluster[]> {
  const { projectId, filters, startDate, endDate, interval, timezone } = input;
  const filtersWhere = overviewService.getRawWhereClause('sessions', filters);

  // Step 1: top non-direct referrers by total range volume. Bounds the
  // expensive per-bucket query — long-tail referrers can't produce
  // meaningful spikes anyway because they fail the absolute floor.
  const topReferrers = await clix(ch, timezone)
    .select<{ referrer_name: string; total: number }>([
      'referrer_name',
      'sum(sign) AS total',
    ])
    .from(TABLE_NAMES.sessions, true)
    .where('project_id', '=', projectId)
    .where('created_at', 'BETWEEN', [
      clix.datetime(startDate, 'toDateTime'),
      clix.datetime(endDate, 'toDateTime'),
    ])
    .where('referrer_name', '!=', '')
    .where('referrer_name', 'IS NOT NULL')
    .rawWhere(filtersWhere)
    .groupBy(['referrer_name'])
    .having('sum(sign)', '>=', MIN_SESSIONS_FLOOR)
    .orderBy('total', 'DESC')
    .limit(MAX_REFERRERS)
    .execute();

  if (topReferrers.length === 0) {
    return [];
  }

  const referrerNames = topReferrers.map((r) => r.referrer_name);

  // Step 2: per-bucket sessions for top referrers + bucket totals (including
  // direct traffic) for the share-of-bucket denominator. Run in parallel.
  const [spikeRows, bucketTotalRows] = await Promise.all([
    clix(ch, timezone)
      .select<{ date: string; referrer_name: string; sessions: number }>([
        `${clix.toStartOf('created_at', interval as any, timezone)} AS date`,
        'referrer_name',
        'sum(sign) AS sessions',
      ])
      .from(TABLE_NAMES.sessions, true)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .where('referrer_name', 'IN', referrerNames)
      .rawWhere(filtersWhere)
      .groupBy(['date', 'referrer_name'])
      .having('sum(sign)', '>', 0)
      .orderBy('date', 'ASC')
      .transform({
        date: (item) => convertClickhouseDateToJs(item.date).toISOString(),
      })
      .execute(),

    clix(ch, timezone)
      .select<{ date: string; total: number }>([
        `${clix.toStartOf('created_at', interval as any, timezone)} AS date`,
        'sum(sign) AS total',
      ])
      .from(TABLE_NAMES.sessions, true)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(filtersWhere)
      .groupBy(['date'])
      .having('sum(sign)', '>', 0)
      .transform({
        date: (item) => convertClickhouseDateToJs(item.date).toISOString(),
      })
      .execute(),
  ]);

  // Bail when the range doesn't have enough buckets to form a stable baseline.
  // Median over <5 points is meaningless and produces noisy spikes.
  const bucketCount = new Set(bucketTotalRows.map((r) => r.date)).size;
  if (bucketCount < MIN_BUCKETS_FOR_BASELINE) {
    return [];
  }

  const bucketTotalByDate = new Map(
    bucketTotalRows.map((r) => [r.date, r.total]),
  );

  const rowsByReferrer = new Map<
    string,
    Array<{ date: string; sessions: number }>
  >();
  for (const row of spikeRows) {
    const arr = rowsByReferrer.get(row.referrer_name) ?? [];
    arr.push({ date: row.date, sessions: row.sessions });
    rowsByReferrer.set(row.referrer_name, arr);
  }

  interface Candidate {
    date: string;
    referrer_name: string;
    sessions: number;
    baseline: number;
    ratio: number;
    share: number;
    isNew: boolean;
    score: number;
  }
  const candidates: Candidate[] = [];

  for (const [referrer, rows] of rowsByReferrer) {
    const sorted = rows.map((r) => r.sessions).sort((a, b) => a - b);
    const isNewReferrer = sorted.length === 1;
    const median = percentile(sorted, 0.5);
    const p75 = percentile(sorted, 0.75);
    const ratioThreshold = Math.max(
      median * RATIO_MULTIPLIER,
      p75 * P75_MULTIPLIER,
    );

    for (const row of rows) {
      if (row.sessions < MIN_SESSIONS_FLOOR) continue;

      const total = bucketTotalByDate.get(row.date) ?? row.sessions;
      const share = total > 0 ? row.sessions / total : 0;
      if (share < MIN_SHARE) continue;

      const baseline = isNewReferrer ? 0 : median;
      const ratio = isNewReferrer
        ? row.sessions
        : row.sessions / Math.max(median, 1);

      const isSpike = isNewReferrer || row.sessions >= ratioThreshold;
      if (!isSpike) continue;

      candidates.push({
        date: row.date,
        referrer_name: referrer,
        sessions: row.sessions,
        baseline,
        ratio,
        share,
        isNew: isNewReferrer,
        score: ratio * share,
      });
    }
  }

  const byBucket = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const arr = byBucket.get(c.date) ?? [];
    arr.push(c);
    byBucket.set(c.date, arr);
  }

  // Per-bucket: pick the top-scoring referrer as the bucket's spike, keep
  // a few secondary ones for the tooltip's "+ also" line.
  interface PerBucketSpike {
    date: string;
    top: Candidate;
    others: Candidate[];
  }
  const perBucketSpikes: PerBucketSpike[] = [];
  for (const [date, arr] of byBucket) {
    arr.sort((a, b) => b.score - a.score);
    const top = arr[0];
    if (!top) continue;
    perBucketSpikes.push({
      date,
      top,
      others: arr.slice(1, 1 + MAX_OTHERS_IN_TOOLTIP),
    });
  }

  // Relative "stand-out" filter. Drops spikes whose scores cluster near the
  // typical spike score in this range — those aren't really notable
  // relative to everything else happening, even though they cleared the
  // absolute floors. Always keeps the top spike as a fallback so we never
  // return zero when there's at least one candidate.
  perBucketSpikes.sort((a, b) => b.top.score - a.top.score);

  let filtered = perBucketSpikes;
  if (perBucketSpikes.length >= MIN_CANDIDATES_FOR_RELATIVE_FILTER) {
    const sortedScoresAsc = perBucketSpikes
      .map((s) => s.top.score)
      .sort((a, b) => a - b);
    const medianScore = percentile(sortedScoresAsc, 0.5);
    const threshold = medianScore * SIGNIFICANCE_MULTIPLIER;
    const standouts = perBucketSpikes.filter((s) => s.top.score > threshold);
    filtered = standouts.length > 0 ? standouts : perBucketSpikes.slice(0, 1);
  }

  const capped = filtered.slice(0, MAX_SPIKE_BUCKETS);
  capped.sort((a, b) => a.date.localeCompare(b.date));

  return capped.map(({ date, top, others }) => ({
    anchorDate: date,
    spikes: [
      {
        date,
        referrer_name: top.referrer_name,
        sessions: top.sessions,
        baseline: round(top.baseline, 2),
        ratio: round(top.ratio, 2),
        share: round(top.share, 4),
        isNew: top.isNew,
        others: others.map((o) => ({
          referrer_name: o.referrer_name,
          sessions: o.sessions,
          ratio: round(o.ratio, 2),
        })),
      },
    ],
  }));
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! * (hi - idx) + sortedAsc[hi]! * (idx - lo);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
