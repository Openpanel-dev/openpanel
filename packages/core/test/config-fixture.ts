// The `CoreConfig` a test hands to a service, a buffer or a route: every
// variable unset, so each module's own documented default applies. This is not
// a second config loader — it holds no defaults of its own; `undefined` and
// the "not set" spelling of every flag is exactly what `apps/api`'s
// `loadConfig({})` produces for an empty environment.
//
// A test that cares about one knob spreads an override over it.

import type { CoreConfig } from '../src/config';

export function testCoreConfig(
  overrides: Partial<CoreConfig> = {}
): CoreConfig {
  return {
    isProduction: false,
    isDevelopment: false,
    selfHosted: false,
    dashboardUrl: '',
    demoUserId: undefined,
    clickhouseClustered: true,
    encryptionKey: undefined,
    pingDisabled: false,
    logging: {
      level: 'info',
      silent: false,
      exporter: 'stdout',
      hyperdxApiKey: undefined,
      serviceNamePrefix: undefined,
      serviceNameEnvironment: 'dev',
      interceptProcessOutput: false,
    },
    auth: {
      allowRegistration: undefined,
      allowInvitation: undefined,
      github: { clientId: '', clientSecret: '', redirectUri: '' },
      google: { clientId: '', clientSecret: '', redirectUri: '' },
      googleGsc: { clientId: '', clientSecret: '', redirectUri: '' },
    },
    cookies: { extraMultiPartTlds: [], customDomain: undefined },
    ai: {
      openai: {
        apiKey: undefined,
        baseUrl: undefined,
        project: undefined,
        organization: undefined,
      },
      anthropic: {
        apiKey: undefined,
        baseUrl: undefined,
        authToken: undefined,
        version: undefined,
      },
    },
    slack: {
      clientId: undefined,
      clientSecret: undefined,
      oauthRedirectUrl: undefined,
      stateSecret: undefined,
    },
    polar: { saveDiscountId: undefined, webhookSecret: undefined },
    kafka: {
      clientId: 'openpanel',
      brokers: [],
      eventsTopic: 'events',
      eventsDlqTopic: 'events-dlq',
      consumerGroup: 'openpanel-events',
      partitionsConcurrent: 8,
      minMessages: 1,
      maxWaitMs: 500,
      maxMessagesPerPartition: 256,
      sessionTimeoutMs: 30_000,
      heartbeatIntervalMs: 3000,
      requestTimeoutMs: 5000,
      connectionTimeoutMs: 2000,
      producerRetries: 2,
      producerInitialRetryMs: 100,
      producerMaxRetryMs: 1000,
      producerMaxInFlight: 1,
      producerBatchSize: 25,
      producerBatchLingerMs: 5,
      handlerMaxAttempts: 3,
      handlerRetryInitialMs: 100,
      handlerRetryMaxMs: 1000,
    },
    buffers: {
      asyncInserts: false,
      chInsertConcurrency: undefined,
      bot: { batchSize: undefined },
      event: {
        batchSize: undefined,
        chunkSize: undefined,
        microBatchMs: undefined,
        microBatchSize: undefined,
      },
      group: {
        batchSize: undefined,
        chunkSize: undefined,
        ttlSeconds: undefined,
      },
      profile: {
        batchSize: undefined,
        chunkSize: undefined,
        ttlSeconds: undefined,
        fetchChunkSize: undefined,
      },
      profileBackfill: { batchSize: undefined },
      replay: { batchSize: undefined, chunkSize: undefined },
      session: {
        batchSize: undefined,
        chunkSize: undefined,
        squash: true,
      },
    },
    session: {
      timeoutMs: undefined,
      reaperEnabled: true,
      reaperBatchSize: undefined,
      reaperWallclockDeadmanMs: undefined,
      vacuumEnabled: true,
      vacuumBatchSize: undefined,
      vacuumStaleThresholdMs: undefined,
      profileBackfillEnabled: false,
      profileBackfillProjectIds: [],
    },
    query: {
      eventPropertyValueAutocompleteLimit: undefined,
      cohortMaterializeLimit: undefined,
      cohortQueryMemoryLimitBytes: undefined,
      cohortQuerySpillBytes: undefined,
      eventListMaxLookbackDays: undefined,
      sessionListMaxLookbackDays: undefined,
      importBatchSize: undefined,
      insightsRetentionDays: undefined,
      windDownMaxPerRun: undefined,
      funnelNonStrictOrdering: false,
    },
    objectStoreExport: {
      lagSeconds: undefined,
      batchSize: undefined,
      maxBatchesPerRun: undefined,
      concurrency: undefined,
      gcsApiEndpoint: undefined,
    },
    ipHeaders: { attributionOrder: undefined, trustedOrder: undefined },
    ...overrides,
  };
}
