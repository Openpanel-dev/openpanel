import { z } from 'zod';

import {
  chartSegments,
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
  id: z.string().optional().describe('Unique identifier for the filter'),
  name: z.string().describe('The property name to filter on'),
  operator: z
    .enum(objectToZodEnums(operators))
    .describe('The operator to use for the filter'),
  value: z
    .array(z.string().or(z.number()).or(z.boolean()).or(z.null()))
    .describe('The values to filter on'),
});

export const zChartEventSegment = z
  .enum(objectToZodEnums(chartSegments))
  .default('event')
  .describe('Defines how the event data should be segmented or aggregated');

export const zChartEvent = z.object({
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
      'Optional property of the event used for specific segment calculations (e.g., value for property_sum/average)',
    ),
  segment: zChartEventSegment,
  filters: z
    .array(zChartEventFilter)
    .default([])
    .describe('Filters applied specifically to this event'),
});

export const zChartFormula = z.object({
  id: z
    .string()
    .optional()
    .describe('Unique identifier for the formula configuration'),
  type: z.literal('formula'),
  formula: z.string().describe('The formula expression (e.g., A+B, A/B)'),
  displayName: z
    .string()
    .optional()
    .describe('A user-friendly name for display purposes'),
});

// Event with type field for discriminated union
export const zChartEventWithType = zChartEvent.extend({
  type: z.literal('event'),
});

export const zChartEventItem = z.discriminatedUnion('type', [
  zChartEventWithType,
  zChartFormula,
]);

export const zChartBreakdown = z.object({
  id: z.string().optional(),
  name: z.string(),
});

export const zChartSeries = z
  .array(zChartEventItem)
  .describe(
    'Array of series (events or formulas) to be tracked and displayed in the chart',
  );

export const zChartBreakdowns = z.array(zChartBreakdown);

export const zChartType = z.enum(objectToZodEnums(chartTypes));

export const zLineType = z.enum(objectToZodEnums(lineTypes));

export const zTimeInterval = z.enum(objectToZodEnums(intervals));

export const zMetric = z.enum(objectToZodEnums(metrics));

export const zRange = z.enum(objectToZodEnums(timeWindows));

export const zCriteria = z.enum(['on_or_after', 'on']);

// Report Options - Discriminated union based on chart type
export const zFunnelOptions = z.object({
  type: z.literal('funnel'),
  funnelGroup: z.string().optional(),
  funnelWindow: z.number().optional(),
});

export const zRetentionOptions = z.object({
  type: z.literal('retention'),
  criteria: zCriteria.optional(),
});

export const zSankeyOptions = z.object({
  type: z.literal('sankey'),
  mode: z.enum(['between', 'after', 'before']),
  steps: z.number().min(2).max(10).default(5),
  exclude: z.array(z.string()).default([]),
  include: z.array(z.string()).optional(),
});

export const zHistogramOptions = z.object({
  type: z.literal('histogram'),
  stacked: z.boolean().default(false),
});

export const zReportOptions = z.discriminatedUnion('type', [
  zFunnelOptions,
  zRetentionOptions,
  zSankeyOptions,
  zHistogramOptions,
]);

export type IReportOptions = z.infer<typeof zReportOptions>;
export type ISankeyOptions = z.infer<typeof zSankeyOptions>;
export type IHistogramOptions = z.infer<typeof zHistogramOptions>;

export const zWidgetType = z.enum(['realtime', 'counter']);
export type IWidgetType = z.infer<typeof zWidgetType>;

export const zRealtimeWidgetOptions = z.object({
  type: z.literal('realtime'),
  referrers: z.boolean().default(true),
  countries: z.boolean().default(true),
  paths: z.boolean().default(false),
});

export const zCounterWidgetOptions = z.object({
  type: z.literal('counter'),
});

export const zWidgetOptions = z.discriminatedUnion('type', [
  zRealtimeWidgetOptions,
  zCounterWidgetOptions,
]);

export type IWidgetOptions = z.infer<typeof zWidgetOptions>;
export type ICounterWidgetOptions = z.infer<typeof zCounterWidgetOptions>;
export type IRealtimeWidgetOptions = z.infer<typeof zRealtimeWidgetOptions>;

// Base input schema - for API calls, engine, chart queries
export const zReportInput = z.object({
  projectId: z.string().describe('The ID of the project this chart belongs to'),
  chartType: zChartType
    .default('linear')
    .describe('What type of chart should be displayed'),
  interval: zTimeInterval
    .default('day')
    .describe(
      'The time interval for data aggregation (e.g., day, week, month)',
    ),
  series: zChartSeries.describe(
    'Array of series (events or formulas) to be tracked and displayed in the chart',
  ),
  breakdowns: zChartBreakdowns
    .default([])
    .describe('Array of dimensions to break down the data by'),
  range: zRange
    .default('30d')
    .describe('The time range for which data should be displayed'),
  startDate: z
    .string()
    .nullish()
    .describe(
      'Custom start date for the data range (overrides range if provided)',
    ),
  endDate: z
    .string()
    .nullish()
    .describe(
      'Custom end date for the data range (overrides range if provided)',
    ),
  previous: z
    .boolean()
    .default(false)
    .describe('Whether to show data from the previous period for comparison'),
  formula: z
    .string()
    .optional()
    .describe('Custom formula for calculating derived metrics'),
  metric: zMetric
    .default('sum')
    .describe(
      'The aggregation method for the metric (e.g., sum, count, average)',
    ),
  limit: z
    .number()
    .optional()
    .describe('Limit how many series should be returned'),
  offset: z
    .number()
    .optional()
    .describe('Skip how many series should be returned'),
  options: zReportOptions
    .optional()
    .describe('Chart-specific options (funnel, retention, sankey)'),
  // Optional display fields
  name: z.string().optional().describe('The user-defined name for the report'),
  lineType: zLineType
    .optional()
    .describe('The visual style of the line in the chart'),
  unit: z
    .string()
    .optional()
    .describe(
      "Optional unit of measurement for the chart's Y-axis (e.g., $, %, users)",
    ),
});

// Complete report schema - for saved reports
export const zReport = zReportInput.extend({
  name: z
    .string()
    .default('Untitled')
    .describe('The user-defined name for the report'),
  lineType: zLineType
    .default('monotone')
    .describe('The visual style of the line in the chart'),
});

// Alias for backward compatibility
export const zChartInput = zReportInput;

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

export const zShareDashboard = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  dashboardId: z.string(),
  password: z.string().nullable(),
  public: z.boolean(),
});

export const zShareReport = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  reportId: z.string(),
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
    timezone: z.string().optional(),
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
  mode: z.enum(['message', 'javascript']).default('message'),
  javascriptTemplate: z.string().optional(),
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
  allowUnsafeRevenueTracking: z.boolean().default(false),
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
  shareType: z
    .enum(['overview', 'dashboard', 'report'])
    .optional()
    .default('overview'),
});
export type ISignInShare = z.infer<typeof zSignInShare>;

export const zCheckout = z.object({
  productPriceId: z.string(),
  organizationId: z.string(),
  projectId: z.string().nullish(),
  productId: z.string(),
});
export type ICheckout = z.infer<typeof zCheckout>;

export const zEditOrganization = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
  timezone: z.string().min(1),
});

const zProjectMapper = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const createFileImportConfig = <T extends string>(provider: T) =>
  z.object({
    provider: z.literal(provider),
    type: z.literal('file'),
    fileUrl: z.string().url(),
  });

// Import configs
export const zUmamiImportConfig = createFileImportConfig('umami').extend({
  projectMapper: z.array(zProjectMapper),
});

export type IUmamiImportConfig = z.infer<typeof zUmamiImportConfig>;

export const zPlausibleImportConfig = createFileImportConfig('plausible');
export type IPlausibleImportConfig = z.infer<typeof zPlausibleImportConfig>;

export const zMixpanelImportConfig = z.object({
  provider: z.literal('mixpanel'),
  type: z.literal('api'),
  serviceAccount: z.string().min(1),
  serviceSecret: z.string().min(1),
  projectId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  mapScreenViewProperty: z.string().optional(),
});
export type IMixpanelImportConfig = z.infer<typeof zMixpanelImportConfig>;

export type IImportConfig =
  | IUmamiImportConfig
  | IPlausibleImportConfig
  | IMixpanelImportConfig;

export const zCreateImport = z.object({
  projectId: z.string().min(1),
  provider: z.enum(['umami', 'plausible', 'mixpanel']),
  config: z.union([
    zUmamiImportConfig,
    zPlausibleImportConfig,
    zMixpanelImportConfig,
  ]),
});

export type ICreateImport = z.infer<typeof zCreateImport>;

export * from './types.insights';
export * from './track.validation';
export * from './event-blocklist';
