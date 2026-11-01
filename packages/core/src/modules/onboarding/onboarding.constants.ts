import { z } from 'zod';
import { zTimezone } from '../organization/organization.constants';

// Set by openpanel.dev on the first visit, readable by the dashboard because
// both share the registrable domain. The value is URL-encoded JSON matching
// `zOrganizationAttribution`.
export const ATTRIBUTION_COOKIE_NAME = 'op_attribution';
const ATTRIBUTION_FIELD_MAX_LENGTH = 512;
// One bad field (oversized, wrong type) drops that field, not the whole
// first touch.
const zAttributionField = z
  .string()
  .trim()
  .max(ATTRIBUTION_FIELD_MAX_LENGTH)
  .optional()
  .catch(undefined);

export const zOrganizationAttribution = z.object({
  referrer: zAttributionField,
  landingPage: zAttributionField,
  utmSource: zAttributionField,
  utmMedium: zAttributionField,
  utmCampaign: zAttributionField,
  utmContent: zAttributionField,
  utmTerm: zAttributionField,
  firstSeenAt: z.string().datetime().optional().catch(undefined),
});
export type IOrganizationAttribution = z.infer<typeof zOrganizationAttribution>;

// What ends up on the organization row: the cookie plus the referrer resolved
// to the same name/type the event pipeline uses, so Postgres can group by it.
export type IOrganizationAttributionStored = {
  [Key in keyof IOrganizationAttribution]-?: string | null;
} & {
  referrerName: string | null;
  referrerType: string | null;
};

export const zOnboardingProject = z
  .object({
    organization: z.string().optional(),
    organizationId: z.string().optional(),
    // Only used when a new organization is created.
    attribution: zOrganizationAttribution.optional(),
    project: z.string().min(3, 'Use at least 3 characters'),
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
