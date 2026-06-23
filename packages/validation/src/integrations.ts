import { z } from 'zod';

// ---------------------------------------------------------------------------
// Per-type config schemas
// ---------------------------------------------------------------------------

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
  .extend(zSlackAuthResponse.shape);
export type ISlackConfig = z.infer<typeof zSlackConfig>;

export const zWebhookConfig = z.object({
  type: z.literal('webhook'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()),
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

// S3 Export Integration Config - Base fields shared by both auth modes
const zS3ExportConfigBase = z.object({
  type: z.literal('s3_export'),
  bucket: z.string().min(1, 'Bucket name is required'),
  prefix: z.string().default('openpanel-exports'),
  region: z.string().min(1, 'Region is required'),
  endpoint: z.string().url().optional(), // For R2, MinIO, etc.
  format: z.enum(['jsonl_gzip', 'parquet']).default('jsonl_gzip'),
  // Optional encryption settings (S3-side encryption)
  encryption: z.enum(['SSE-S3', 'SSE-KMS', 'none']).default('SSE-S3'),
  kmsKeyId: z.string().optional(),
});

// Auth mode: IAM Role assumption (AWS best practice)
const zS3AuthIamRole = z.object({
  authMode: z.literal('iam_role'),
  roleArn: z.string().min(1, 'IAM Role ARN is required'),
  externalId: z.string().optional(),
});

// Auth mode: Access Keys (for R2, MinIO, DigitalOcean Spaces, etc.)
const zS3AuthAccessKey = z.object({
  authMode: z.literal('access_key'),
  accessKeyId: z.string().min(1, 'Access Key ID is required'),
  secretAccessKey: z.string().min(1, 'Secret Access Key is required'),
});

// S3 config with IAM role auth
export const zS3ExportConfigIamRole = zS3ExportConfigBase.merge(zS3AuthIamRole);
export type IS3ExportConfigIamRole = z.infer<typeof zS3ExportConfigIamRole>;

// S3 config with access key auth
export const zS3ExportConfigAccessKey =
  zS3ExportConfigBase.merge(zS3AuthAccessKey);
export type IS3ExportConfigAccessKey = z.infer<typeof zS3ExportConfigAccessKey>;

// Combined discriminated union
export const zS3ExportConfig = z.discriminatedUnion('authMode', [
  zS3ExportConfigIamRole,
  zS3ExportConfigAccessKey,
]);
export type IS3ExportConfig = z.infer<typeof zS3ExportConfig>;

// GCS Export Integration Config
export const zGCSExportConfig = z.object({
  type: z.literal('gcs_export'),
  bucket: z.string().min(1, 'Bucket name is required'),
  prefix: z.string().default('openpanel-exports'),
  format: z.enum(['jsonl_gzip', 'parquet']).default('jsonl_gzip'),
  // Service account credentials (JSON key as string)
  serviceAccountKey: z.string().min(1, 'Service account key is required'),
});
export type IGCSExportConfig = z.infer<typeof zGCSExportConfig>;

// ---------------------------------------------------------------------------
// The explicit discriminated union — the SOURCE OF TRUTH for narrowing.
// Do NOT derive this from the registry: deriving via z.infer over a registry
// array can silently widen a member to { type: string } and break every
// config.type narrow downstream (incl. Prisma's IPrismaIntegrationConfig).
// The registry below is forced to MATCH this union via `satisfies`, never the
// other way round.
// ---------------------------------------------------------------------------

export type IIntegrationConfig =
  | ISlackConfig
  | IDiscordConfig
  | IWebhookConfig
  | IAppConfig
  | IEmailConfig
  | IS3ExportConfig
  | IGCSExportConfig;

export type IIntegrationType = IIntegrationConfig['type'];

// ---------------------------------------------------------------------------
// Plugin descriptor registry (core layer). Each integration declares its
// capabilities, setup style, config schema and catalog metadata once. The
// server (packages/integrations) and client (apps/start) registries are keyed
// by the same `type` literal and are forced to cover this union.
// ---------------------------------------------------------------------------

export type IIntegrationKind = 'notification' | 'export';

export interface IIntegrationDescriptor<
  TType extends IIntegrationType = IIntegrationType,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  type: TType;
  kinds: readonly IIntegrationKind[];
  // 'form' renders a config form; 'oauth' renders an install button and fills
  // the config via an OAuth callback.
  setup: 'form' | 'oauth';
  configSchema: TSchema;
  catalog: {
    name: string;
    description: string;
    // Pseudo-integrations (app/email) are dispatched by flags, not user-added.
    hidden?: boolean;
  };
}

export const slackDescriptor = {
  type: 'slack',
  kinds: ['notification'],
  setup: 'oauth',
  configSchema: zSlackConfig,
  catalog: {
    name: 'Slack',
    description:
      'Connect your Slack workspace to get notified when new issues are created.',
  },
} as const satisfies IIntegrationDescriptor<'slack', typeof zSlackConfig>;

export const discordDescriptor = {
  type: 'discord',
  kinds: ['notification'],
  setup: 'form',
  configSchema: zDiscordConfig,
  catalog: {
    name: 'Discord',
    description:
      'Connect your Discord server to get notified when new issues are created.',
  },
} as const satisfies IIntegrationDescriptor<'discord', typeof zDiscordConfig>;

export const webhookDescriptor = {
  type: 'webhook',
  kinds: ['notification'],
  setup: 'form',
  configSchema: zWebhookConfig,
  catalog: {
    name: 'Webhook',
    description:
      'Create a webhook to take actions in your own systems when new events are created.',
  },
} as const satisfies IIntegrationDescriptor<'webhook', typeof zWebhookConfig>;

export const appDescriptor = {
  type: 'app',
  kinds: ['notification'],
  setup: 'form',
  configSchema: zAppConfig,
  catalog: { name: 'Website', description: 'In-app notifications', hidden: true },
} as const satisfies IIntegrationDescriptor<'app', typeof zAppConfig>;

export const emailDescriptor = {
  type: 'email',
  kinds: ['notification'],
  setup: 'form',
  configSchema: zEmailConfig,
  catalog: { name: 'Email', description: 'Email notifications', hidden: true },
} as const satisfies IIntegrationDescriptor<'email', typeof zEmailConfig>;

export const s3ExportDescriptor = {
  type: 's3_export',
  kinds: ['export'],
  setup: 'form',
  configSchema: zS3ExportConfig,
  catalog: {
    name: 'S3 Export',
    description:
      'Export events to Amazon S3 for loading into Redshift, Snowflake, Athena, or other data warehouses.',
  },
} as const satisfies IIntegrationDescriptor<'s3_export', typeof zS3ExportConfig>;

export const gcsExportDescriptor = {
  type: 'gcs_export',
  kinds: ['export'],
  setup: 'form',
  configSchema: zGCSExportConfig,
  catalog: {
    name: 'GCS Export',
    description:
      'Export events to Google Cloud Storage for loading into BigQuery or other data warehouses.',
  },
} as const satisfies IIntegrationDescriptor<
  'gcs_export',
  typeof zGCSExportConfig
>;

export const INTEGRATION_DESCRIPTORS = [
  slackDescriptor,
  discordDescriptor,
  webhookDescriptor,
  appDescriptor,
  emailDescriptor,
  s3ExportDescriptor,
  gcsExportDescriptor,
] as const;

const descriptorByType = new Map(
  INTEGRATION_DESCRIPTORS.map((d) => [d.type, d] as const),
);

export function getDescriptor(type: IIntegrationType): IIntegrationDescriptor {
  const descriptor = descriptorByType.get(type);
  if (!descriptor) {
    throw new Error(`Unknown integration type: ${type}`);
  }
  return descriptor;
}

export function descriptorsByKind(kind: IIntegrationKind) {
  // kinds is a readonly literal tuple per descriptor; widen for `.includes`
  // (the union of literal tuples otherwise narrows the arg type to never).
  return INTEGRATION_DESCRIPTORS.filter((d) =>
    (d.kinds as readonly IIntegrationKind[]).includes(kind),
  );
}

export function isKind(
  config: Pick<IIntegrationConfig, 'type'> | { type?: string },
  kind: IIntegrationKind,
): boolean {
  // Lenient lookup: used as a filter predicate over all integrations, including
  // rows whose config is still empty (e.g. a Slack integration before its OAuth
  // callback fills the config). Unknown/undefined types are simply not of `kind`.
  const descriptor = descriptorByType.get(config.type as IIntegrationType);
  return descriptor
    ? (descriptor.kinds as readonly IIntegrationKind[]).includes(kind)
    : false;
}

// Runtime parser for any integration config. A plain union (not
// discriminatedUnion) because the s3 schema is itself a union on `authMode`.
// Static narrowing always comes from the explicit IIntegrationConfig above.
export const zIntegrationConfig = z.union([
  zSlackConfig,
  zWebhookConfig,
  zDiscordConfig,
  zAppConfig,
  zEmailConfig,
  zS3ExportConfig,
  zGCSExportConfig,
]);

// ---------------------------------------------------------------------------
// Create-integration input schemas
// ---------------------------------------------------------------------------

const zCreateIntegrationBase = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  projectId: z.string().min(1),
});

// Generic create input used by the registry-driven tRPC procedure. oauth
// integrations (slack) create with no config (filled by the callback), so
// config is optional here and narrowed/validated per-plugin server-side.
export const zCreateIntegration = zCreateIntegrationBase.extend({
  config: zIntegrationConfig.optional(),
});
export type ICreateIntegration = z.infer<typeof zCreateIntegration>;

export const zCreateSlackIntegration = zCreateIntegrationBase;

export const zCreateWebhookIntegration = zCreateIntegrationBase.extend({
  config: zWebhookConfig,
});

export const zCreateDiscordIntegration = zCreateIntegrationBase.extend({
  config: zDiscordConfig,
});

export const zCreateS3ExportIntegration = zCreateIntegrationBase.merge(
  z.object({
    config: zS3ExportConfig,
  }),
);

export const zCreateGCSExportIntegration = zCreateIntegrationBase.merge(
  z.object({
    config: zGCSExportConfig,
  }),
);

// ---------------------------------------------------------------------------
// Compile-time guards (the type-safety gate). These are type aliases, so they
// add no runtime and don't trip unused-locals, but they fail `tsc` if the
// invariant breaks.
// ---------------------------------------------------------------------------

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

// Every member of the union must keep a *literal* `type` discriminant. If any
// widens to { type: string }, this drops it and the equality fails.
type LiteralDiscriminant<U> = U extends { type: infer T }
  ? string extends T
    ? never
    : U
  : never;
type _AssertLiteralDiscriminant = Assert<
  Equal<IIntegrationConfig, LiteralDiscriminant<IIntegrationConfig>>
>;

// The descriptor registry must cover exactly the union's types — no missing,
// no extra. Add a config variant but forget its descriptor → compile error.
type _DescriptorTypes = (typeof INTEGRATION_DESCRIPTORS)[number]['type'];
type _AssertDescriptorCoverage = Assert<
  Equal<IIntegrationType, _DescriptorTypes>
>;
