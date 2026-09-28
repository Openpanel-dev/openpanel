// The curated public surface of @openpanel/core.
//
// Never `export *`. What leaves this package is exactly what is named here
// plus the `*.constants` subpaths in package.json's exports map — see
// AGENTS.md. Everything below is what `apps/api` needs to build `AppDeps`
// once and mount the three route surfaces plus the tRPC router over it; a
// service, a client or a buffer is not reachable from here by design.

// packages/db reads ClickHouse row JSON through this; the barrel is how a
// package outside core reaches it, since the exports map has no ./shared/*
// entry.
export {
  generateId,
  generateSecureId,
  getChartPrevStartEndDate,
  getSafeJson,
  resolveDateRange,
  shortId,
} from '@openpanel/shared';
export type {
  SafeFetchOptions,
  SafeFetchResult,
  SafeFetchStreamResult,
  UserAgentInfo,
  UserAgentResult,
} from '@openpanel/shared/server';
export {
  assertPublicHostname,
  assertPublicUrl,
  assertSafeUrl,
  BlockedUrlError,
  createHash,
  createPinnedAgent,
  createPinnedLookup,
  decrypt,
  decryptCredential,
  encrypt,
  encryptCredential,
  generateSalt,
  getDevice,
  hashPassword,
  isBlockedIp,
  isEncrypted,
  parseUserAgent,
  safeFetch,
  safeFetchStream,
  verifyPassword,
} from '@openpanel/shared/server';
// The seven buffers. Only the FACTORY is on the barrel: they are boot
// singletons on `AppDeps`, built once by `main.ts`, never module singletons.
export type { BufferDeps } from './buffers/base-buffer';
export { registerBufferMetrics } from './buffers/buffer.metrics';
export type { Buffers } from './buffers/create-buffers';
export { createBuffers } from './buffers/create-buffers';
// Only `createClients` leaves the package; every AI call, the Slack/Discord
// senders, the geo lookups, the object-store adapters and the integration
// registry are reached by relative import inside it.
//
// `pino-logger` is the concrete implementation of `./logger`'s structural
// interface; main.ts builds its own named logger from it and mirrors a fatal
// to the real stderr with the write captured before `interceptProcessOutput`
// wrapped the stream.
export { createClients } from './clients/create-clients';
export {
  isRetryableStatus,
  ProviderError,
} from './clients/provider-error';
// The one config VALUE the loader needs from core: the accepted SASL
// mechanisms, so `KAFKA_SASL_MECHANISM` is validated against the list the
// client actually supports rather than a second copy of it.
export { KAFKA_SASL_MECHANISMS, type KafkaSaslMechanism } from './config';
export type {
  AppDeps,
  CoreConfig,
  Ctx,
  HttpCtx,
  JobCtx,
  Session,
} from './context';
export { createCtx, extendCtx } from './context';
// The role-conditional HTTP surfaces main.ts mounts over the three in
// rest.routes.ts. `bullBoardRoutes` is async because the adapter reads its own
// UI assets off disk before it can register.
export { BULL_BOARD_BASE_PATH, bullBoardRoutes } from './http/bull-board';
export { requestContext, requestLogging } from './http/context';
// The root chain `main.ts` hangs every surface on. Both take their
// deployment-derived values as arguments — core reads no environment.
export { corsDelegator } from './http/cors';
export { errorHandler } from './http/errors';
// The two runtime seams over the registry. `main.ts` builds producers in every
// role and workers only where the role consumes; both take the registry as
// data, so neither opens a connection until it is called.
export type {
  AnyJob,
  QueueDefinition,
} from './jobs/define';
export type { JobMeta } from './jobs/envelope';
export type { CountableQueue } from './jobs/jobs.metrics';
export { registerQueueMetrics } from './jobs/jobs.metrics';
export { queueKey } from './jobs/naming';
export { createProducers } from './jobs/producers';
export {
  PING_SCHEDULE,
  schedulersFromRegistry,
  startSchedulers,
} from './jobs/schedulers';
export type { WorkerHandle } from './jobs/workers';
export { runJob, startWorkers } from './jobs/workers';
export type {
  QueueProducerHandle,
  QueueProducers,
  Queues,
} from './jobs.registry';
export { CRON_SCHEDULES, queues } from './jobs.registry';
export type { LogFn, Logger } from './logger';
export {
  REQUEST_ID_HEADER,
  REQUEST_ID_LENGTH,
  REQUEST_ID_LOG_FIELD,
} from './logger';
// The one registry's own boot-time registrars. `registry` itself is NOT
// exported: a caller that can reach it can start a second collector graph
// somewhere other than a module, which is the thing §18 forbids.
export { registerDefaultMetrics } from './metrics';
// The chat app, the run context and the filter command take the API's `deps`,
// so the barrel carries the factory and the types only; `assistant.routes.ts`
// and `overview.rpc.ts` reach them through `ctx.services.assistant`.
//
// `ChatApp` is the one type past `AppRouter` that crosses into apps/start
// (`src/agents/client.ts`); it stays a TYPE, so no value of this module
// reaches a browser bundle.
export type { ChatApp } from './modules/assistant/assistant.service';
export { createAssistantService } from './modules/assistant/assistant.service';
// apps/api's OAuth callbacks call these. `hashPassword` is renamed on the way
// out: `@openpanel/shared/server` already owns that name for the (unrelated)
// scrypt hash client secrets use.
export {
  Arctic,
  cookieOptions,
  createAuthService,
  deleteSessionTokenCookie,
  githubClient,
  googleClient,
  googleGscClient,
  parseCookieDomain,
} from './modules/auth/auth.service';
export type { AccessLookups } from './modules/auth/src/access';
export { createAccessChecks } from './modules/auth/src/access';
export { validateSessionToken } from './modules/auth/src/login-session';
export { getIsRegistrationAllowed } from './modules/auth/src/registration';
// The chart engine and the field/filter compilers.
export type {
  AggregateChartSqlInput,
  ChartSqlInput,
  Plan,
} from './modules/chart/chart.service';
export {
  collectProfilePropertyKeys,
  createChartService,
  evaluateFormula,
  getEventFiltersWhereClause,
  getSelectPropertyKey,
  isKnownEventField,
  isValidFormula,
  normalizeEventField,
  profilePropertiesCteSelect,
} from './modules/chart/chart.service';
export { toSeries } from './modules/chart/funnel.service';
export type { IRetentionCohortRow } from './modules/chart/retention.service';
export { processCohortData } from './modules/chart/retention.service';
export { getRawWhereClause } from './modules/chart/sankey.service';
// The sessions/profiles/events-table filter compiler, distinct from
// `getEventFiltersWhereClause` above.
export type { FilterTableContext } from './modules/chart/src/table-filter-where';
export { buildFilterWhere } from './modules/chart/src/table-filter-where';
export type { IPublicClient } from './modules/client/client.service';
export {
  createClientService,
  // apps/api's session e2e clears one client's cache between runs.
  getClientByIdCached,
} from './modules/client/client.service';
export { createConversationService } from './modules/conversation/conversation.service';
export type {
  IServiceDashboard,
  IServiceDashboards,
} from './modules/dashboard/dashboard.service';
// R + C only: the router's three bodies are three small `db.emailUnsubscribe`
// calls, small enough to live inline in `email.rpc.ts` rather than a dedicated
// `email.service.ts` — see that file's header.
export { emailCategories } from './modules/email/email.constants';
// Shared by the onboarding module and, since M9-003, the organization module's
// wind-down track.
export type {
  SequenceStep,
  SequenceSubject,
} from './modules/email/src/sequence';
export { runSequence, step } from './modules/email/src/sequence';
export type {
  IClickhouseBotEvent,
  IClickhouseEvent,
  IServiceCreateEventPayload,
  IServiceEvent,
  IServiceEventMinimal,
} from './modules/event/event.service';
export {
  transformEvent,
  transformSessionToEvent,
} from './modules/event/event.service';
export type { IServiceGroup } from './modules/group/group.service';
export { getGscCannibalization } from './modules/gsc/gsc.service';
export { setShuttingDown } from './modules/health/src/shutdown';
// The ingestion pipeline: the same functions core's own `ingestRoutes` calls.
export type {
  BotMatch,
  IncomingEventPayload,
  IngestTransport,
} from './modules/ingest/ingest.service';
export {
  applyBotSuspicion,
  checkIngestBot,
  detectBot,
  getDeviceId,
  getOverrideDeviceId,
  getTimestamp,
  handleReplay,
  ingestTrack,
  isBot,
  stripBotProperties,
  summarizeBotSignals,
  validateIngestRequest,
} from './modules/ingest/ingest.service';
// The Kafka consumer and its per-message handler, which take the kafkajs
// client, the topic/group names and the retry bounds as arguments — the
// injection seam that used to cross a package boundary and now just crosses two
// files.
export type {
  DeadLetterMessage,
  EventsBatchHandlerDeps,
  KafkaConsumerHandle,
} from './modules/ingest/src/consumer';
export {
  createEventsBatchHandler,
  startKafkaEventsConsumer,
} from './modules/ingest/src/consumer';
export { createIncomingEventHandler } from './modules/ingest/src/consumer-handler';
// The readiness probe's two inputs. `markEventsActivity` is the consumer's
// `onActivity`; `setShuttingDown` is main.ts's signal handler.
export {
  enableEventsHeartbeat,
  markEventsActivity,
} from './modules/ingest/src/heartbeat';
export type {
  IncomingEventBindings,
  IncomingEventDeps,
} from './modules/ingest/src/incoming-event-handler';
export { incomingEvent } from './modules/ingest/src/incoming-event-handler';
export { ingestConsumerMetrics } from './modules/ingest/src/ingest.metrics';
// The Kafka transport: producer, consumer factory, admin/lag sampling and every
// topic/group/retry constant. It constructs no client at import time, so the
// barrel stays offline-importable.
export type {
  Admin,
  ConsumerGroupLag,
  EachBatchPayload,
  KafkaMessage,
} from './modules/ingest/src/kafka';
export {
  assertKafkaConfigured,
  createKafkaAdmin,
  createKafkaEventsConsumer,
  disconnectKafka,
  kafkaLogger,
  produceDeadLetterEvent,
  produceIncomingEvent,
  sampleConsumerGroupLag,
} from './modules/ingest/src/kafka';
export { explainInsight } from './modules/insight/insight.service';
// Slack's OAuth token-exchange wire contract — not integration config (stays
// out of the `*.constants` subpath, see
// modules/integration/src/slack-contract.ts's header), but apps/api's webhook
// controller still needs it to validate Slack's `oauth.v2.access` response, the
// same way it reaches slackInstaller above.
export { zSlackAuthResponse } from './modules/integration/src/slack-contract';
// Stateless-only, so there is no SessionManager to manage. The barrel carries
// the factory and the two types; `handleStatelessMcpRequest` needs the API's
// `deps`, so MCP is reached through `rest.routes.ts`'s `.use(mcpRoutes(deps))`
// and `ctx.services.mcp`.
export type { McpAuthContext } from './modules/mcp/mcp.service';
// `GET /misc/og/clear` and `/misc/favicon/clear` are deliberately absent.
export type { INotificationPayload } from './modules/notification/notification.service';
export {
  createNotificationService,
  getFunnelRules,
  getHasFunnelRules,
  isBaseIntegration,
  matchEvent,
  matchEventFilters,
  notificationTemplateEvent,
  notificationTemplateFunnel,
} from './modules/notification/notification.service';
// The BullMQ-producer orchestration around a rule match lives in this module's
// own src/notification-dispatch.ts. Only the one the Kafka message handler is
// bound to at boot needs to leave the package.
export { checkNotificationRulesForEvent } from './modules/notification/src/notification-dispatch';
// The onboarding-project mutation and the onboarding email drip.
export { createOnboardingService } from './modules/onboarding/onboarding.service';
export type {
  IServiceMember,
  IServiceOrganization,
} from './modules/organization/organization.service';
export {
  createOrganizationService,
  getOrganizationByProjectIdCached,
} from './modules/organization/organization.service';
export type { IGetTopGenericInput } from './modules/overview/overview.service';
export type {
  AdjustProfilePropertyResult,
  IClickhouseProfile,
  IdentifyProfileInput,
  IProfileMetrics,
  IServiceProfile,
  ProfileRequestContext,
} from './modules/profile/profile.service';
export type {
  IServiceProject,
  IServiceProjectWithClients,
} from './modules/project/project.service';
export { createProjectService } from './modules/project/project.service';
// The realtime ClickHouse queries. The `/live` websocket glue stays internal
// to realtime.routes.ts.
export type { IServiceReference } from './modules/reference/reference.service';
export { createReferenceService } from './modules/reference/reference.service';
export {
  alphabetIds,
  chartColors,
  chartSegments,
  chartTypes,
  countries,
  DEFAULT_ASPECT_RATIO,
  filterValueTypes,
  getCohortIds,
  getCountry,
  getDefaultIntervalByDates,
  getDefaultIntervalByRange,
  getOperatorsForType,
  intervals,
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
  lineTypes,
  metrics,
  NOT_SET_VALUE,
  operators,
  operatorsShort,
  timeWindows,
  zCriteria,
  zReportInput,
} from './modules/report/report.constants';
export type { IServiceReport } from './modules/report/report.service';
export { transformReport } from './modules/report/report.service';
export {
  getChartStartEndDate,
  getDatesFromRange,
} from './modules/report/src/chart-dates';
export {
  mergeGlobalFilters,
  onlyReportEvents,
} from './modules/report/src/series';
// `main.ts` calls `createInitialSalts(deps)` directly at boot; `salt.jobs.ts`'s
// cron handler and everything else reach `rotateSalt`/`getSalts` through
// `ctx.services.salt`.
export {
  createInitialSalts,
  createSaltService,
} from './modules/salt/salt.service';
// The `sessions` queue's own job and the reaper/vacuum cron fragments are
// registered in jobs.registry.ts, not exported.
export type {
  IClickhouseSession,
  IServiceSession,
} from './modules/session/session.service';
export { SESSION_DISTINCT_FIELDS } from './modules/session/session.service';
export type { SessionMetricsRedis } from './modules/session/src/session.metrics';
export { registerSessionScrapeMetrics } from './modules/session/src/session.metrics';
export {
  createSessionEnd,
  getSessionEndJobId,
  sessionEndEnqueueOptions,
  sessionEndJobPayload,
} from './modules/session/src/session-end';
export { reapIdleSessions } from './modules/session/src/session-reaper';
export { vacuumStaleSessions } from './modules/session/src/session-vacuum';
export {
  zShareDashboard,
  zShareOverview,
  zShareReport,
} from './modules/share/share.constants';
export { createShareService } from './modules/share/share.service';
export { toSubscriptionDiscount } from './modules/subscription/subscription.service';
export { runIpLookup } from './modules/tools/src/ip-lookup';
export type { SiteCheckResult } from './modules/tools/src/site-checker';
export { runSiteCheck } from './modules/tools/src/site-checker';
export { createUserService } from './modules/user/user.service';
export type { ILogger } from './pino-logger';
export {
  createLogger,
  getServiceName,
  interceptProcessOutput,
  rawStderrWrite,
} from './pino-logger';
export {
  dashboardRoutes,
  debugRoutes,
  opsRoutes,
  publicApiRoutes,
} from './rest.routes';
// The RPC base is on the barrel because it is the seam every module's own
// `<name>.rpc.ts` builds its router on: ONE tRPC instance, mounted by
// `createTrpcFetchHandler`.
export type {
  Meta,
  TrpcContext,
  TrpcContextOptions,
} from './rpc/base';
export {
  createCacheMiddleware,
  createRateLimitMiddleware,
  createTRPCRouter,
  middleware,
  procedure,
  protectedProcedure,
} from './rpc/base';
export { RPC_DEADLINE_MS } from './rpc/deadline';
export {
  TRPCAccessError,
  TRPCBadRequestError,
  TRPCForbiddenError,
  TRPCInternalServerError,
  TRPCNotFoundError,
} from './rpc/errors';
export {
  createTrpcFetchHandler,
  TRPC_ENDPOINT,
} from './rpc/handler';
export type { AppRouter } from './rpc.router';
export { appRouter } from './rpc.router';
export type { IProjectAccess } from './shared/access-lookups';
export {
  canWriteProject,
  getClientAccess,
  getOrganizationAccess,
  getProjectAccess,
} from './shared/access-lookups';
export {
  DEFAULT_IP_HEADER_ORDER,
  getClientIpFromHeaders,
  getTrustedIpFromHeaders,
  TRUSTED_IP_HEADER_ORDER,
} from './shared/get-client-ip';
export { getReferrerWithQuery, parseReferrer } from './shared/parse-referrer';
// Below the transports since M15-007: `rpc/base.ts` needs the empty shape and
// may not deep-import a module to get it.
export { EMPTY_SESSION } from './shared/session';
