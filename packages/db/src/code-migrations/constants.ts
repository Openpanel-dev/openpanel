// The vocabulary these one-shot migrations need, COPIED from packages/core
// rather than imported from it.
//
// ADR-022, Carl's rulings: "I'd rather have code-migrations isolated from core,
// so I'd rather duplicate code for this to be isolated." A migration reads rows
// written by a past version of the app, so it must keep describing the shape
// that existed when it was written — an import of the live
// `report.constants.ts` would silently redefine what migration 7 and 9 mean the
// next time someone edits a chart segment.
//
// Sources at the time of the move (2026-09-11), for anyone diffing:
// packages/core/src/modules/report/report.constants.ts (the chart types)
// packages/core/src/modules/organization/organization.constants.ts
// (zProjectAccessGrant) These are frozen. Do not re-sync them with core.

import { z } from 'zod';

/**
 * A per-project grant, as `20-invite-project-access-levels.ts` writes it.
 * Copied verbatim; that migration `.parse()`s with it, so it is a value.
 */
export const zProjectAccessGrant = z.object({
  projectId: z.string(),
  level: z.enum(['read', 'write']),
});

/**
 * The chart vocabulary, spelled as plain types rather than as the zod chain
 * core derives them from: `7-migrate-events-to-series.ts` and
 * `9-migrate-options.ts` use them type-only, and copying the schemas would
 * drag the whole operator/segment/filter enum tree along for no runtime gain.
 */
export interface IChartEventFilter {
  id?: string;
  name: string;
  operator:
    | 'is'
    | 'isNot'
    | 'contains'
    | 'doesNotContain'
    | 'startsWith'
    | 'endsWith'
    | 'regex'
    | 'isNull'
    | 'isNotNull'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte'
    | 'inCohort'
    | 'notInCohort';
  value: (string | number | boolean | null)[];
  type?: 'string' | 'number' | 'date' | 'datetime' | 'boolean';
  cohortId?: string;
  cohortIds?: string[];
}

export interface IChartEvent {
  id?: string;
  name: string;
  displayName?: string;
  property?: string;
  segment:
    | 'event'
    | 'user'
    | 'session'
    | 'group'
    | 'user_average'
    | 'one_event_per_user'
    | 'property_sum'
    | 'property_average'
    | 'property_max'
    | 'property_min';
  filters: IChartEventFilter[];
}

export interface IChartFormula {
  id?: string;
  type: 'formula';
  formula: string;
  displayName?: string;
  hideSeries?: string[];
}

export type IChartEventItem = (IChartEvent & { type: 'event' }) | IChartFormula;

export type IReportOptions =
  | { type: 'funnel'; funnelGroup?: string; funnelWindow?: number }
  | { type: 'retention'; criteria?: 'on_or_after' | 'on' }
  | {
      type: 'sankey';
      mode: 'between' | 'after' | 'before';
      steps: number;
      exclude: string[];
      include?: string[];
    }
  | { type: 'histogram'; stacked: boolean };
