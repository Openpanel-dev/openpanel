//
// `zChartEvent`/`zChartEventFilter` are chart/report vocabulary that has not
// moved to core yet (ADR-008's "report" module is a later wave), so per
// `constants-stay-isomorphic` (zod, another `*.constants.ts`, or type-only —
// nothing else) they cannot be value-imported from packages/validation here.
// Diverged local copy instead, same treatment
// as./modules/cohort/cohort.constants.ts's zChartEventFilter since M5-003 —
// including inlining `operators`/`chartSegments`/`filterValueTypes` as literal
// key tuples rather than importing them from packages/constants. TODO(report
// module): once report.constants.ts exists, delete this duplicate and import
// zChartEvent from there instead.
//
// Isomorphic by the AGENTS.md rule otherwise: zod and nothing else.

import { z } from 'zod';

const CHART_EVENT_FILTER_OPERATORS = [
  'is',
  'isNot',
  'contains',
  'doesNotContain',
  'startsWith',
  'endsWith',
  'regex',
  'isNull',
  'isNotNull',
  'gt',
  'lt',
  'gte',
  'lte',
  'inCohort',
  'notInCohort',
] as const;

const CHART_EVENT_FILTER_VALUE_TYPES = [
  'string',
  'number',
  'date',
  'datetime',
  'boolean',
] as const;

const CHART_EVENT_SEGMENTS = [
  'event',
  'user',
  'session',
  'group',
  'user_average',
  'one_event_per_user',
  'property_sum',
  'property_average',
  'property_max',
  'property_min',
] as const;

const zChartEventFilter = z.object({
  id: z.string().optional().describe('Unique identifier for the filter'),
  name: z.string().describe('The property name to filter on'),
  operator: z
    .enum(CHART_EVENT_FILTER_OPERATORS)
    .describe('The operator to use for the filter'),
  value: z
    .array(z.string().or(z.number()).or(z.boolean()).or(z.null()))
    .describe('The values to filter on'),
  type: z
    .enum(CHART_EVENT_FILTER_VALUE_TYPES)
    .optional()
    .describe(
      'Cast type for the column/value in equality & comparison operators ' +
        '(string/number/date/datetime/boolean). Absent = legacy behavior.'
    ),
  cohortId: z
    .string()
    .optional()
    .describe(
      'DEPRECATED: legacy single-cohort id, kept for saved reports. ' +
        'New code reads cohortIds via getCohortIds(filter).'
    ),
  cohortIds: z
    .array(z.string())
    .optional()
    .describe(
      'Cohort IDs for inCohort/notInCohort. Multiple ids OR-match ' +
        '(matches profiles in any of the listed cohorts).'
    ),
});

const zChartEventSegment = z
  .enum(CHART_EVENT_SEGMENTS)
  .default('event')
  .describe('Defines how the event data should be segmented or aggregated');

const zChartEvent = z.object({
  id: z
    .string()
    .optional()
    .describe('Unique identifier for the chart event configuration'),
  name: z.string().describe('The name of the event as tracked in the system'),
  displayName: z
    .string()
    .optional()
    .describe('A user-friendly name for display purposes'),
  property: z
    .string()
    .optional()
    .describe(
      'Optional property of the event used for specific segment calculations (e.g., value for property_sum/average)'
    ),
  segment: zChartEventSegment,
  filters: z
    .array(zChartEventFilter)
    .default([])
    .describe('Filters applied specifically to this event'),
});

export const zNotificationRuleEventConfig = z.object({
  type: z.literal('events'),
  events: z.array(zChartEvent),
});

export type INotificationRuleEventConfig = z.infer<
  typeof zNotificationRuleEventConfig
>;

export const zNotificationRuleFunnelConfig = z.object({
  type: z.literal('funnel'),
  events: z.array(zChartEvent).min(1),
});

export type INotificationRuleFunnelConfig = z.infer<
  typeof zNotificationRuleFunnelConfig
>;

export const zNotificationRuleConfig = z.discriminatedUnion('type', [
  zNotificationRuleEventConfig,
  zNotificationRuleFunnelConfig,
]);

export type INotificationRuleConfig = z.infer<typeof zNotificationRuleConfig>;

export const zCreateNotificationRule = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  template: z.string().optional(),
  config: zNotificationRuleConfig,
  integrations: z.array(z.string()),
  sendToApp: z.boolean(),
  sendToEmail: z.boolean(),
  projectId: z.string(),
});

export type ICreateNotificationRule = z.infer<typeof zCreateNotificationRule>;
