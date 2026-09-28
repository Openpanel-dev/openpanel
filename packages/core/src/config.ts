// The shape of everything core needs from the environment; only the config
// loader (`apps/api/src/config/env.ts`) reads `process.env` — it parses,
// validates and derives, and hands the result down as `AppDeps.config` /
// `Ctx.config`, so nothing below this file re-derives a value or reaches for
// `process.env` again.
//
// Two conventions hold throughout: - `undefined` means "not set", never
// "blank". A blank `KEY=` is absent. - a field that only ever had one spelling
// of a default keeps that default next to the code that documents WHY (e.g. the
// buffers' batch sizes), so the loader parses and the module decides. Anything
// DERIVED from more than one variable is resolved here and arrives finished.

/** Which pino transport ships the logs, and how the service name is built. */
export interface LoggingConfig {
  level: string;
  silent: boolean;
  /** LOG_EXPORTER, or `otlp` when only HYPERDX_API_KEY is set. */
  exporter: 'otlp' | 'stdout';
  hyperdxApiKey: string | undefined;
  /** The two halves of `getServiceName`: `<prefix>-<name>-<environment>`. */
  serviceNamePrefix: string | undefined;
  serviceNameEnvironment: string;
  /** Whether stdout/stderr are routed through pino at all (production, or an
   *  exporter explicitly asked for). Local dev output stays untouched. */
  interceptProcessOutput: boolean;
}

/** One OAuth client's three credentials. */
export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface AuthConfig {
  /**
   * `undefined` means the variable is unset, which is what cloud runs and what
   * makes registration unconditionally open — distinct from an explicit
   * `ALLOW_REGISTRATION=false`.
   */
  allowRegistration: boolean | undefined;
  allowInvitation: boolean | undefined;
  github: OAuthClientConfig;
  google: OAuthClientConfig;
  /** The same Google client, redirected at the Search Console callback. */
  googleGsc: OAuthClientConfig;
}

export interface CookieConfig {
  /** COOKIE_SECRET: keys the share-access HMAC. Empty means shares stay locked. */
  secret: string;
  /** COOKIE_TLDS: extra multi-part public suffixes, lowercased. */
  extraMultiPartTlds: string[];
  /** CUSTOM_COOKIE_DOMAIN: overrides the domain derived from the dashboard. */
  customDomain: string | undefined;
}

export interface OpenAiConfig {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  project: string | undefined;
  organization: string | undefined;
}

export interface AnthropicConfig {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  authToken: string | undefined;
  version: string | undefined;
}

export interface AiConfig {
  openai: OpenAiConfig;
  anthropic: AnthropicConfig;
}

export interface SlackConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  oauthRedirectUrl: string | undefined;
  stateSecret: string | undefined;
}

export interface PolarConfig {
  saveDiscountId: string | undefined;
  webhookSecret: string | undefined;
}

export const KAFKA_SASL_MECHANISMS = [
  'plain',
  'scram-sha-256',
  'scram-sha-512',
] as const;
export type KafkaSaslMechanism = (typeof KAFKA_SASL_MECHANISMS)[number];

/**
 * TLS/SASL for an external broker. Unauthenticated plaintext when nothing is
 * set. The loader has already checked the combination is coherent (a full
 * credential pair, a known mechanism, TLS options only with TLS); the CA file
 * itself is read where the client is built, so an unreadable path fails there
 * with its own message.
 */
export interface KafkaSecurityConfig {
  ssl: {
    enabled: boolean;
    caPath: string | undefined;
    rejectUnauthorized: boolean | undefined;
  };
  sasl:
    | { mechanism: KafkaSaslMechanism; username: string; password: string }
    | undefined;
}

/**
 * The Kafka transport's knobs. Every one is resolved: kafkajs is handed these
 * values verbatim, so a `??` at the call site would be a second default.
 */
export interface KafkaConfig {
  clientId: string;
  brokers: string[];
  eventsTopic: string;
  eventsDlqTopic: string;
  consumerGroup: string;
  partitionsConcurrent: number;
  minMessages: number;
  maxWaitMs: number;
  maxMessagesPerPartition: number;
  sessionTimeoutMs: number;
  heartbeatIntervalMs: number;
  requestTimeoutMs: number;
  connectionTimeoutMs: number;
  producerRetries: number;
  producerInitialRetryMs: number;
  producerMaxRetryMs: number;
  /** kafkajs `maxInFlightRequests`. 1: one produce round-trip at a time. */
  producerMaxInFlight: number;
  /** Messages accumulated into one `send()`. Below 2 batching is off. */
  producerBatchSize: number;
  /** A partial batch's maximum wait, in ms, before it is sent anyway. */
  producerBatchLingerMs: number;
  /**
   * The broker's `max.message.bytes`. `/track` refuses a larger body with a
   * 413 rather than letting kafkajs answer with a raw protocol error at 500.
   * Raise this alongside the broker's own setting.
   */
  maxMessageBytes: number;
  handlerMaxAttempts: number;
  handlerRetryInitialMs: number;
  handlerRetryMaxMs: number;
  security: KafkaSecurityConfig;
}

/** Per-buffer sizing. `undefined` keeps the buffer's own documented default. */
export interface BufferSizing {
  batchSize: number | undefined;
  chunkSize?: number | undefined;
  ttlSeconds?: number | undefined;
  fetchChunkSize?: number | undefined;
}

export interface BuffersConfig {
  /** BUFFER_ASYNC_INSERTS: switches every buffer's inserts to async mode. */
  asyncInserts: boolean;
  chInsertConcurrency: number | undefined;
  bot: BufferSizing;
  event: BufferSizing & {
    microBatchMs: number | undefined;
    microBatchSize: number | undefined;
  };
  group: BufferSizing;
  profile: BufferSizing;
  profileBackfill: BufferSizing;
  replay: BufferSizing;
  session: BufferSizing & { squash: boolean };
}

export interface SessionConfig {
  /** SESSION_TIMEOUT_MS: idle window before a session ends. */
  timeoutMs: number | undefined;
  reaperEnabled: boolean;
  reaperBatchSize: number | undefined;
  reaperWallclockDeadmanMs: number | undefined;
  vacuumEnabled: boolean;
  vacuumBatchSize: number | undefined;
  vacuumStaleThresholdMs: number | undefined;
  /** EXPERIMENTAL_PROFILE_BACKFILL, narrowed to a project list when given. */
  profileBackfillEnabled: boolean;
  profileBackfillProjectIds: string[];
}

/**
 * Sizing knobs on read and write paths. Every one is a positive integer or
 * `undefined`: a malformed value is not a boot failure, it keeps the default,
 * which is what the modules did when they parsed these themselves.
 */
export interface QueryConfig {
  eventPropertyValueAutocompleteLimit: number | undefined;
  cohortMaterializeLimit: number | undefined;
  cohortQueryMemoryLimitBytes: number | undefined;
  cohortQuerySpillBytes: number | undefined;
  eventListMaxLookbackDays: number | undefined;
  sessionListMaxLookbackDays: number | undefined;
  importBatchSize: number | undefined;
  insightsRetentionDays: number | undefined;
  windDownMaxPerRun: number | undefined;
}

export interface ObjectStoreExportConfig {
  lagSeconds: number | undefined;
  batchSize: number | undefined;
  maxBatchesPerRun: number | undefined;
  concurrency: number | undefined;
  /** GCS_API_ENDPOINT: a non-default endpoint (an emulator, or a test double). */
  gcsApiEndpoint: string | undefined;
}

/** Comma-separated header orders; `undefined` keeps the shipped order. */
export interface IpHeaderConfig {
  attributionOrder: string[] | undefined;
  trustedOrder: string[] | undefined;
}

/** Everything core reads from the environment, parsed and derived once. */
export interface CoreConfig {
  isProduction: boolean;
  isDevelopment: boolean;
  selfHosted: boolean;
  /** DASHBOARD_URL, else the dashboard's public URL. `''` when neither is set. */
  dashboardUrl: string;
  /** Set on the demo deployment only: every session resolves to this user. */
  demoUserId: string | undefined;
  /** CLICKHOUSE_CLUSTER. Must agree with what `migrate:deploy` created. */
  clickhouseClustered: boolean;
  /**
   * ADMIN_USERNAME / ADMIN_PASSWORD: HTTP Basic credentials for operator-only
   * surfaces (bull-board today). Undefined leaves those surfaces on their own
   * guard alone.
   */
  adminAuth: { username: string; password: string } | undefined;
  /** The single symmetric key for at-rest encryption; 32 bytes as 64 hex. */
  encryptionKey: string | undefined;
  /** DISABLE_PING: a self-hosted instance opts out of the usage ping. */
  pingDisabled: boolean;
  logging: LoggingConfig;
  auth: AuthConfig;
  cookies: CookieConfig;
  ai: AiConfig;
  slack: SlackConfig;
  polar: PolarConfig;
  kafka: KafkaConfig;
  buffers: BuffersConfig;
  session: SessionConfig;
  query: QueryConfig;
  objectStoreExport: ObjectStoreExportConfig;
  ipHeaders: IpHeaderConfig;
}
