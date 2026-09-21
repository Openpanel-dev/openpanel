// Moved from packages/validation/src/cohort.validation.ts (M5-003, ADR-008's
// module map: cohort owns "C"). packages/validation/src/cohort.validation.ts
// becomes a re-export shim of this file's `./modules/cohort/cohort.constants`
// subpath (same shape as packages/db/src/gsc.ts since M5-002), so
// apps/start and packages/db/src/types.ts keep resolving these symbols
// through packages/validation's existing barrel unchanged.
//
// Isomorphic by the AGENTS.md rule: zod, another `*.constants.ts`, or
// nothing. `zChartEventFilter` used to be a diverged local copy here
// (TODO(P7) in M5-003) to dodge a TDZ from importing it through
// packages/validation's barrel before that barrel finished initializing;
// now that it lives in report.constants.ts — an isomorphic, cycle-free
// sibling — importing it directly is safe, and the duplicate is gone
// (M7-006).

import { z } from 'zod';
import { zChartEventFilter } from '../report/report.constants';

export const zRelativeTimeframe = z.object({
  type: z.literal('relative'),
  value: z.enum(['7d', '30d', '90d', '180d', '365d']),
});

// toDate() in the cohort query builder only understands plain calendar dates.
const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format');

export const zAbsoluteTimeframe = z.object({
  type: z.literal('absolute'),
  start: zDate,
  end: zDate.optional(),
});

export const zTimeframe = z.discriminatedUnion('type', [
  zRelativeTimeframe,
  zAbsoluteTimeframe,
]);

export type Timeframe = z.infer<typeof zTimeframe>;

// A count of 0 is how a criterion says "never did this event", so it has to
// be accepted — but only with the two operators that read that way. `gte 0`
// matches every profile, which is not a criterion at all, and letting it
// through would leave the query builder with a third case to guess at.
export const zFrequency = z
  .object({
    operator: z.enum(['gte', 'eq', 'lte']),
    count: z.number().int().min(0),
  })
  .refine((frequency) => frequency.count > 0 || frequency.operator !== 'gte', {
    message:
      'A count of 0 means "never", which only "exactly" and "at most" express',
    path: ['count'],
  });

export type Frequency = z.infer<typeof zFrequency>;

export const zEventCriteria = z.object({
  name: z.string().min(1).describe('The event name to match'),
  filters: z
    .array(zChartEventFilter)
    .default([])
    .describe('Filters applied to event properties'),
  timeframe: zTimeframe.describe('When the event should have occurred'),
  frequency: zFrequency
    .optional()
    .describe('How many times the event should have occurred'),
});

export type EventCriteria = z.infer<typeof zEventCriteria>;

export const zEventBasedCohortDefinition = z.object({
  type: z.literal('event'),
  criteria: z.object({
    operator: z.enum(['and', 'or']).describe('How to combine multiple events'),
    events: z
      .array(zEventCriteria)
      .min(1)
      .describe('Array of event criteria to match'),
  }),
});

export type EventBasedCohortDefinition = z.infer<
  typeof zEventBasedCohortDefinition
>;

export const zPropertyBasedCohortDefinition = z.object({
  type: z.literal('property'),
  criteria: z.object({
    operator: z
      .enum(['and', 'or'])
      .describe('How to combine multiple properties'),
    properties: z
      .array(zChartEventFilter)
      .min(1)
      .describe('Array of profile property filters'),
  }),
});

export type PropertyBasedCohortDefinition = z.infer<
  typeof zPropertyBasedCohortDefinition
>;

export const zCohortDefinition = z.discriminatedUnion('type', [
  zEventBasedCohortDefinition,
  zPropertyBasedCohortDefinition,
]);

export type CohortDefinition = z.infer<typeof zCohortDefinition>;

export const zCohortInput = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .describe('User-friendly name for the cohort'),
  description: z
    .string()
    .max(1000)
    .optional()
    .describe('Optional description of the cohort'),
  projectId: z.string().describe('The project this cohort belongs to'),
  definition: zCohortDefinition.describe('The cohort criteria definition'),
  isStatic: z
    .boolean()
    .default(false)
    .describe(
      'Whether this cohort is frozen — if true, membership is computed once and not auto-refreshed'
    ),
});

export type CohortInput = z.infer<typeof zCohortInput>;

export const zCohortUpdate = z.object({
  id: z.string().describe('The cohort ID to update'),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  definition: zCohortDefinition.optional(),
  isStatic: z.boolean().optional(),
});

export type CohortUpdate = z.infer<typeof zCohortUpdate>;

export const zCohortFilter = z.object({
  cohortId: z.string().describe('The cohort ID to filter by'),
  operator: z
    .enum(['inCohort', 'notInCohort'])
    .default('inCohort')
    .describe('Whether to include or exclude cohort members'),
});

export type CohortFilter = z.infer<typeof zCohortFilter>;
