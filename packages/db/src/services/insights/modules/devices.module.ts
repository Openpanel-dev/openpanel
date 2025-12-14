import { TABLE_NAMES } from '../../../clickhouse/client';
import { clix } from '../../../clickhouse/query-builder';
import type { ComputeResult, InsightModule, RenderedCard } from '../types';
import { computeWeekdayMedians, getEndOfDay, getWeekday } from '../utils';

function normalizeDevice(device: string): string {
  const d = (device || '').toLowerCase().trim();
  if (d.includes('mobile') || d === 'phone') return 'mobile';
  if (d.includes('tablet')) return 'tablet';
  if (d.includes('desktop')) return 'desktop';
  return d || 'unknown';
}

export const devicesModule: InsightModule = {
  key: 'devices',
  cadence: ['daily'],
  windows: ['yesterday', 'rolling_7d', 'rolling_30d'],
  thresholds: { minTotal: 100, minAbsDelta: 0, minPct: 0.08, maxDims: 5 },

  async enumerateDimensions(ctx) {
    // Query devices from current window (limited set, no need for baseline merge)
    const results = await clix(ctx.db)
      .select<{ device: string; cnt: number }>(['device', 'count(*) as cnt'])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', ctx.projectId)
      .where('sign', '=', 1)
      .where('created_at', 'BETWEEN', [
        ctx.window.start,
        getEndOfDay(ctx.window.end),
      ])
      .where('device', '!=', '')
      .groupBy(['device'])
      .orderBy('cnt', 'DESC')
      .execute();

    // Normalize and dedupe device types
    const dims = new Set<string>();
    for (const r of results) {
      dims.add(`device:${normalizeDevice(r.device)}`);
    }

    return Array.from(dims);
  },

  async computeMany(ctx, dimensionKeys): Promise<ComputeResult[]> {
    // Single query for ALL current values
    const currentResults = await clix(ctx.db)
      .select<{ device: string; cnt: number }>(['device', 'count(*) as cnt'])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', ctx.projectId)
      .where('sign', '=', 1)
      .where('created_at', 'BETWEEN', [
        ctx.window.start,
        getEndOfDay(ctx.window.end),
      ])
      .groupBy(['device'])
      .execute();

    // Build current lookup map (normalized) and total
    const currentMap = new Map<string, number>();
    let totalCurrentValue = 0;
    for (const r of currentResults) {
      const key = normalizeDevice(r.device);
      const cnt = Number(r.cnt ?? 0);
      currentMap.set(key, (currentMap.get(key) ?? 0) + cnt);
      totalCurrentValue += cnt;
    }

    // Single query for baseline
    let baselineMap: Map<string, number>;
    let totalBaselineValue = 0;

    if (ctx.window.kind === 'yesterday') {
      const baselineResults = await clix(ctx.db)
        .select<{ date: string; device: string; cnt: number }>([
          'toDate(created_at) as date',
          'device',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['date', 'device'])
        .execute();

      const targetWeekday = getWeekday(ctx.window.start);

      // Group by normalized device type before computing medians
      const normalizedResults = baselineResults.map((r) => ({
        date: r.date,
        device: normalizeDevice(r.device),
        cnt: r.cnt,
      }));

      // Aggregate by date + normalized device first
      const aggregated = new Map<string, { date: string; cnt: number }[]>();
      for (const r of normalizedResults) {
        const key = `${r.date}|${r.device}`;
        if (!aggregated.has(r.device)) {
          aggregated.set(r.device, []);
        }
        // Find existing entry for this date+device or add new
        const entries = aggregated.get(r.device)!;
        const existing = entries.find((e) => e.date === r.date);
        if (existing) {
          existing.cnt += Number(r.cnt ?? 0);
        } else {
          entries.push({ date: r.date, cnt: Number(r.cnt ?? 0) });
        }
      }

      // Compute weekday medians per device type
      baselineMap = new Map<string, number>();
      for (const [deviceType, entries] of aggregated) {
        const sameWeekdayValues = entries
          .filter((e) => getWeekday(new Date(e.date)) === targetWeekday)
          .map((e) => e.cnt)
          .sort((a, b) => a - b);

        if (sameWeekdayValues.length > 0) {
          const mid = Math.floor(sameWeekdayValues.length / 2);
          const median =
            sameWeekdayValues.length % 2 === 0
              ? ((sameWeekdayValues[mid - 1] ?? 0) +
                  (sameWeekdayValues[mid] ?? 0)) /
                2
              : (sameWeekdayValues[mid] ?? 0);
          baselineMap.set(deviceType, median);
          totalBaselineValue += median;
        }
      }
    } else {
      const baselineResults = await clix(ctx.db)
        .select<{ device: string; cnt: number }>(['device', 'count(*) as cnt'])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['device'])
        .execute();

      baselineMap = new Map<string, number>();
      for (const r of baselineResults) {
        const key = normalizeDevice(r.device);
        const cnt = Number(r.cnt ?? 0);
        baselineMap.set(key, (baselineMap.get(key) ?? 0) + cnt);
        totalBaselineValue += cnt;
      }
    }

    // Build results from maps
    const results: ComputeResult[] = [];

    for (const dimKey of dimensionKeys) {
      if (!dimKey.startsWith('device:')) continue;
      const deviceType = dimKey.replace('device:', '');

      const currentValue = currentMap.get(deviceType) ?? 0;
      const compareValue = baselineMap.get(deviceType) ?? 0;

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
        },
      });
    }

    return results;
  },

  render(result, ctx): RenderedCard {
    const device = result.dimensionKey.replace('device:', '');
    const shareShiftPp = (result.extra?.shareShiftPp as number) ?? 0;
    const isIncrease = shareShiftPp >= 0;

    return {
      kind: 'insight_v1',
      title: `${device} ${isIncrease ? '↑' : '↓'} ${Math.abs(shareShiftPp).toFixed(1)}pp`,
      summary: `${ctx.window.label}. Device share shift.`,
      primaryDimension: { type: 'device', key: device, displayName: device },
      tags: ['devices', ctx.window.kind, isIncrease ? 'increase' : 'decrease'],
      metric: 'share',
      extra: {
        currentShare: result.extra?.currentShare,
        compareShare: result.extra?.compareShare,
        shareShiftPp: result.extra?.shareShiftPp,
      },
    };
  },
};
