import { ifNaN } from '@openpanel/common';
import type {
  IChartBreakdown,
  IChartEvent,
  IReportInput,
} from '@openpanel/validation';
import { last, reverse, uniq } from 'ramda';
import sqlstring from 'sqlstring';
import { ch } from '../clickhouse/client';
import { TABLE_NAMES } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { createSqlBuilder } from '../sql-builder';
import {
  buildInlineCohortJoin,
  collectBreakdownCohortIds,
  extractCohortId,
  fetchCohortsMetadata,
  getEventFiltersWhereClause,
  getSelectPropertyKey,
  isAllCohortsBreakdown,
  isKnownEventField,
} from './chart.service';
import { mergeGlobalFilters, onlyReportEvents } from './reports.service';

/** Display label for null/empty breakdown values (e.g. property not set). */
export const EMPTY_BREAKDOWN_LABEL = 'Not set';

function normalizeBreakdownValue(value: unknown): string {
  if (value == null || value === '') {
    return EMPTY_BREAKDOWN_LABEL;
  }
  const s = String(value).trim();
  return s === '' ? EMPTY_BREAKDOWN_LABEL : s;
}

export class FunnelService {
  constructor(private client: typeof ch) {}

  /**
   * Returns the grouping strategy for the funnel.
   * Determines whether windowFunnel is computed per session_id or profile_id.
   */
  getFunnelGroup(group?: string): 'profile_id' | 'session_id' {
    return group === 'profile_id' ? 'profile_id' : 'session_id';
  }

  getFunnelConditions(events: IChartEvent[] = [], projectId?: string): string[] {
    return events.map((event) => {
      const { sb, getWhere } = createSqlBuilder();
      sb.where = getEventFiltersWhereClause(event.filters, projectId);
      sb.where.name = `events.name = ${sqlstring.escape(event.name)}`;
      return getWhere().replace('WHERE ', '');
    });
  }

  /**
   * Builds the funnel CTE.
   * - When group === 'session_id': windowFunnel is computed per session_id.
   *   profile_id is resolved via argMax to handle identity changes mid-session.
   * - When group === 'profile_id': windowFunnel is computed directly per profile_id.
   *   This correctly handles cross-session funnel completions.
   */
  buildFunnelCte({
    projectId,
    startDate,
    endDate,
    eventSeries,
    funnelWindowMilliseconds,
    timezone,
    additionalSelects = [],
    additionalGroupBy = [],
    group = 'session_id',
  }: {
    projectId: string;
    startDate: string;
    endDate: string;
    eventSeries: IChartEvent[];
    funnelWindowMilliseconds: number;
    timezone: string;
    additionalSelects?: string[];
    additionalGroupBy?: string[];
    group?: 'session_id' | 'profile_id';
  }) {
    const funnels = this.getFunnelConditions(eventSeries, projectId);
    const primaryKey = group === 'profile_id' ? 'profile_id' : 'session_id';

    // windowFunnel's 'strict_increase' mode requires every step's timestamp
    // to be strictly greater than the previous step's, so same-timestamp
    // sequences (server-side senders, batched SDKs, imported data with
    // coarse timestamps) never connect. Mixpanel/Amplitude count those as
    // ordered, so deployments migrating from them can opt into the default
    // (>=) mode; strict stays the default here.
    const nonStrictOrdering =
      process.env.FUNNEL_NON_STRICT_ORDERING === '1' ||
      process.env.FUNNEL_NON_STRICT_ORDERING === 'true';
    const windowFunnelMode = nonStrictOrdering ? '' : ", 'strict_increase'";

    return clix(this.client, timezone)
      .select([
        primaryKey,
        `windowFunnel(${funnelWindowMilliseconds}${windowFunnelMode})(toUInt64(toUnixTimestamp64Milli(created_at)), ${funnels.join(', ')}) AS level`,
        ...(group === 'session_id'
          ? ['argMax(profile_id, created_at) AS profile_id']
          : []),
        ...additionalSelects,
      ])
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .where(
        'events.name',
        'IN',
        eventSeries.map((e) => e.name),
      )
      // Only rows matching at least one step can advance windowFunnel, so
      // rows that share a step's event name but fail its filters are dead
      // weight — with filtered steps (e.g. screen_view + a path filter) they
      // can be the vast majority of what the name IN(...) lets through.
      // Dropping them here shrinks the aggregation input; windowFunnel
      // ignores non-matching rows either way, so levels are unchanged.
      .rawWhere(`(${funnels.map((f) => `(${f})`).join(' OR ')})`)
      .groupBy([primaryKey, ...additionalGroupBy]);
  }

  buildSessionsCte({
    projectId,
    startDate,
    endDate,
    timezone,
  }: {
    projectId: string;
    startDate: string;
    endDate: string;
    timezone: string;
  }) {
    return clix(this.client, timezone)
      .select(['profile_id as pid', 'id as sid'])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ]);
  }

  private fillFunnel(
    funnel: { level: number; count: number }[],
    steps: number,
  ) {
    const filled = Array.from({ length: steps }, (_, index) => {
      const level = index + 1;
      const matchingResult = funnel.find((res) => res.level === level);
      return {
        level,
        count: matchingResult ? matchingResult.count : 0,
      };
    });

    // Accumulate counts from top to bottom of the funnel
    for (let i = filled.length - 1; i >= 0; i--) {
      const step = filled[i];
      const prevStep = filled[i + 1];
      // If there's a previous step, add the count to the current step
      if (step && prevStep) {
        step.count += prevStep.count;
      }
    }
    return filled.reverse();
  }

  toSeries(
    funnel: { level: number; count: number; [key: string]: any }[],
    breakdowns: { name: string }[] = [],
    limit: number | undefined = undefined,
  ) {
    if (!breakdowns.length) {
      return [
        funnel.map((f) => ({
          level: f.level,
          count: f.count,
          id: 'none',
          breakdowns: [],
        })),
      ];
    }

    // Group by breakdown values (normalize empty/null to "Not set")
    const series = funnel.reduce(
      (acc, f) => {
        if (limit && Object.keys(acc).length >= limit) {
          return acc;
        }

        const key = breakdowns
          .map((b, index) => normalizeBreakdownValue(f[`b_${index}`]))
          .join('|');
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key]!.push({
          id: key,
          breakdowns: breakdowns.map((b, index) =>
            normalizeBreakdownValue(f[`b_${index}`]),
          ),
          level: f.level,
          count: f.count,
        });
        return acc;
      },
      {} as Record<
        string,
        {
          id: string;
          breakdowns: string[];
          level: number;
          count: number;
        }[]
      >,
    );

    return Object.values(series);
  }

  getProfileFilters(events: IChartEvent[]) {
    return events.flatMap((e) =>
      e.filters
        ?.filter((f) => f.name.startsWith('profile.'))
        .map((f) => f.name.replace('profile.', '')),
    );
  }

  /**
   * Builds everything the funnel chart and the funnel profile list share: the
   * normalized event series and breakdowns, the `session_funnel` CTE with all
   * of its joins wired up, and the outer query those CTEs are registered on.
   *
   * This exists because the two used to be written out twice and drifted. A
   * breakdown expression only works if the join it references was added, and
   * the joins depend on the breakdowns — so building the selects in one place
   * and the joins in another is exactly the bug waiting to happen. Callers add
   * their own `funnel` CTE and final projection on top.
   */
  async buildFunnelBase({
    projectId,
    startDate,
    endDate,
    series,
    globalFilters,
    breakdowns: initialBreakdowns = [],
    funnelWindow = 24,
    funnelGroup,
    timezone,
  }: {
    projectId: string;
    startDate: string;
    endDate: string;
    series: IReportInput['series'];
    globalFilters?: IReportInput['globalFilters'];
    breakdowns?: IChartBreakdown[];
    funnelWindow?: number;
    funnelGroup?: string;
    timezone: string;
  }) {
    // Drop breakdowns that don't resolve to a known events column, properties
    // path, profile path, group path, or specific cohort. The funnel CTE
    // inlines each breakdown's name directly via getSelectPropertyKey, so
    // anything that doesn't resolve leaks into the SQL verbatim.
    //
    // `isKnownEventField` accepts the bare `cohort` breakdown because the
    // chart's all-cohorts feature uses it, but the funnel has no equivalent —
    // it renders as `cohort as b_0 FROM events`, which fails with
    // UNKNOWN_IDENTIFIER for the chart and the profile list alike. Exclude it
    // explicitly rather than relying on the generic check.
    const breakdowns = initialBreakdowns.filter(
      (b) => isKnownEventField(b.name) && !isAllCohortsBreakdown(b.name),
    );

    const eventSeries = onlyReportEvents(
      mergeGlobalFilters(series, globalFilters),
    );

    if (eventSeries.length === 0) {
      throw new Error('events are required');
    }

    const funnelWindowMilliseconds = funnelWindow * 3600 * 1000;
    const group = this.getFunnelGroup(funnelGroup);

    const profileFilters = this.getProfileFilters(eventSeries);
    const anyFilterOnProfile = profileFilters.length > 0;
    const profileBreakdowns = breakdowns.filter((b) =>
      b.name.startsWith('profile.'),
    );
    const anyFilterOnGroup = eventSeries.some((e) =>
      e.filters?.some((f) => f.name.startsWith('group.')),
    );
    const anyBreakdownOnGroup = breakdowns.some((b) =>
      b.name.startsWith('group.'),
    );
    const needsGroupArrayJoin =
      anyFilterOnGroup || anyBreakdownOnGroup || funnelGroup === 'group';

    const cohortIds = collectBreakdownCohortIds(breakdowns);
    const cohortMetadata = await fetchCohortsMetadata(cohortIds);

    // Attribute each breakdown to its value at the user's FIRST funnel step,
    // as a per-group aggregate (argMinIf) — not by adding it to the
    // windowFunnel GROUP BY. Grouping the sequence by a per-row value splits
    // a user's steps across buckets whenever the value isn't identical on
    // every step (e.g. an experiment tag set on the entry event but absent
    // on the conversion event): the later step lands in a separate bucket,
    // the windowFunnel sequence never connects, and downstream steps show 0.
    // Reading the entry-step value keeps each sequence intact in one bucket
    // and matches standard funnel-breakdown semantics (segment by entry
    // attribute).
    //
    // `group.*` breakdowns are the exception: their ARRAY JOIN fans each
    // event out per group, and grouping by the group value is intentional —
    // a user in three groups should appear in all three funnels. Those keep
    // the per-row GROUP BY.
    const firstStepCondition = this.getFunnelConditions(
      eventSeries,
      projectId,
    )[0]!;
    const breakdownSelects = breakdowns.map((b, index) => {
      const bId = extractCohortId(b.name);
      const bName = bId ? cohortMetadata.get(bId)?.name : undefined;
      const expr = getSelectPropertyKey(
        b.name,
        projectId,
        bId ?? undefined,
        bName,
      );
      if (b.name.startsWith('group.')) {
        return `${expr} as b_${index}`;
      }
      return `argMinIf(${expr}, created_at, ${firstStepCondition}) as b_${index}`;
    });
    const breakdownGroupBy = breakdowns.flatMap((b, index) =>
      b.name.startsWith('group.') ? [`b_${index}`] : [],
    );

    const funnelCte = this.buildFunnelCte({
      projectId,
      startDate,
      endDate,
      eventSeries,
      funnelWindowMilliseconds,
      timezone,
      additionalSelects: breakdownSelects,
      additionalGroupBy: breakdownGroupBy,
      group,
    });

    // The profile join has to cover breakdowns as well as filters — a
    // `profile.*` breakdown renders `profile.properties[...]` into the select,
    // so the alias must exist in scope even when no filter touches profiles.
    if (anyFilterOnProfile || profileBreakdowns.length > 0) {
      const profileFields = new Set<string>(['id']);
      for (const f of profileFilters) {
        profileFields.add(f.split('.')[0]!);
      }
      for (const b of profileBreakdowns) {
        const fieldName = b.name.replace('profile.', '').split('.')[0];
        if (fieldName === 'properties') {
          profileFields.add('properties');
        } else if (
          [
            'email',
            'first_name',
            'last_name',
            'created_at',
            'last_seen_at',
          ].includes(fieldName!)
        ) {
          profileFields.add(fieldName!);
        }
      }
      const profileSelectColumns = Array.from(profileFields).join(', ');
      funnelCte.leftJoin(
        `(SELECT ${profileSelectColumns} FROM ${TABLE_NAMES.profiles} FINAL
          WHERE project_id = ${sqlstring.escape(projectId)}) as profile`,
        'profile.id = events.profile_id',
      );
    }

    if (needsGroupArrayJoin) {
      funnelCte.rawJoin('ARRAY JOIN groups AS _group_id');
      funnelCte.rawJoin('LEFT ANY JOIN _g ON _g.id = _group_id');
    }

    // A cohort breakdown renders `cohort_<id>.profile_id`, so every cohort
    // referenced by a breakdown needs its join.
    for (const cohortId of cohortIds) {
      funnelCte.rawJoin(buildInlineCohortJoin(cohortId, projectId, 'events'));
    }

    const query = clix(this.client, timezone);

    if (needsGroupArrayJoin) {
      query.with(
        '_g',
        `SELECT id, name, type, properties FROM ${TABLE_NAMES.groups} FINAL WHERE project_id = ${sqlstring.escape(projectId)}`,
      );
    }

    query.with('session_funnel', funnelCte);

    return { query, eventSeries, breakdowns, group };
  }

  async getFunnel({
    projectId,
    startDate,
    endDate,
    series,
    globalFilters,
    options,
    breakdowns: initialBreakdowns = [],
    limit,
    timezone = 'UTC',
  }: IReportInput & { timezone: string; events?: IChartEvent[] }) {
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    const funnelOptions = options?.type === 'funnel' ? options : undefined;

    const {
      query: funnelQuery,
      eventSeries,
      breakdowns,
    } = await this.buildFunnelBase({
      projectId,
      startDate,
      endDate,
      series,
      globalFilters,
      breakdowns: initialBreakdowns,
      funnelWindow: funnelOptions?.funnelWindow,
      funnelGroup: funnelOptions?.funnelGroup,
      timezone,
    });

    // windowFunnel is computed per the primary key (profile_id or session_id),
    // so we just filter out level=0 rows — no re-aggregation needed.
    funnelQuery.with(
      'funnel',
      'SELECT * FROM session_funnel WHERE level != 0',
    );

    funnelQuery
      .select<{
        level: number;
        count: number;
        [key: string]: any;
      }>([
        'level',
        ...breakdowns.map((b, index) => `b_${index}`),
        'count() as count',
      ])
      .from('funnel')
      .groupBy(['level', ...breakdowns.map((b, index) => `b_${index}`)])
      .orderBy('level', 'DESC');

    const funnelData = await funnelQuery.execute();
    const funnelSeries = this.toSeries(funnelData, breakdowns, limit);

    return funnelSeries
      .map((data) => {
        const maxLevel = eventSeries.length;
        const filledFunnelRes = this.fillFunnel(
          data.map((d) => ({ level: d.level, count: d.count })),
          maxLevel,
        );

        const totalSessions = last(filledFunnelRes)?.count ?? 0;
        const steps = reverse(filledFunnelRes)
          .reduce(
            (acc, item, index, list) => {
              const prev = list[index - 1] ?? { count: totalSessions };
              const next = list[index + 1];
              const event = eventSeries[item.level - 1]!;
              return [
                ...acc,
                {
                  event: {
                    ...event,
                    displayName: event.displayName || event.name,
                  },
                  count: item.count,
                  percent: (item.count / totalSessions) * 100,
                  dropoffCount: next ? item.count - next.count : null,
                  dropoffPercent: next
                    ? ((item.count - next.count) / item.count) * 100
                    : null,
                  previousCount: prev.count,
                  nextCount: next?.count ?? null,
                },
              ];
            },
            [] as {
              event: IChartEvent & { displayName: string };
              count: number;
              percent: number;
              dropoffCount: number | null;
              dropoffPercent: number | null;
              previousCount: number;
              nextCount: number | null;
            }[],
          )
          .map((step, index, list) => {
            return {
              ...step,
              percent: ifNaN(step.percent, 0),
              dropoffPercent: ifNaN(step.dropoffPercent, 0),
              isHighestDropoff: (() => {
                // Skip if current step has no dropoff
                if (!step?.dropoffCount) return false;

                // Get maximum dropoff count, excluding 0s
                const maxDropoff = Math.max(
                  ...list
                    .map((s) => s.dropoffCount || 0)
                    .filter((count) => count > 0),
                );

                // Check if this is the first step with the highest dropoff
                return (
                  step.dropoffCount === maxDropoff &&
                  list.findIndex((s) => s.dropoffCount === maxDropoff) === index
                );
              })(),
            };
          });

        return {
          id: data[0]?.id ?? 'none',
          breakdowns: data[0]?.breakdowns ?? [],
          steps,
          totalSessions,
          lastStep: last(steps)!,
          mostDropoffsStep: steps.find((step) => step.isHighestDropoff)!,
        };
      })
      .sort((a, b) => {
        const aTotal = a.steps.reduce((acc, step) => acc + step.count, 0);
        const bTotal = b.steps.reduce((acc, step) => acc + step.count, 0);
        return bTotal - aTotal;
      });
  }
}

export const funnelService = new FunnelService(ch);

import { getSettingsForProject } from './organization.service';

export async function getFunnelCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  steps: string[];
  windowHours?: number;
  groupBy?: 'session_id' | 'profile_id';
}) {
  const { timezone } = await getSettingsForProject(input.projectId);
  const eventSeries = input.steps.map((name, index) => ({
    id: String(index + 1),
    type: 'event' as const,
    name,
    displayName: name,
    segment: 'user' as const,
    filters: [],
  }));

  const result = await funnelService.getFunnel({
    projectId: input.projectId,
    startDate: input.startDate,
    endDate: input.endDate,
    series: eventSeries,
    breakdowns: [],
    chartType: 'funnel',
    interval: 'day',
    range: 'custom',
    previous: false,
    metric: 'sum',
    options: {
      type: 'funnel',
      funnelWindow: input.windowHours ?? 24,
      funnelGroup: input.groupBy ?? 'session_id',
    },
    timezone,
  });

  const primarySeries = result[0];
  if (!primarySeries) {
    return {
      steps: [],
      totalUsers: 0,
      completedUsers: 0,
      overallConversionRate: 0,
    };
  }

  const steps = primarySeries.steps.map((step, index) => ({
    step: index + 1,
    eventName: step.event.displayName || step.event.name,
    users: step.count,
    conversionRateFromStart: Math.round(step.percent * 100) / 100,
    dropoffPercent:
      step.dropoffPercent != null
        ? Math.round(step.dropoffPercent * 100) / 100
        : null,
    isHighestDropoff: step.isHighestDropoff,
  }));

  const totalUsers = steps[0]?.users ?? 0;
  const completedUsers = steps[steps.length - 1]?.users ?? 0;

  return {
    steps,
    totalUsers,
    completedUsers,
    overallConversionRate:
      totalUsers > 0
        ? Math.round((completedUsers / totalUsers) * 10000) / 100
        : 0,
  };
}
