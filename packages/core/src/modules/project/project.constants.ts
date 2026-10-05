// `zCreateProject`/`zUpdateProject` are the /manage REST body schemas.
//
// `zChartEvent` is imported by name, not re-exported: `zProjectFilterEvent`
// extends it as a bound identifier.

import { z } from 'zod';
import { zChartEvent } from '../report/report.constants';

export const ProjectTypeNames = {
  website: 'Website',
  app: 'App',
  backend: 'Backend',
} as const;

export const zProjectType = z.enum(['website', 'app', 'backend']);

export const zCreateProject = z.object({
  name: z.string().min(1),
  domain: z.string().url().or(z.literal('')).or(z.null()).optional(),
  cors: z.array(z.string()).default([]),
  crossDomain: z.boolean().optional().default(false),
  types: z.array(zProjectType).optional().default([]),
});

export const zUpdateProject = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().url().or(z.literal('')).or(z.null()).optional(),
  cors: z.array(z.string()).optional(),
  crossDomain: z.boolean().optional(),
  allowUnsafeRevenueTracking: z.boolean().optional(),
});

export const zProjectFilterIp = z.object({
  type: z.literal('ip'),
  ip: z.string(),
});
export type IProjectFilterIp = z.infer<typeof zProjectFilterIp>;

export const zProjectFilterProfileId = z.object({
  type: z.literal('profile_id'),
  profileId: z.string(),
});
export type IProjectFilterProfileId = z.infer<typeof zProjectFilterProfileId>;

export const zProjectFilterEvent = zChartEvent.extend({
  type: z.literal('event'),
});
export type IProjectFilterEvent = z.infer<typeof zProjectFilterEvent>;

export const zProjectFilters = z.discriminatedUnion('type', [
  zProjectFilterIp,
  zProjectFilterProfileId,
  zProjectFilterEvent,
]);
export type IProjectFilters = z.infer<typeof zProjectFilters>;

export const zProject = z.object({
  id: z.string(),
  name: z.string().min(1),
  filters: z.array(zProjectFilters).default([]),
  domain: z.string().url().or(z.literal('').or(z.null())),
  cors: z.array(z.string()).default([]),
  crossDomain: z.boolean().default(false),
  allowUnsafeRevenueTracking: z.boolean().default(false),
});
export type IProjectEdit = z.infer<typeof zProject>;

export const zProjectUpdate = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  filters: z.array(zProjectFilters).optional(),
  domain: z.string().url().or(z.literal('').or(z.null())).optional(),
  cors: z.array(z.string()).optional(),
  crossDomain: z.boolean().optional(),
  allowUnsafeRevenueTracking: z.boolean().optional(),
});
export type IProjectUpdate = z.infer<typeof zProjectUpdate>;
