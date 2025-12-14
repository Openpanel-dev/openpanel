import { TABLE_NAMES } from '../../../clickhouse/client';
import { clix } from '../../../clickhouse/query-builder';
import { normalizePath } from '../normalize';
import type { ComputeResult, InsightModule, RenderedCard } from '../types';
import {
  computeChangePct,
  computeDirection,
  computeWeekdayMedians,
  getEndOfDay,
  getWeekday,
} from '../utils';

export const entryPagesModule: InsightModule = {
  key: 'entry-pages',
  cadence: ['daily'],
  windows: ['yesterday', 'rolling_7d', 'rolling_30d'],
  thresholds: { minTotal: 100, minAbsDelta: 30, minPct: 0.2, maxDims: 100 },

  async enumerateDimensions(ctx) {
    // Query top entry pages from BOTH current and baseline windows
    const [currentResults, baselineResults] = await Promise.all([
      clix(ctx.db)
        .select<{ entry_path: string; cnt: number }>([
          'entry_path',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.start,
          getEndOfDay(ctx.window.end),
        ])
        .groupBy(['entry_path'])
        .orderBy('cnt', 'DESC')
        .limit(this.thresholds?.maxDims ?? 100)
        .execute(),
      clix(ctx.db)
        .select<{ entry_path: string; cnt: number }>([
          'entry_path',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['entry_path'])
        .orderBy('cnt', 'DESC')
        .limit(this.thresholds?.maxDims ?? 100)
        .execute(),
    ]);

    // Merge both sets
    const dims = new Set<string>();
    for (const r of currentResults) {
      dims.add(`entry:${normalizePath(r.entry_path || '/')}`);
    }
    for (const r of baselineResults) {
      dims.add(`entry:${normalizePath(r.entry_path || '/')}`);
    }

    return Array.from(dims);
  },

  async computeMany(ctx, dimensionKeys): Promise<ComputeResult[]> {
    // Single query for ALL current values
    const currentResults = await clix(ctx.db)
      .select<{ entry_path: string; cnt: number }>([
        'entry_path',
        'count(*) as cnt',
      ])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', ctx.projectId)
      .where('sign', '=', 1)
      .where('created_at', 'BETWEEN', [
        ctx.window.start,
        getEndOfDay(ctx.window.end),
      ])
      .groupBy(['entry_path'])
      .execute();

    // Build current lookup map
    const currentMap = new Map<string, number>();
    for (const r of currentResults) {
      const key = normalizePath(r.entry_path || '/');
      currentMap.set(key, (currentMap.get(key) ?? 0) + Number(r.cnt ?? 0));
    }

    // Single query for baseline
    let baselineMap: Map<string, number>;

    if (ctx.window.kind === 'yesterday') {
      const baselineResults = await clix(ctx.db)
        .select<{ date: string; entry_path: string; cnt: number }>([
          'toDate(created_at) as date',
          'entry_path',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['date', 'entry_path'])
        .execute();

      const targetWeekday = getWeekday(ctx.window.start);
      baselineMap = computeWeekdayMedians(baselineResults, targetWeekday, (r) =>
        normalizePath(r.entry_path || '/'),
      );
    } else {
      const baselineResults = await clix(ctx.db)
        .select<{ entry_path: string; cnt: number }>([
          'entry_path',
          'count(*) as cnt',
        ])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', ctx.projectId)
        .where('sign', '=', 1)
        .where('created_at', 'BETWEEN', [
          ctx.window.baselineStart,
          getEndOfDay(ctx.window.baselineEnd),
        ])
        .groupBy(['entry_path'])
        .execute();

      baselineMap = new Map<string, number>();
      for (const r of baselineResults) {
        const key = normalizePath(r.entry_path || '/');
        baselineMap.set(key, (baselineMap.get(key) ?? 0) + Number(r.cnt ?? 0));
      }
    }

    // Build results from maps
    const results: ComputeResult[] = [];

    for (const dimKey of dimensionKeys) {
      if (!dimKey.startsWith('entry:')) continue;
      const entryPath = dimKey.replace('entry:', '');

      const currentValue = currentMap.get(entryPath) ?? 0;
      const compareValue = baselineMap.get(entryPath) ?? 0;
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
        },
      });
    }

    return results;
  },

  render(result, ctx): RenderedCard {
    const path = result.dimensionKey.replace('entry:', '');
    const pct = ((result.changePct ?? 0) * 100).toFixed(1);
    const isIncrease = (result.changePct ?? 0) >= 0;
    const isNew = result.extra?.isNew as boolean | undefined;

    const title = isNew
      ? `New entry page: ${path}`
      : `Entry page ${path} ${isIncrease ? '↑' : '↓'} ${Math.abs(Number(pct))}%`;

    return {
      kind: 'insight_v1',
      title,
      summary: `${ctx.window.label}. Sessions ${result.currentValue ?? 0} vs ${result.compareValue ?? 0}.`,
      primaryDimension: { type: 'entry', key: path, displayName: path },
      tags: [
        'entry-pages',
        ctx.window.kind,
        isNew ? 'new' : isIncrease ? 'increase' : 'decrease',
      ],
      metric: 'sessions',
      extra: {
        isNew: result.extra?.isNew,
      },
    };
  },
};
