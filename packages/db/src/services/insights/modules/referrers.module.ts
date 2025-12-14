import { TABLE_NAMES } from '../../../clickhouse/client';
import { clix } from '../../../clickhouse/query-builder';
import { normalizeReferrer } from '../normalize';
import type { ComputeResult, InsightModule, RenderedCard } from '../types';
import {
  computeChangePct,
  computeDirection,
  computeWeekdayMedians,
  getEndOfDay,
  getWeekday,
} from '../utils';

export const referrersModule: InsightModule = {
  key: 'referrers',
  cadence: ['daily'],
  windows: ['yesterday', 'rolling_7d', 'rolling_30d'],
  thresholds: { minTotal: 100, minAbsDelta: 20, minPct: 0.15, maxDims: 50 },

  async enumerateDimensions(ctx) {
    // Query top referrers from BOTH current and baseline windows
    // This allows detecting new sources that didn't exist in baseline
    const [currentResults, baselineResults] = await Promise.all([
      clix(ctx.db)
        .select<{ referrer_name: string; cnt: number }>([
          'referrer_name',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.start,
          getEndOfDay(ctx.window.end),
        ])
        .groupBy(['referrer_name'])
        .orderBy('cnt', 'DESC')
        .limit(this.thresholds?.maxDims ?? 50)
        .execute(),
      clix(ctx.db)
        .select<{ referrer_name: string; cnt: number }>([
          'referrer_name',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['referrer_name'])
        .orderBy('cnt', 'DESC')
        .limit(this.thresholds?.maxDims ?? 50)
        .execute(),
    ]);

    // Merge both sets to catch new/emerging sources
    const dims = new Set<string>();
    for (const r of currentResults) {
      dims.add(`referrer:${normalizeReferrer(r.referrer_name || 'direct')}`);
    }
    for (const r of baselineResults) {
      dims.add(`referrer:${normalizeReferrer(r.referrer_name || 'direct')}`);
    }

    return Array.from(dims);
  },

  async computeMany(ctx, dimensionKeys): Promise<ComputeResult[]> {
    // Single query for ALL current values (batched)
    const currentResults = await clix(ctx.db)
      .select<{ referrer_name: string; cnt: number }>([
        'referrer_name',
        'count(*) as cnt',
      ])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', ctx.projectId)
      .where('sign', '=', 1)
      .where('created_at', 'BETWEEN', [
        ctx.window.start,
        getEndOfDay(ctx.window.end),
      ])
      .groupBy(['referrer_name'])
      .execute();

    // Build current lookup map
    const currentMap = new Map<string, number>();
    for (const r of currentResults) {
      const key = normalizeReferrer(r.referrer_name || 'direct');
      currentMap.set(key, (currentMap.get(key) ?? 0) + Number(r.cnt ?? 0));
    }

    // Single query for baseline (with date breakdown for weekday median if needed)
    let baselineMap: Map<string, number>;

    if (ctx.window.kind === 'yesterday') {
      // Need daily breakdown for weekday median calculation
      const baselineResults = await clix(ctx.db)
        .select<{ date: string; referrer_name: string; cnt: number }>([
          'toDate(created_at) as date',
          'referrer_name',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['date', 'referrer_name'])
        .execute();

      const targetWeekday = getWeekday(ctx.window.start);
      baselineMap = computeWeekdayMedians(baselineResults, targetWeekday, (r) =>
        normalizeReferrer(r.referrer_name || 'direct'),
      );
    } else {
      // Rolling windows: simple aggregate
      const baselineResults = await clix(ctx.db)
        .select<{ referrer_name: string; cnt: number }>([
          'referrer_name',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['referrer_name'])
        .execute();

      baselineMap = new Map<string, number>();
      for (const r of baselineResults) {
        const key = normalizeReferrer(r.referrer_name || 'direct');
        baselineMap.set(key, (baselineMap.get(key) ?? 0) + Number(r.cnt ?? 0));
      }
    }

    // Build results from maps (in memory, no more queries!)
    const results: ComputeResult[] = [];

    for (const dimKey of dimensionKeys) {
      if (!dimKey.startsWith('referrer:')) continue;
      const referrerName = dimKey.replace('referrer:', '');

      const currentValue = currentMap.get(referrerName) ?? 0;
      const compareValue = baselineMap.get(referrerName) ?? 0;
      const changePct = computeChangePct(currentValue, compareValue);
      const direction = computeDirection(changePct);

      results.push({
        ok: true,
        dimensionKey: dimKey,
        currentValue,
        compareValue,
        changePct,
        direction,
        extra: {
          isNew: compareValue === 0 && currentValue > 0,
          isGone: currentValue === 0 && compareValue > 0,
        },
      });
    }

    return results;
  },

  render(result, ctx): RenderedCard {
    const referrer = result.dimensionKey.replace('referrer:', '');
    const pct = ((result.changePct ?? 0) * 100).toFixed(1);
    const isIncrease = (result.changePct ?? 0) >= 0;
    const isNew = result.extra?.isNew as boolean | undefined;

    const title = isNew
      ? `New traffic source: ${referrer}`
      : `Traffic from ${referrer} ${isIncrease ? '↑' : '↓'} ${Math.abs(Number(pct))}%`;

    return {
      kind: 'insight_v1',
      title,
      summary: `${ctx.window.label}. Sessions ${result.currentValue ?? 0} vs ${result.compareValue ?? 0}.`,
      primaryDimension: {
        type: 'referrer',
        key: referrer,
        displayName: referrer,
      },
      tags: [
        'referrers',
        ctx.window.kind,
        isNew ? 'new' : isIncrease ? 'increase' : 'decrease',
      ],
      metric: 'sessions',
      extra: {
        isNew: result.extra?.isNew,
        isGone: result.extra?.isGone,
      },
    };
  },
};
