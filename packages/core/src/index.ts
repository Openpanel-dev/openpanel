// Never `export *`: what leaves this package is exactly what is named here.

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
export type { BufferDeps } from './buffers/base-buffer';
export { registerBufferMetrics } from './buffers/buffer.metrics';
export type { Buffers } from './buffers/create-buffers';
export { createBuffers } from './buffers/create-buffers';
export { createClients } from './clients/create-clients';
export {
  isRetryableStatus,
  ProviderError,
} from './clients/provider-error';
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
export { BULL_BOARD_BASE_PATH, bullBoardRoutes } from './http/bull-board';
export { requestContext, requestLogging } from './http/context';
export { corsDelegator } from './http/cors';
export { errorHandler } from './http/errors';
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
// `registry` itself is not exported: a caller that can reach it could start a
// second collector graph outside a module.
export { registerDefaultMetrics } from './metrics';
// `ChatApp` stays a type so no value of the assistant module reaches a browser bundle.
export type { ChatApp } from './modules/assistant/assistant.service';
export { createAssistantService } from './modules/assistant/assistant.service';
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
export { emailCategories } from './modules/email/email.constants';
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
export { setBooting, setShuttingDown } from './modules/health/src/shutdown';
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
export { zSlackAuthResponse } from './modules/integration/src/slack-contract';
export type { McpAuthContext } from './modules/mcp/mcp.service';
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
export { checkNotificationRulesForEvent } from './modules/notification/src/notification-dispatch';
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
export {
  createInitialSalts,
  createSaltService,
} from './modules/salt/salt.service';
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
// Shared by `rpc/base.ts`, which may not deep-import a module.
export { EMPTY_SESSION } from './shared/session';
