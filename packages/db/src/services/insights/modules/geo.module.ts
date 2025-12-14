import { TABLE_NAMES } from '../../../clickhouse/client';
import { clix } from '../../../clickhouse/query-builder';
import type { ComputeResult, InsightModule, RenderedCard } from '../types';
import { computeWeekdayMedians, getEndOfDay, getWeekday } from '../utils';

export const geoModule: InsightModule = {
  key: 'geo',
  cadence: ['daily'],
  windows: ['yesterday', 'rolling_7d', 'rolling_30d'],
  thresholds: { minTotal: 100, minAbsDelta: 0, minPct: 0.08, maxDims: 30 },

  async enumerateDimensions(ctx) {
    // Query top countries from BOTH current and baseline windows
    const [currentResults, baselineResults] = await Promise.all([
      clix(ctx.db)
        .select<{ country: string; cnt: number }>([
          'country',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.start,
          getEndOfDay(ctx.window.end),
        ])
        .where('country', '!=', '')
        .groupBy(['country'])
        .orderBy('cnt', 'DESC')
        .limit(this.thresholds?.maxDims ?? 30)
        .execute(),
      clix(ctx.db)
        .select<{ country: string; cnt: number }>([
          'country',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .where('country', '!=', '')
        .groupBy(['country'])
        .orderBy('cnt', 'DESC')
        .limit(this.thresholds?.maxDims ?? 30)
        .execute(),
    ]);

    // Merge both sets
    const dims = new Set<string>();
    for (const r of currentResults) {
      dims.add(`country:${r.country || 'unknown'}`);
    }
    for (const r of baselineResults) {
      dims.add(`country:${r.country || 'unknown'}`);
    }

    return Array.from(dims);
  },

  async computeMany(ctx, dimensionKeys): Promise<ComputeResult[]> {
    // Single query for ALL current values + total
    const currentResults = await clix(ctx.db)
      .select<{ country: string; cnt: number }>(['country', 'count(*) as cnt'])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', ctx.projectId)
      .where('sign', '=', 1)
      .where('created_at', 'BETWEEN', [
        ctx.window.start,
        getEndOfDay(ctx.window.end),
      ])
      .groupBy(['country'])
      .execute();

    // Build current lookup map and total
    const currentMap = new Map<string, number>();
    let totalCurrentValue = 0;
    for (const r of currentResults) {
      const key = r.country || 'unknown';
      const cnt = Number(r.cnt ?? 0);
      currentMap.set(key, (currentMap.get(key) ?? 0) + cnt);
      totalCurrentValue += cnt;
    }

    // Single query for baseline
    let baselineMap: Map<string, number>;
    let totalBaselineValue = 0;

    if (ctx.window.kind === 'yesterday') {
      const baselineResults = await clix(ctx.db)
        .select<{ date: string; country: string; cnt: number }>([
          'toDate(created_at) as date',
          'country',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['date', 'country'])
        .execute();

      const targetWeekday = getWeekday(ctx.window.start);
      baselineMap = computeWeekdayMedians(
        baselineResults,
        targetWeekday,
        (r) => r.country || 'unknown',
      );

      // Compute total baseline from medians
      for (const value of baselineMap.values()) {
        totalBaselineValue += value;
      }
    } else {
      const baselineResults = await clix(ctx.db)
        .select<{ country: string; cnt: number }>([
          'country',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['country'])
        .execute();

      baselineMap = new Map<string, number>();
      for (const r of baselineResults) {
        const key = r.country || 'unknown';
        const cnt = Number(r.cnt ?? 0);
        baselineMap.set(key, (baselineMap.get(key) ?? 0) + cnt);
        totalBaselineValue += cnt;
      }
    }

    // Build results from maps
    const results: ComputeResult[] = [];

    for (const dimKey of dimensionKeys) {
      if (!dimKey.startsWith('country:')) continue;
      const country = dimKey.replace('country:', '');

      const currentValue = currentMap.get(country) ?? 0;
      const compareValue = baselineMap.get(country) ?? 0;

      const currentShare =
        totalCurrentValue > 0 ? currentValue / totalCurrentValue : 0;
      const compareShare =
        totalBaselineValue > 0 ? compareValue / totalBaselineValue : 0;

      // Share shift in percentage points
      const shareShiftPp = (currentShare - compareShare) * 100;
      const changePct =
        compareShare > 0
          ? (currentShare - compareShare) / compareShare
          : currentShare > 0
            ? 1
            : 0;

      // Direction should match the sign of the pp shift (so title + delta agree)
      const direction: 'up' | 'down' | 'flat' =
        shareShiftPp > 0 ? 'up' : shareShiftPp < 0 ? 'down' : 'flat';

      results.push({
        ok: true,
        dimensionKey: dimKey,
        currentValue,
        compareValue,
        changePct,
        direction,
        extra: {
          shareShiftPp,
          currentShare,
          compareShare,
          isNew: compareValue === 0 && currentValue > 0,
        },
      });
    }

    return results;
  },

  render(result, ctx): RenderedCard {
    const country = result.dimensionKey.replace('country:', '');
    const shareShiftPp = (result.extra?.shareShiftPp as number) ?? 0;
    const isIncrease = shareShiftPp >= 0;
    const isNew = result.extra?.isNew as boolean | undefined;

    const title = isNew
      ? `New traffic from: ${country}`
      : `${country} ${isIncrease ? '↑' : '↓'} ${Math.abs(shareShiftPp).toFixed(1)}pp`;

    return {
      kind: 'insight_v1',
      title,
      summary: `${ctx.window.label}. Share shift from ${country}.`,
      primaryDimension: { type: 'country', key: country, displayName: country },
      tags: [
        'geo',
        ctx.window.kind,
        isNew ? 'new' : isIncrease ? 'increase' : 'decrease',
      ],
      metric: 'share',
      extra: {
        currentShare: result.extra?.currentShare,
        compareShare: result.extra?.compareShare,
        shareShiftPp: result.extra?.shareShiftPp,
        isNew: result.extra?.isNew,
      },
    };
  },
};
