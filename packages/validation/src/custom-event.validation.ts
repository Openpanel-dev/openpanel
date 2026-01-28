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

// Event criteria for custom events (simplified - no timeframe/frequency)
export const zCustomEventCriteria = z.object({
  name: z.string().min(1).describe('The source event name'),
  filters: z
    .array(zChartEventFilter)
    .default([])
    .describe('Filters applied to this event'),
});

export type ICustomEventCriteria = z.infer<typeof zCustomEventCriteria>;

// Custom event definition (OR-only logic)
export const zCustomEventDefinition = z.object({
  operator: z.literal('or'),
  events: z
    .array(zCustomEventCriteria)
    .min(1)
    .max(20)
    .describe('Source events to combine (max 20)'),
});

export type ICustomEventDefinition = z.infer<typeof zCustomEventDefinition>;

// Create/update schemas
export const zCustomEventInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  projectId: z.string(),
  definition: zCustomEventDefinition,
  conversion: z.boolean().default(false),
});

export type ICustomEventInput = z.infer<typeof zCustomEventInput>;

export const zCustomEventUpdate = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  definition: zCustomEventDefinition.optional(),
  conversion: z.boolean().optional(),
});

export type ICustomEventUpdate = z.infer<typeof zCustomEventUpdate>;
