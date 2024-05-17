import { z } from 'zod';

import {
  chartTypes,
  intervals,
  lineTypes,
  metrics,
  operators,
  timeWindows,
} from '@openpanel/constants';

export function objectToZodEnums<K extends string>(
  obj: Record<K, any>
): [K, ...K[]] {
  const [firstKey, ...otherKeys] = Object.keys(obj) as K[];
  return [firstKey!, ...otherKeys];
}

export const mapKeys = objectToZodEnums;

export const zChartEvent = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().optional(),
  property: z.string().optional(),
  segment: z.enum([
    'event',
    'user',
    'session',
    'user_average',
    'one_event_per_user',
    'property_sum',
    'property_average',
  ]),
  filters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      operator: z.enum(objectToZodEnums(operators)),
      value: z.array(z.string().or(z.number()).or(z.boolean()).or(z.null())),
    })
  ),
});
export const zChartBreakdown = z.object({
  id: z.string(),
  name: z.string(),
});

export const zChartEvents = z.array(zChartEvent);
export const zChartBreakdowns = z.array(zChartBreakdown);

export const zChartType = z.enum(objectToZodEnums(chartTypes));

export const zLineType = z.enum(objectToZodEnums(lineTypes));

export const zTimeInterval = z.enum(objectToZodEnums(intervals));

export const zMetric = z.enum(objectToZodEnums(metrics));

export const zRange = z.enum(objectToZodEnums(timeWindows));

export const zChartInput = z.object({
  name: z.string().default(''),
  chartType: zChartType.default('linear'),
  lineType: zLineType.default('monotone'),
  interval: zTimeInterval.default('day'),
  events: zChartEvents,
  breakdowns: zChartBreakdowns.default([]),
  range: zRange.default('30d'),
  previous: z.boolean().default(false),
  formula: z.string().optional(),
  metric: zMetric.default('sum'),
  unit: z.string().optional(),
  previousIndicatorInverted: z.boolean().optional(),
  projectId: z.string(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
});

export const zInviteUser = z.object({
  email: z.string().email(),
  organizationSlug: z.string(),
  role: z.enum(['org:admin', 'org:member']),
  access: z.array(z.string()),
});

export const zShareOverview = z.object({
  organizationSlug: z.string(),
  projectId: z.string(),
  password: z.string().nullable(),
  public: z.boolean(),
});

export const zCreateReference = z.object({
  title: z.string(),
  description: z.string().nullish(),
  projectId: z.string(),
  datetime: z.string(),
});

export const zOnboardingProject = z
  .object({
    organization: z.string().optional(),
    organizationSlug: z.string().optional(),
    project: z.string().min(3),
    domain: z.string().url().or(z.literal('').or(z.null())),
    website: z.boolean(),
    app: z.boolean(),
    backend: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.organization && !data.organizationSlug) {
      ctx.addIssue({
        code: 'custom',
        message: 'Organization is required',
        path: ['organization'],
      });
      ctx.addIssue({
        code: 'custom',
        message: 'Organization is required',
        path: ['organizationSlug'],
      });
    }

    if (data.website && !data.domain) {
      ctx.addIssue({
        code: 'custom',
        message: 'Domain is required for website tracking',
        path: ['domain'],
      });
    }

    if (
      data.website === false &&
      data.app === false &&
      data.backend === false
    ) {
      ['app', 'backend', 'website'].forEach((key) => {
        ctx.addIssue({
          code: 'custom',
          message: 'At least one type must be selected',
          path: [key],
        });
      });
    }
  });
