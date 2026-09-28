import { z } from 'zod';
import { zTimezone } from '../organization/organization.constants';

export const zOnboardingProject = z
  .object({
    organization: z.string().optional(),
    organizationId: z.string().optional(),
    project: z.string().min(3),
    domain: z.string().url().or(z.literal('').or(z.null())),
    cors: z.array(z.string()).default([]),
    website: z.boolean(),
    app: z.boolean(),
    backend: z.boolean(),
    timezone: zTimezone.optional(),
  })
  .superRefine((data, ctx) => {
    if (!(data.organization || data.organizationId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Organization is required',
        path: ['organization'],
      });
      ctx.addIssue({
        code: 'custom',
        message: 'Organization is required',
        path: ['organizationId'],
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
      for (const key of ['app', 'backend', 'website']) {
        ctx.addIssue({
          code: 'custom',
          message: 'At least one type must be selected',
          path: [key],
        });
      }
    }
  });
export type IOnboardingProject = z.infer<typeof zOnboardingProject>;
