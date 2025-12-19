import { TABLE_NAMES, formatClickhouseDate } from '../../../clickhouse/client';
import type {
  ComputeContext,
  ComputeResult,
  InsightModule,
  RenderedCard,
} from '../types';
import {
  buildLookupMap,
  computeChangePct,
  computeDirection,
  computeMedian,
  getEndOfDay,
  getWeekday,
  selectTopDimensions,
} from '../utils';

async function fetchDeviceAggregates(ctx: ComputeContext): Promise<{
  currentMap: Map<string, number>;
  baselineMap: Map<string, number>;
  totalCurrent: number;
  totalBaseline: number;
}> {
  if (ctx.window.kind === 'yesterday') {
    const [currentResults, baselineResults, totals] = await Promise.all([
      ctx
        .clix()
        .select<{ device: string; cnt: number }>(['device', 'count(*) as cnt'])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.start,
          getEndOfDay(ctx.window.end),
        ])
        .groupBy(['device'])
        .execute(),
      ctx
        .clix()
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
        .execute(),
      ctx
        .clix()
        .select<{ cur_total: number }>([
          ctx.clix.exp(
            `countIf(created_at BETWEEN '${formatClickhouseDate(ctx.window.start)}' AND '${formatClickhouseDate(getEndOfDay(ctx.window.end))}') as cur_total`,
          ),
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.end),
        ])
        .execute(),
    ]);

    const currentMap = buildLookupMap(currentResults, (r) => r.device);

    const targetWeekday = getWeekday(ctx.window.start);
    const aggregated = new Map<string, { date: string; cnt: number }[]>();
    for (const r of baselineResults) {
      if (!aggregated.has(r.device)) {
        aggregated.set(r.device, []);
      }
      const entries = aggregated.get(r.device)!;
      const existing = entries.find((e) => e.date === r.date);
      if (existing) {
        existing.cnt += Number(r.cnt ?? 0);
      } else {
        entries.push({ date: r.date, cnt: Number(r.cnt ?? 0) });
      }
    }

    const baselineMap = new Map<string, number>();
    for (const [deviceType, entries] of aggregated) {
      const sameWeekdayValues = entries
        .filter((e) => getWeekday(new Date(e.date)) === targetWeekday)
        .map((e) => e.cnt)
        .sort((a, b) => a - b);

      if (sameWeekdayValues.length > 0) {
        baselineMap.set(deviceType, computeMedian(sameWeekdayValues));
      }
    }

    const totalCurrent = totals[0]?.cur_total ?? 0;
    const totalBaseline =
      baselineMap.size > 0
        ? Array.from(baselineMap.values()).reduce((sum, val) => sum + val, 0)
        : 0;

    return { currentMap, baselineMap, totalCurrent, totalBaseline };
  }

  const curStart = formatClickhouseDate(ctx.window.start);
  const curEnd = formatClickhouseDate(getEndOfDay(ctx.window.end));
  const baseStart = formatClickhouseDate(ctx.window.baselineStart);
  const baseEnd = formatClickhouseDate(getEndOfDay(ctx.window.baselineEnd));

  const [results, totals] = await Promise.all([
    ctx
      .clix()
      .select<{ device: string; cur: number; base: number }>([
        'device',
        ctx.clix.exp(
          `countIf(created_at BETWEEN '${curStart}' AND '${curEnd}') as cur`,
        ),
        ctx.clix.exp(
          `countIf(created_at BETWEEN '${baseStart}' AND '${baseEnd}') as base`,
        ),
      ])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', ctx.projectId)
      .where('sign', '=', 1)
      .where('created_at', 'BETWEEN', [
        ctx.window.baselineStart,
        getEndOfDay(ctx.window.end),
      ])
      .groupBy(['device'])
      .execute(),
    ctx
      .clix()
      .select<{ cur_total: number; base_total: number }>([
        ctx.clix.exp(
          `countIf(created_at BETWEEN '${curStart}' AND '${curEnd}') as cur_total`,
        ),
        ctx.clix.exp(
          `countIf(created_at BETWEEN '${baseStart}' AND '${baseEnd}') as base_total`,
        ),
      ])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', ctx.projectId)
      .where('sign', '=', 1)
      .where('created_at', 'BETWEEN', [
        ctx.window.baselineStart,
        getEndOfDay(ctx.window.end),
      ])
      .execute(),
  ]);

  const currentMap = buildLookupMap(
    results,
    (r) => r.device,
    (r) => Number(r.cur ?? 0),
  );

  const baselineMap = buildLookupMap(
    results,
    (r) => r.device,
    (r) => Number(r.base ?? 0),
  );

  const totalCurrent = totals[0]?.cur_total ?? 0;
  const totalBaseline = totals[0]?.base_total ?? 0;

  return { currentMap, baselineMap, totalCurrent, totalBaseline };
}

export const devicesModule: InsightModule = {
  key: 'devices',
  cadence: ['daily'],
  thresholds: { minTotal: 100, minAbsDelta: 0, minPct: 0.08, maxDims: 5 },

  async enumerateDimensions(ctx) {
    const { currentMap, baselineMap } = await fetchDeviceAggregates(ctx);
    const topDims = selectTopDimensions(
      currentMap,
      baselineMap,
      this.thresholds?.maxDims ?? 5,
    );
    return topDims.map((dim) => `device:${dim}`);
  },

  async computeMany(ctx, dimensionKeys): Promise<ComputeResult[]> {
    const { currentMap, baselineMap, totalCurrent, totalBaseline } =
      await fetchDeviceAggregates(ctx);
    const results: ComputeResult[] = [];

    for (const dimKey of dimensionKeys) {
      if (!dimKey.startsWith('device:')) continue;
      const deviceType = dimKey.replace('device:', '');

      const currentValue = currentMap.get(deviceType) ?? 0;
      const compareValue = baselineMap.get(deviceType) ?? 0;

      const currentShare = totalCurrent > 0 ? currentValue / totalCurrent : 0;
      const compareShare = totalBaseline > 0 ? compareValue / totalBaseline : 0;

      const shareShiftPp = (currentShare - compareShare) * 100;
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
    const changePct = result.changePct ?? 0;
    const isIncrease = changePct >= 0;

    const sessionsCurrent = result.currentValue ?? 0;
    const sessionsCompare = result.compareValue ?? 0;
    const shareCurrent = Number(result.extra?.currentShare ?? 0);
    const shareCompare = Number(result.extra?.compareShare ?? 0);

    return {
      title: `${device} ${isIncrease ? '↑' : '↓'} ${Math.abs(changePct * 100).toFixed(0)}%`,
      summary: `${ctx.window.label}. Device traffic change.`,
      displayName: device,
      payload: {
        kind: 'insight_v1',
        dimensions: [{ key: 'device', value: device, displayName: device }],
        primaryMetric: 'sessions',
        metrics: {
          sessions: {
            current: sessionsCurrent,
            compare: sessionsCompare,
            delta: sessionsCurrent - sessionsCompare,
            changePct: sessionsCompare > 0 ? (result.changePct ?? 0) : null,
            direction: result.direction ?? 'flat',
            unit: 'count',
          },
          share: {
            current: shareCurrent,
            compare: shareCompare,
            delta: shareCurrent - shareCompare,
            changePct:
              shareCompare > 0
                ? (shareCurrent - shareCompare) / shareCompare
                : null,
            direction:
              shareCurrent - shareCompare > 0.0005
                ? 'up'
                : shareCurrent - shareCompare < -0.0005
                  ? 'down'
                  : 'flat',
            unit: 'ratio',
          },
        },
        extra: {
          // keep module-specific flags/fields if needed later
        },
      },
    };
  },
};
