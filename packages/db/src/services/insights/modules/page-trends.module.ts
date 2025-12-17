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
  computeWeekdayMedians,
  getEndOfDay,
  getWeekday,
  selectTopDimensions,
} from '../utils';

const DELIMITER = '|||';

async function fetchPageTrendAggregates(ctx: ComputeContext): Promise<{
  currentMap: Map<string, number>;
  baselineMap: Map<string, number>;
  totalCurrent: number;
  totalBaseline: number;
}> {
  if (ctx.window.kind === 'yesterday') {
    const [currentResults, baselineResults, totals] = await Promise.all([
      ctx
        .clix()
        .select<{ origin: string; path: string; cnt: number }>([
          'origin',
          'path',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', ctx.projectId)
        .where('name', '=', 'screen_view')
        .where('created_at', 'BETWEEN', [
          ctx.window.start,
          getEndOfDay(ctx.window.end),
        ])
        .groupBy(['origin', 'path'])
        .execute(),
      ctx
        .clix()
        .select<{ date: string; origin: string; path: string; cnt: number }>([
          'toDate(created_at) as date',
          'origin',
          'path',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', ctx.projectId)
        .where('name', '=', 'screen_view')
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['date', 'origin', 'path'])
        .execute(),
      ctx
        .clix()
        .select<{ cur_total: number }>([
          ctx.clix.exp(
            `countIf(created_at BETWEEN '${formatClickhouseDate(ctx.window.start)}' AND '${formatClickhouseDate(getEndOfDay(ctx.window.end))}') as cur_total`,
          ),
        ])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', ctx.projectId)
        .where('name', '=', 'screen_view')
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.end),
        ])
        .execute(),
    ]);

    const currentMap = buildLookupMap(
      currentResults,
      (r) => `${r.origin || ''}${DELIMITER}${r.path || '/'}`,
    );

    const targetWeekday = getWeekday(ctx.window.start);
    const baselineMap = computeWeekdayMedians(
      baselineResults,
      targetWeekday,
      (r) => `${r.origin || ''}${DELIMITER}${r.path || '/'}`,
    );

    const totalCurrent = totals[0]?.cur_total ?? 0;
    const totalBaseline = Array.from(baselineMap.values()).reduce(
      (sum, val) => sum + val,
      0,
    );

    return { currentMap, baselineMap, totalCurrent, totalBaseline };
  }

  const curStart = formatClickhouseDate(ctx.window.start);
  const curEnd = formatClickhouseDate(getEndOfDay(ctx.window.end));
  const baseStart = formatClickhouseDate(ctx.window.baselineStart);
  const baseEnd = formatClickhouseDate(getEndOfDay(ctx.window.baselineEnd));

  const [results, totals] = await Promise.all([
    ctx
      .clix()
      .select<{ origin: string; path: string; cur: number; base: number }>([
        'origin',
        'path',
        ctx.clix.exp(
          `countIf(created_at BETWEEN '${curStart}' AND '${curEnd}') as cur`,
        ),
        ctx.clix.exp(
          `countIf(created_at BETWEEN '${baseStart}' AND '${baseEnd}') as base`,
        ),
      ])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', ctx.projectId)
      .where('name', '=', 'screen_view')
      .where('created_at', 'BETWEEN', [
        ctx.window.baselineStart,
        getEndOfDay(ctx.window.end),
      ])
      .groupBy(['origin', 'path'])
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
      .from(TABLE_NAMES.events)
      .where('project_id', '=', ctx.projectId)
      .where('name', '=', 'screen_view')
      .where('created_at', 'BETWEEN', [
        ctx.window.baselineStart,
        getEndOfDay(ctx.window.end),
      ])
      .execute(),
  ]);

  const currentMap = buildLookupMap(
    results,
    (r) => `${r.origin || ''}${DELIMITER}${r.path || '/'}`,
    (r) => Number(r.cur ?? 0),
  );

  const baselineMap = buildLookupMap(
    results,
    (r) => `${r.origin || ''}${DELIMITER}${r.path || '/'}`,
    (r) => Number(r.base ?? 0),
  );

  const totalCurrent = totals[0]?.cur_total ?? 0;
  const totalBaseline = totals[0]?.base_total ?? 0;

  return { currentMap, baselineMap, totalCurrent, totalBaseline };
}

export const pageTrendsModule: InsightModule = {
  key: 'page-trends',
  cadence: ['daily'],
  thresholds: { minTotal: 100, minAbsDelta: 30, minPct: 0.2, maxDims: 100 },

  async enumerateDimensions(ctx) {
    const { currentMap, baselineMap } = await fetchPageTrendAggregates(ctx);
    const topDims = selectTopDimensions(
      currentMap,
      baselineMap,
      this.thresholds?.maxDims ?? 100,
    );
    return topDims.map((dim) => `page:${dim}`);
  },

  async computeMany(ctx, dimensionKeys): Promise<ComputeResult[]> {
    const { currentMap, baselineMap, totalCurrent, totalBaseline } =
      await fetchPageTrendAggregates(ctx);
    const results: ComputeResult[] = [];

    for (const dimKey of dimensionKeys) {
      if (!dimKey.startsWith('page:')) continue;
      const originPath = dimKey.replace('page:', '');

      const currentValue = currentMap.get(originPath) ?? 0;
      const compareValue = baselineMap.get(originPath) ?? 0;

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
          isNew: compareValue === 0 && currentValue > 0,
        },
      });
    }

    return results;
  },

  render(result, ctx): RenderedCard {
    const originPath = result.dimensionKey.replace('page:', '');
    const [origin, path] = originPath.split(DELIMITER);
    const displayValue = origin ? `${origin}${path}` : path || '/';
    const pct = ((result.changePct ?? 0) * 100).toFixed(1);
    const isIncrease = (result.changePct ?? 0) >= 0;
    const isNew = result.extra?.isNew as boolean | undefined;

    const title = isNew
      ? `New page getting views: ${displayValue}`
      : `Page ${displayValue} ${isIncrease ? '↑' : '↓'} ${Math.abs(Number(pct))}%`;

    const pageviewsCurrent = result.currentValue ?? 0;
    const pageviewsCompare = result.compareValue ?? 0;
    const shareCurrent = Number(result.extra?.currentShare ?? 0);
    const shareCompare = Number(result.extra?.compareShare ?? 0);

    return {
      title,
      summary: `${ctx.window.label}. Pageviews ${pageviewsCurrent} vs ${pageviewsCompare}.`,
      displayName: displayValue,
      payload: {
        kind: 'insight_v1',
        dimensions: [
          { key: 'origin', value: origin ?? '', displayName: origin ?? '' },
          { key: 'path', value: path ?? '', displayName: path ?? '' },
        ],
        primaryMetric: 'pageviews',
        metrics: {
          pageviews: {
            current: pageviewsCurrent,
            compare: pageviewsCompare,
            delta: pageviewsCurrent - pageviewsCompare,
            changePct: pageviewsCompare > 0 ? (result.changePct ?? 0) : null,
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
          isNew: result.extra?.isNew,
        },
      },
    };
  },
};
