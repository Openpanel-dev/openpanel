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
  obj: Record<K, any>,
): [K, ...K[]] {
  const [firstKey, ...otherKeys] = Object.keys(obj) as K[];
  return [firstKey!, ...otherKeys];
}

export const mapKeys = objectToZodEnums;

export const zChartEventFilter = z.object({
  id: z.string().optional(),
  name: z.string(),
  operator: z.enum(objectToZodEnums(operators)),
  value: z.array(z.string().or(z.number()).or(z.boolean()).or(z.null())),
});

export const zChartEvent = z.object({
  id: z.string().optional(),
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
  filters: z.array(zChartEventFilter).default([]),
});
export const zChartBreakdown = z.object({
  id: z.string().optional(),
  name: z.string(),
});

export const zChartEvents = z.array(zChartEvent);
export const zChartBreakdowns = z.array(zChartBreakdown);

export const zChartType = z.enum(objectToZodEnums(chartTypes));

export const zLineType = z.enum(objectToZodEnums(lineTypes));

export const zTimeInterval = z.enum(objectToZodEnums(intervals));

export const zMetric = z.enum(objectToZodEnums(metrics));

export const zRange = z.enum(objectToZodEnums(timeWindows));

export const zCriteria = z.enum(['on_or_after', 'on']);

export const zChartInput = z.object({
  chartType: zChartType.default('linear'),
  interval: zTimeInterval.default('day'),
  events: zChartEvents,
  breakdowns: zChartBreakdowns.default([]),
  range: zRange.default('30d'),
  previous: z.boolean().default(false),
  formula: z.string().optional(),
  metric: zMetric.default('sum'),
  projectId: z.string(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  criteria: zCriteria.optional(),
  funnelGroup: z.string().optional(),
  funnelWindow: z.number().optional(),
});

export const zReportInput = zChartInput.extend({
  name: z.string(),
  lineType: zLineType,
  unit: z.string().optional(),
});

export const zInviteUser = z.object({
  email: z.string().email(),
  organizationId: z.string(),
  role: z.enum(['org:admin', 'org:member']),
  access: z.array(z.string()),
});

export const zShareOverview = z.object({
  organizationId: z.string(),
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
    organizationId: z.string().optional(),
    project: z.string().min(3),
    domain: z.string().url().or(z.literal('').or(z.null())),
    cors: z.array(z.string()).default([]),
    website: z.boolean(),
    app: z.boolean(),
    backend: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.organization && !data.organizationId) {
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

export const zSlackAuthResponse = z.object({
  ok: z.literal(true),
  app_id: z.string(),
  authed_user: z.object({
    id: z.string(),
  }),
  scope: z.string(),
  token_type: z.literal('bot'),
  access_token: z.string(),
  bot_user_id: z.string(),
  team: z.object({
    id: z.string(),
    name: z.string(),
  }),
  incoming_webhook: z.object({
    channel: z.string(),
    channel_id: z.string(),
    configuration_url: z.string().url(),
    url: z.string().url(),
  }),
});

export const zSlackConfig = z
  .object({
    type: z.literal('slack'),
  })
  .merge(zSlackAuthResponse);

export type ISlackConfig = z.infer<typeof zSlackConfig>;

export const zWebhookConfig = z.object({
  type: z.literal('webhook'),
  url: z.string().url(),
  headers: z.record(z.string()),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type IWebhookConfig = z.infer<typeof zWebhookConfig>;

export const zDiscordConfig = z.object({
  type: z.literal('discord'),
  url: z.string().url(),
});
export type IDiscordConfig = z.infer<typeof zDiscordConfig>;

export const zAppConfig = z.object({
  type: z.literal('app'),
});
export type IAppConfig = z.infer<typeof zAppConfig>;

export const zEmailConfig = z.object({
  type: z.literal('email'),
});
export type IEmailConfig = z.infer<typeof zEmailConfig>;

export type IIntegrationConfig =
  | ISlackConfig
  | IDiscordConfig
  | IWebhookConfig
  | IAppConfig
  | IEmailConfig;

const zCreateIntegration = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
});

export const zCreateSlackIntegration = zCreateIntegration;

export const zCreateWebhookIntegration = zCreateIntegration.merge(
  z.object({
    config: zWebhookConfig,
  }),
);

export const zCreateDiscordIntegration = zCreateIntegration.merge(
  z.object({
    config: zDiscordConfig,
  }),
);

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

export const zProjectFilters = z.discriminatedUnion('type', [
  zProjectFilterIp,
  zProjectFilterProfileId,
]);
export type IProjectFilters = z.infer<typeof zProjectFilters>;

export const zProject = z.object({
  id: z.string(),
  name: z.string().min(1),
  filters: z.array(zProjectFilters).default([]),
  domain: z.string().url().or(z.literal('').or(z.null())),
  cors: z.array(z.string()).default([]),
  crossDomain: z.boolean().default(false),
});
export type IProjectEdit = z.infer<typeof zProject>;

export const zPassword = z.string().min(8);

export const zSignInEmail = z.object({
  email: z.string().email().min(1),
  password: zPassword,
});
export type ISignInEmail = z.infer<typeof zSignInEmail>;

export const zSignUpEmail = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    password: zPassword,
    confirmPassword: zPassword,
    inviteId: z.string().nullish(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export type ISignUpEmail = z.infer<typeof zSignUpEmail>;

export const zResetPassword = z.object({
  token: z.string(),
  password: z.string().min(8),
});
export type IResetPassword = z.infer<typeof zResetPassword>;

export const zRequestResetPassword = z.object({
  email: z.string().email(),
});
export type IRequestResetPassword = z.infer<typeof zRequestResetPassword>;

export const zSignInShare = z.object({
  password: z.string().min(1),
  shareId: z.string().min(1),
});
export type ISignInShare = z.infer<typeof zSignInShare>;

export const zCheckout = z.object({
  productPriceId: z.string(),
  organizationId: z.string(),
  projectId: z.string().nullish(),
  productId: z.string(),
});
export type ICheckout = z.infer<typeof zCheckout>;
