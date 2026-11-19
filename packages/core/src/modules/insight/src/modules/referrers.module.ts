import { sql } from '@openpanel/db/src/clickhouse/sql';
import { formatClickhouseDate } from '../../../../shared/ch-dates';
import { TABLE_NAMES } from '../../../../shared/ch-tables';
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

/** `sign = 1` is the sessions table's live-row predicate. */
const ACTIVE_SESSION_SIGN = sql.param('Int8', 1);

async function fetchReferrerAggregates(ctx: ComputeContext): Promise<{
  currentMap: Map<string, number>;
  baselineMap: Map<string, number>;
  totalCurrent: number;
  totalBaseline: number;
}> {
  const sessions = sql.id(TABLE_NAMES.sessions);
  const projectId = sql.string(ctx.projectId);
  const curStart = sql.dateTime64(formatClickhouseDate(ctx.window.start));
  const curEnd = sql.dateTime64(
    formatClickhouseDate(getEndOfDay(ctx.window.end))
  );
  const baseStart = sql.dateTime64(
    formatClickhouseDate(ctx.window.baselineStart)
  );
  const baseEnd = sql.dateTime64(
    formatClickhouseDate(getEndOfDay(ctx.window.baselineEnd))
  );

  if (ctx.window.kind === 'yesterday') {
    const [currentResults, baselineResults, totals] = await Promise.all([
      ctx.runQuery<{ referrer_name: string; cnt: number }>(sql`
        SELECT referrer_name, count(*) as cnt
        FROM ${sessions}
        WHERE project_id = ${projectId}
          AND sign = ${ACTIVE_SESSION_SIGN}
          AND created_at BETWEEN ${curStart} AND ${curEnd}
        GROUP BY referrer_name
      `),
      ctx.runQuery<{ date: string; referrer_name: string; cnt: number }>(sql`
        SELECT toDate(created_at) as date, referrer_name, count(*) as cnt
        FROM ${sessions}
        WHERE project_id = ${projectId}
          AND sign = ${ACTIVE_SESSION_SIGN}
          AND created_at BETWEEN ${baseStart} AND ${baseEnd}
        GROUP BY date, referrer_name
      `),
      ctx.runQuery<{ cur_total: number }>(sql`
        SELECT countIf(created_at BETWEEN ${curStart} AND ${curEnd}) as cur_total
        FROM ${sessions}
        WHERE project_id = ${projectId}
          AND sign = ${ACTIVE_SESSION_SIGN}
          AND created_at BETWEEN ${baseStart} AND ${curEnd}
      `),
    ]);

    const currentMap = buildLookupMap(
      currentResults,
      (r) => r.referrer_name || 'direct'
    );

    const targetWeekday = getWeekday(ctx.window.start);
    const baselineMap = computeWeekdayMedians(
      baselineResults,
      targetWeekday,
      (r) => r.referrer_name || 'direct'
    );

    const totalCurrent = totals[0]?.cur_total ?? 0;
    const totalBaseline = Array.from(baselineMap.values()).reduce(
      (sum, val) => sum + val,
      0
    );

    return { currentMap, baselineMap, totalCurrent, totalBaseline };
  }

  const [results, totals] = await Promise.all([
    ctx.runQuery<{ referrer_name: string; cur: number; base: number }>(sql`
      SELECT referrer_name, countIf(created_at BETWEEN ${curStart} AND ${curEnd}) as cur, countIf(created_at BETWEEN ${baseStart} AND ${baseEnd}) as base
      FROM ${sessions}
      WHERE project_id = ${projectId}
        AND sign = ${ACTIVE_SESSION_SIGN}
        AND created_at BETWEEN ${baseStart} AND ${curEnd}
      GROUP BY referrer_name
    `),
    ctx.runQuery<{ cur_total: number; base_total: number }>(sql`
      SELECT countIf(created_at BETWEEN ${curStart} AND ${curEnd}) as cur_total, countIf(created_at BETWEEN ${baseStart} AND ${baseEnd}) as base_total
      FROM ${sessions}
      WHERE project_id = ${projectId}
        AND sign = ${ACTIVE_SESSION_SIGN}
        AND created_at BETWEEN ${baseStart} AND ${curEnd}
    `),
  ]);

  const currentMap = buildLookupMap(
    results,
    (r) => r.referrer_name || 'direct',
    (r) => Number(r.cur ?? 0)
  );

  const baselineMap = buildLookupMap(
    results,
    (r) => r.referrer_name || 'direct',
    (r) => Number(r.base ?? 0)
  );

  const totalCurrent = totals[0]?.cur_total ?? 0;
  const totalBaseline = totals[0]?.base_total ?? 0;

  return { currentMap, baselineMap, totalCurrent, totalBaseline };
}

export const referrersModule: InsightModule = {
  key: 'referrers',
  cadence: ['daily'],
  thresholds: { minTotal: 100, minAbsDelta: 20, minPct: 0.15, maxDims: 50 },

  async enumerateDimensions(ctx) {
    const { currentMap, baselineMap } = await fetchReferrerAggregates(ctx);
    const topDims = selectTopDimensions(
      currentMap,
      baselineMap,
      this.thresholds?.maxDims ?? 50
    );
    return topDims.map((dim) => `referrer:${dim}`);
  },

  async computeMany(ctx, dimensionKeys): Promise<ComputeResult[]> {
    const { currentMap, baselineMap, totalCurrent, totalBaseline } =
      await fetchReferrerAggregates(ctx);
    const results: ComputeResult[] = [];

    for (const dimKey of dimensionKeys) {
      if (!dimKey.startsWith('referrer:')) {
        continue;
      }
      const referrerName = dimKey.replace('referrer:', '');

      const currentValue = currentMap.get(referrerName) ?? 0;
      const compareValue = baselineMap.get(referrerName) ?? 0;

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

    const sessionsCurrent = result.currentValue ?? 0;
    const sessionsCompare = result.compareValue ?? 0;
    const shareCurrent = Number(result.extra?.currentShare ?? 0);
    const shareCompare = Number(result.extra?.compareShare ?? 0);

    return {
      title,
      summary: `${ctx.window.label}. Sessions ${sessionsCurrent} vs ${sessionsCompare}.`,
      displayName: referrer,
      payload: {
        kind: 'insight_v1',
        dimensions: [
          {
            key: 'referrer_name',
            value: referrer,
            displayName: referrer,
          },
        ],
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
          isNew: result.extra?.isNew,
          isGone: result.extra?.isGone,
        },
      },
    };
  },
};
