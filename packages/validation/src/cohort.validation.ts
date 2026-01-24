import { z } from 'zod';
import { operators } from '@openpanel/constants';

// Helper function for enum conversion
function objectToZodEnums<K extends string>(
  obj: Record<K, any>,
): [K, ...K[]] {
  const [firstKey, ...otherKeys] = Object.keys(obj) as K[];
  return [firstKey!, ...otherKeys];
}

// Define zChartEventFilter locally to avoid circular dependency
const zChartEventFilter = z.object({
  id: z.string().optional().describe('Unique identifier for the filter'),
  name: z.string().describe('The property name to filter on'),
  operator: z
    .enum(objectToZodEnums(operators))
    .describe('The operator to use for the filter'),
  value: z
    .array(z.string().or(z.number()).or(z.boolean()).or(z.null()))
    .describe('The values to filter on'),
  cohortId: z
    .string()
    .optional()
    .describe('Cohort ID when using inCohort/notInCohort operators'),
});

// Timeframe schemas
export const zRelativeTimeframe = z.object({
  type: z.literal('relative'),
  value: z.enum(['7d', '30d', '90d', '180d', '365d']),
});

export const zAbsoluteTimeframe = z.object({
  type: z.literal('absolute'),
  start: z.string(), // ISO date string
  end: z.string().optional(), // ISO date string, optional for "since date"
});

export const zTimeframe = z.discriminatedUnion('type', [
  zRelativeTimeframe,
  zAbsoluteTimeframe,
]);

export type Timeframe = z.infer<typeof zTimeframe>;

// Frequency schema
export const zFrequency = z.object({
  operator: z.enum(['at_least', 'exactly', 'at_most']),
  count: z.number().int().min(1),
});

export type Frequency = z.infer<typeof zFrequency>;

// Event criteria schema
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

// Event-based cohort definition
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

// Property-based cohort definition
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

// Combined cohort definition
export const zCohortDefinition = z.discriminatedUnion('type', [
  zEventBasedCohortDefinition,
  zPropertyBasedCohortDefinition,
]);

export type CohortDefinition = z.infer<typeof zCohortDefinition>;

// Cohort input for creation
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
    .describe('Whether this is a static cohort (one-time snapshot)'),
  computeOnDemand: z
    .boolean()
    .default(false)
    .describe('Whether to compute on-demand instead of storing'),
});

export type CohortInput = z.infer<typeof zCohortInput>;

// Cohort update schema
export const zCohortUpdate = z.object({
  id: z.string().describe('The cohort ID to update'),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  definition: zCohortDefinition.optional(),
  isStatic: z.boolean().optional(),
  computeOnDemand: z.boolean().optional(),
});

export type CohortUpdate = z.infer<typeof zCohortUpdate>;

// Cohort filter schema (for using cohorts as filters in charts)
export const zCohortFilter = z.object({
  cohortId: z.string().describe('The cohort ID to filter by'),
  operator: z
    .enum(['inCohort', 'notInCohort'])
    .default('inCohort')
    .describe('Whether to include or exclude cohort members'),
});

export type CohortFilter = z.infer<typeof zCohortFilter>;
