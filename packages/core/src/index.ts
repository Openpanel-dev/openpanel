// The curated public surface of @openpanel/core.
//
// Never `export *`. What leaves this package is exactly what is named here
// plus the `*.constants` subpaths in package.json's exports map — see
// AGENTS.md. Everything below is what `apps/api` needs to build `AppDeps`
// once and mount the three route surfaces plus the tRPC router over it; a
// service, a client or a buffer is not reachable from here by design.

// The concrete pino implementation (dissolved from @openpanel/logger,
// M4-003). `./logger` above is the structural interface every module codes
// against; this is what apps/api calls to build one.
// The seven buffers (moved from packages/db/src/buffers, M8-001). Only the
// FACTORY is on the barrel: they are boot singletons on `AppDeps`, built once
// by `main.ts`, never module singletons (ADR-007). V1's
// packages/db/src/buffers/index.ts calls this once and re-exports the
// instances, so both boots share one set.
export type {
  AddObservation,
  AddObserver,
  BufferDeps,
  FlushObservation,
  FlushObserver,
  FlushPhaseTimings,
  FlushTrigger,
} from './buffers/base-buffer';
export { registerBufferMetrics } from './buffers/buffer.metrics';
export type { Buffers } from './buffers/create-buffers';
export { createBuffers } from './buffers/create-buffers';
export type { IGroupBufferInput } from './buffers/group-buffer';
export type { ProfileBackfillEntry } from './buffers/profile-backfill-buffer';
export type { IClickhouseSessionReplayChunk } from './buffers/replay-buffer';
export type { SessionIngestResult } from './buffers/session-buffer';
export { resolveSessionTimeoutMs } from './buffers/session-buffer';
// Dissolved from @openpanel/ai (M4-005) — the chat agent app, the filter
// command bar, insight explanation/enrichment and the worker's digest and
// win-back emails all call these directly.
export type {
  InsightCategory,
  InsightEnrichment,
  InsightToEnrich,
} from './clients/ai/enrich';
export { ENRICH_VERSION, enrichInsights } from './clients/ai/enrich';
export type {
  BreakdownComparison,
  DailyPoint,
  ExplainInsightInput,
  InsightExplanation,
} from './clients/ai/explain';
export { generateInsightExplanation } from './clients/ai/explain';
export type { WeeklyNarrativeInput } from './clients/ai/narrative';
export { generateWeeklyNarrative } from './clients/ai/narrative';
export type { ChatModelEntry } from './clients/ai/providers';
export {
  ALLOWED_MODELS,
  anthropicProvider,
  openaiProvider,
  resolveModel,
} from './clients/ai/providers';
export type { WinBackPitchInput } from './clients/ai/win-back';
export { generateWinBackPitch } from './clients/ai/win-back';
// The `clients` handle on AppDeps (M9-004). main.ts builds it once and hands
// it to `AppDeps`, the same way it builds the buffers and the producers.
export type { ServiceClients } from './clients/create-clients';
export { createClients } from './clients/create-clients';
export type { EmailData, EmailTemplate } from './clients/email';
export { sendEmail } from './clients/email';
// Dissolved from @openpanel/geo (M4-004) — apps/api's ingest and tools
// controllers call these directly, the same way they reach the logger below.
export type { AsnInfo, GeoLocation } from './clients/geo';
export { getAsnInfo, getGeoLocation } from './clients/geo';
// Dissolved from @openpanel/integrations (M4-005) — the export cron job, the
// notification worker job and the Slack/webhook OAuth callback all reach
// these directly, the same way they reach the object-store adapters below.
export {
  sendDiscordNotification,
  sendTestDiscordNotification,
} from './clients/integrations/discord';
export {
  clickhouseEventToExportEvent,
  createBatch,
  createManifest,
  EXPORT_SCHEMA_VERSION,
  type ExportFormat,
  generateBatchPath,
  getContentType,
  getFileExtension,
  type IBatchFile,
  type IBatchInfo,
  type IBatchResult,
  type IExportEvent,
  type IManifest,
  MANIFEST_CONTENT_TYPE,
  MANIFEST_FILENAME,
  parseManifest,
  serializeManifest,
} from './clients/integrations/export';
export type {
  IObjectStoreAdapter,
  IUploadOptions,
  IUploadResult,
} from './clients/integrations/object-store';
export {
  createGCSAdapter,
  createS3Adapter,
  GCSAdapter,
  S3Adapter,
} from './clients/integrations/object-store';
export type {
  ConfigOf,
  IConfigSecret,
  INotificationDeliverArgs,
  INotificationDeliverPayload,
  IServerIntegration,
} from './clients/integrations/registry';
export {
  carryOverConfigSecrets,
  encryptConfigSecrets,
  findEncryptedSecretField,
  findMissingSecretFields,
  getServerIntegration,
  redactConfigSecrets,
} from './clients/integrations/registry';
export { safeWebhookFetcher } from './clients/integrations/safe-fetcher';
export {
  getSlackInstallUrl,
  sendSlackNotification,
  slackInstaller,
} from './clients/integrations/slack';
export type { ILogger } from './clients/logger';
export {
  createLogger,
  getServiceName,
  interceptProcessOutput,
  rawStderrWrite,
  rawStdoutWrite,
} from './clients/logger';
export type {
  AppDeps,
  CoreConfig,
  Ctx,
  HttpCtx,
  JobCtx,
  ScopeMeta,
  Session,
} from './context';
export { createCtx, extendCtx } from './context';
// The role-conditional HTTP surfaces main.ts mounts over the three in
// rest.routes.ts (M9-002). `bullBoardRoutes` is async because the adapter
// reads its own UI assets off disk before it can register.
export { BULL_BOARD_BASE_PATH, bullBoardRoutes } from './http/bull-board';
export { requestContext, requestLogging } from './http/context';
// The root chain `main.ts` hangs every surface on (M9-004): V1's CORS
// delegator and V1's error handler, both ported and both taking their
// deployment-derived values as arguments — core reads no environment.
export type { CorsOptions } from './http/cors';
export { CORS_PRIVATE_PATHS, corsDelegator } from './http/cors';
export { debugRoutes } from './http/debug.routes';
export type { ErrorHandlerOptions } from './http/errors';
export { errorHandler } from './http/errors';
// The two runtime seams over the registry (ADR-005). `main.ts` builds
// producers in every role and workers only where the role consumes; both take
// the registry as data, so neither opens a connection until it is called.
export type {
  AnyJob,
  EnqueueOptions,
  QueueDefinition,
  RepeatSchedule,
} from './jobs/define';
export type { JobEnvelope, JobMeta } from './jobs/envelope';
export type { CountableQueue } from './jobs/jobs.metrics';
export { registerQueueMetrics } from './jobs/jobs.metrics';
export { queueKey } from './jobs/naming';
export type { CreateProducersOptions } from './jobs/producers';
export { createProducers } from './jobs/producers';
export type {
  SchedulerDefinition,
  SchedulerFlags,
} from './jobs/schedulers';
export {
  CRON_SCHEDULES,
  PING_SCHEDULE,
  schedulersFromRegistry,
  startSchedulers,
} from './jobs/schedulers';
export type {
  StartWorkersOptions,
  TerminalFailure,
  WorkerHandle,
} from './jobs/workers';
export { runJob, startWorkers } from './jobs/workers';
export type {
  QueueProducerHandle,
  QueueProducers,
  Queues,
} from './jobs.registry';
export { queues } from './jobs.registry';
export type { LogFn, Logger, LogLevel } from './logger';
export {
  REQUEST_ID_HEADER,
  REQUEST_ID_LENGTH,
  REQUEST_ID_LOG_FIELD,
} from './logger';
// The one registry's own boot-time registrars. `registry` itself is NOT
// exported: a caller that can reach it can start a second collector graph
// somewhere other than a module, which is the thing §18 forbids.
export { registerDefaultMetrics } from './metrics';
// Moved from apps/api/src/agents/* + packages/trpc/src/agents/filter-command.ts
// (M5-005). M15-003: the chat app, the run context and the filter command all
// take the API's `deps` now, so the barrel carries the factory and the types
// only — `assistant.routes.ts` and `overview.rpc.ts` reach them through
// `ctx.services.assistant`. `ChatApp` is the one type past `AppRouter` that
// crosses into apps/start (`src/agents/client.ts`); it stays a TYPE, so no
// value of this module reaches a browser bundle.
export type {
  ChatApp,
  ChatRunContext,
  FilterCommandResult,
  RunFilterCommandInput,
} from './modules/assistant/assistant.service';
export { createAssistantService } from './modules/assistant/assistant.service';
// Dissolved from @openpanel/auth (M4-007) — apps/api's OAuth callbacks call
// these directly; V1's now-deleted @openpanel/trpc auth/share/user/gsc
// routers did too, the same way they reached the other dissolved leaf
// packages here. `hashPassword` is renamed on the way out: `./shared/crypto`
// already owns that name for the (unrelated) scrypt hash client secrets use.
//
// The sign-up/sign-in/TOTP/reset-password/share/OAuth-callback half (M6-003)
// joined it here — V1's now-deleted packages/trpc auth router and
// apps/api/src/controllers/oauth-callback.controller.tsx called these
// directly, the same way V1 reached every other dissolved service here.
export type {
  AuthProvider,
  CompleteOAuthCallbackInput,
  OAuth2Tokens,
  OAuthUser,
  SignInEmailInput,
  SignInEmailResult,
  SignInShareInput,
  SignInTotpInput,
  SignUpEmailInput,
  StartOAuthSignInInput,
  StartOAuthSignInResult,
} from './modules/auth/auth.service';
export {
  Arctic,
  assertOAuthState,
  buildOtpauthUrl,
  COOKIE_MAX_AGE,
  consumeRecoveryCode,
  cookieOptions,
  createAuthService,
  decodeSessionToken,
  deleteSessionTokenCookie,
  fetchGithubOAuthUser,
  fetchGoogleOAuthUser,
  generateQrDataUrl,
  generateRecoveryCodes,
  generateSessionToken,
  generateTotpSecret,
  githubClient,
  googleClient,
  googleGscClient,
  hashPassword as hashUserPassword,
  hashRecoveryCodes,
  hashSessionToken,
  normalizeRecoveryCode,
  OAuthCallbackError,
  parseCookieDomain,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
  startOAuthSignIn,
  verifyPasswordHash,
  verifyTotpCode,
} from './modules/auth/auth.service';
// Moved from packages/db/src/services/auth-session.service.ts (M8-005) —
// the Postgres-backed login session CRUD. packages/db keeps a re-export
// shim (existing `@openpanel/db` importers, apps/api's app.ts).
export type { SessionValidationResult } from './modules/auth/src/login-session';
export {
  createDemoSession,
  createSession,
  invalidateSession,
  validateSessionToken,
} from './modules/auth/src/login-session';
export { getIsRegistrationAllowed } from './modules/auth/src/registration';
// Dissolved from @openpanel/db's services/chart.service.ts and engine/
// (M7-003) — packages/trpc's chart router, apps/api's export controller,
// V1's funnel/conversion/sankey/retention/overview services and the
// mcp/assistant tools reach the engine and the field/filter compilers here.
// packages/db/src/services/chart.service.ts and src/engine/index.ts stay
// re-export shims.
export type {
  AggregateChartSqlInput,
  ChartBucketProfilesInput,
  ChartBucketProfilesRequest,
  ChartEventOption,
  ChartSqlInput,
  CohortMetadata,
  ConcreteSeries,
  FilterTableScope,
  FunnelStepProfilesRequest,
  Plan,
  ProjectCardChartRow,
  ProjectCardMetrics,
  ProjectCardTrend,
  RetentionChartInput,
  SeriesDefinition,
  ShareableReportInput,
} from './modules/chart/chart.service';
export {
  buildAllCohortsLabelExpr,
  buildAllCohortsMembershipQuery,
  buildCohortMembershipQuery,
  buildInlineCohortJoin,
  CHART_TABLE,
  ChartCohortIdError,
  collectBreakdownCohortIds,
  collectProfilePropertyKeys,
  createChartService,
  EVENT_FIELD_ALIASES,
  EVENT_TOP_LEVEL_COLUMNS,
  evaluateFormula,
  extractCohortId,
  getCohortAlias,
  getCohortCteName,
  getEventFiltersWhereClause,
  getGroupPropertySelect,
  getGroupPropertySql,
  getProfilePropertySelect,
  getSelectPropertyKey,
  InvalidFormulaError,
  isAllCohortsBreakdown,
  isKnownEventField,
  isNumericColumn,
  isValidFormula,
  normalizeEventField,
  profilePropertiesCteSelect,
  resolveReportInput,
  rewriteProfilePropertyRefs,
  transformPropertyKey,
} from './modules/chart/chart.service';
// Dissolved from @openpanel/db's services/funnel.service.ts (M7-004) —
// packages/db's reports.service, apps/api's insights controller and the
// mcp/assistant tools call these. packages/db/src/services/funnel.service.ts
// stays a re-export shim.
export type {
  BuildFunnelBaseInput,
  FunnelStep,
} from './modules/chart/funnel.service';
export {
  buildSessionsCte,
  EMPTY_BREAKDOWN_LABEL,
  getFunnelGroup,
  toSeries,
} from './modules/chart/funnel.service';
// Dissolved from @openpanel/db's services/retention.service.ts (M7-004) —
// apps/api's insights controller and the mcp/assistant tools call these.
// packages/db/src/services/retention.service.ts stays a re-export shim.
export type {
  IGetRetentionCohortInput,
  IRetentionCohortRow,
  IRetentionCriteria,
  IRetentionInterval,
  IServiceRetentionRollingActiveUsers,
} from './modules/chart/retention.service';
export { processCohortData } from './modules/chart/retention.service';
// Dissolved from @openpanel/db's services/sankey.service.ts (M7-004) —
// apps/api's insights controller and the mcp/assistant tools call these.
// packages/db/src/services/sankey.service.ts stays a re-export shim.
export type {
  IGetSankeyInput,
  SankeyLink,
  SankeyNode,
  SankeyResult,
} from './modules/chart/sankey.service';
export {
  getRawWhereClause,
  zGetSankeyInput,
} from './modules/chart/sankey.service';
// Moved from packages/db/src/services/filter-where.service.ts (M8-005) — the
// sessions/profiles/events-table filter compiler, distinct from
// `getEventFiltersWhereClause` above. packages/db/src/services/
// filter-where.service.ts stays a re-export shim.
export type { FilterTableContext } from './modules/chart/src/table-filter-where';
export { buildFilterWhere } from './modules/chart/src/table-filter-where';
// Dissolved from @openpanel/db's services/clients.service.ts (M6-002) —
// packages/trpc's client router, apps/api's manage controller and mcp/utils
// auth call these directly, the same way V1 reaches every other dissolved
// service here. packages/db/src/services/clients.service.ts stays a
// re-export shim.
export type {
  CreatedClient,
  IServiceClient,
  IServiceClientWithProject,
} from './modules/client/client.service';
export {
  createClientService,
  // apps/api's session e2e clears one client's cache between runs.
  getClientByIdCached,
} from './modules/client/client.service';
// Dissolved from @openpanel/db's services/cohort.service.ts (M5-003) —
// packages/trpc's cohort router and apps/worker's cohort job files call
// these directly, the same way V1 reaches every other dissolved service
// here. Nothing else in the tree reached cohort.service.ts through
// @openpanel/db's barrel, so packages/db loses the file entirely rather than
// keeping a re-export shim (unlike gsc.ts/gsc.service.ts).
// Moved from @openpanel/db's services/conversation.service.ts (M5-006) —
// packages/trpc's conversation router, apps/api's live chat route and this
// package's own assistant.routes.ts stub call these directly. packages/db
// keeps a re-export shim (unlike cohort, M5-003): both non-trpc call sites
// still reach it through `@openpanel/db`'s barrel.
export type {
  IServiceChatMessage,
  IServiceConversation,
  IServiceConversationWithMessages,
} from './modules/conversation/conversation.service';
export { createConversationService } from './modules/conversation/conversation.service';
// Dissolved from @openpanel/db's services/dashboard.service.ts, plus V1's
// dashboard router mutation bodies (M7-006) — packages/trpc's dashboard
// router, apps/api's insights controller and the mcp/assistant tools call
// these. packages/db/src/services/dashboard.service.ts stays a re-export
// shim.
export type {
  IServiceDashboard,
  IServiceDashboards,
} from './modules/dashboard/dashboard.service';
export { createDashboardService } from './modules/dashboard/dashboard.service';
// R + C only (M6-004): the router's three bodies are three small
// `db.emailUnsubscribe` calls, small enough to live inline in
// `email.rpc.ts` rather than a dedicated `email.service.ts` — see that
// file's header. `emailCategories` moved from packages/constants (ADR-008's
// module map: email owns "C"); packages/constants keeps a re-export shim.
export type { EmailCategory } from './modules/email/email.constants';
export { emailCategories } from './modules/email/email.constants';
// Dissolved from @openpanel/db's services/event.service.ts, profile.service.ts
// and group.service.ts, plus the query/mutation bodies packages/trpc's
// event/profile/group routers held inline and apps/api's profile controller
// (M7-002, ADR-008's module map: event "R,S", profile "R,H,S", group
// "R,S,C") — packages/trpc's routers, apps/api's export controller, is-bot
// hook and profile controller, apps/worker's incoming-event job and the
// assistant/mcp tools call these directly, the same way V1 reaches every
// other dissolved service here. `packages/db`'s re-export shims for these
// three files are gone (M9-CLEANUP-001) — every caller now imports this
// barrel directly. `profileSearchSql` (cohort.service's one addition atop the
// shim) died with M12-003: its only caller now composes a `sql` fragment and
// uses `profileSearchCondition`.
export type {
  EventListSelect,
  GetEventListOptions,
  IClickhouseBotEvent,
  IClickhouseEvent,
  IEventColumn,
  IImportedEvent,
  IServiceBotEvent,
  IServiceCreateBotEventPayload,
  IServiceCreateEventPayload,
  IServiceCreateEventPayloadWithId,
  IServiceEvent,
  IServiceEventMinimal,
  IServiceImportedEventPayload,
  IServicePage,
  QueryEventsInput,
} from './modules/event/event.service';
export {
  EVENT_COLUMNS,
  transformEvent,
  transformMinimalEvent,
  transformSessionToEvent,
} from './modules/event/event.service';
export { createExportService } from './modules/export/export.service';
export type {
  GetGroupListOptions,
  GetGroupMemberProfilesOptions,
  IServiceGroup,
  IServiceGroupStats,
  IServiceUpsertGroup,
} from './modules/group/group.service';
// Dissolved from @openpanel/db's src/gsc.ts + services/gsc.service.ts
// (M5-002) — apps/worker's gsc job file, apps/api's gsc OAuth callback
// controller and packages/trpc's gsc router call these directly, the same
// way V1 reaches every other dissolved service here. packages/db/src/gsc.ts
// and packages/db/src/services/gsc.service.ts re-export the subset MCP's gsc
// tools and the assistant's SEO tools still reach via `@openpanel/db`.
export type {
  GscCannibalizedQuery,
  GscConnectionSummary,
  GscDateRangeInput,
  GscOAuthCallbackInput,
  GscOAuthCallbackResult,
  GscQueryOpportunity,
  GscSite,
} from './modules/gsc/gsc.service';
export { getGscCannibalization } from './modules/gsc/gsc.service';
export { isShuttingDown, setShuttingDown } from './modules/health/src/shutdown';
// Dissolved from @openpanel/db's services/import.service.ts +
// apps/worker's job file + apps/api's /import controller (M5-004) —
// apps/worker's import job file and apps/api's import controller call these
// directly, the same way V1 reaches every other dissolved service here.
// packages/db/src/services/import.service.ts is deleted outright: nothing
// else reached it through @openpanel/db's barrel (same as cohort, M5-003).
export type {
  ImportJobProgress,
  ImportStageResult,
  ImportSteps,
  InsertRawEventsResult,
  UpdateImportStatusOptions,
} from './modules/import/import.service';
// The ingestion pipeline (M8-002). apps/api's /track controller, its three
// route hooks and the legacy /event controller are thin delegates over these
// — the same functions core's own `ingestRoutes` calls.
export type {
  BotMatch,
  BotSuspicion,
  DeviceIdentity,
  IncomingEventPayload,
  IncomingEventProducer,
  IngestAuthErrorPayload,
  IngestAuthOutcome,
  IngestBuffers,
  IngestHeaders,
  IngestTransport,
  TrackOutcome,
  TrackRequest,
} from './modules/ingest/ingest.service';
export {
  applyBotSuspicion,
  checkIngestBot,
  detectBot,
  fetchDeviceIdentity,
  getDeviceId,
  getOverrideDeviceId,
  getStringHeaders,
  getTimestamp,
  handleReplay,
  ingestTrack,
  isBot,
  isDuplicatedEvent,
  isDuplicateIngestRequest,
  stripBotProperties,
  summarizeBotSignals,
  validateIngestRequest,
} from './modules/ingest/ingest.service';
// The Kafka consumer and its per-message handler (M8-003), which take the
// kafkajs client, the topic/group names and the retry bounds as arguments —
// the injection seam that used to cross a package boundary and now just
// crosses two files.
export type {
  ConsumerLogger,
  ConsumerMetrics,
  DeadLetterMessage,
  DeadLetterReason,
  EventsBatchHandler,
  EventsBatchHandlerDeps,
  EventsConsumerDeps,
  KafkaConsumerHandle,
} from './modules/ingest/src/consumer';
export {
  createEventsBatchHandler,
  startKafkaEventsConsumer,
} from './modules/ingest/src/consumer';
export { createIncomingEventHandler } from './modules/ingest/src/consumer-handler';
// The readiness probe's two inputs (M9-002). `markEventsActivity` is the
// consumer's `onActivity`; `setShuttingDown` is main.ts's signal handler.
export {
  enableEventsHeartbeat,
  getEventsHeartbeat,
  markEventsActivity,
} from './modules/ingest/src/heartbeat';
export type {
  IncomingEventBindings,
  IncomingEventDelivery,
  IncomingEventDeps,
  IncomingEventMetrics,
  IncomingEventProject,
  IncomingEventSessions,
} from './modules/ingest/src/incoming-event-handler';
export {
  createIncomingEventDeps,
  incomingEvent,
} from './modules/ingest/src/incoming-event-handler';
export { ingestConsumerMetrics } from './modules/ingest/src/ingest.metrics';
// The Kafka transport itself (M11-003): producer, consumer factory, admin/lag
// sampling and every topic/group/retry constant, moved from
// @openpanel/queue's kafka.ts unchanged. It constructs no client at import
// time, so the barrel stays offline-importable.
export type {
  Admin,
  ConsumerGroupLag,
  EachBatchPayload,
  KafkaMessage,
  PartitionLag,
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
export type {
  DailyInsightCandidate,
  GetReferrerSpikesInput,
  ReferrerSpikeCluster,
  WeeklyDigestPreview,
  WeeklyDigestResult,
} from './modules/insight/insight.service';
export { explainInsight } from './modules/insight/insight.service';
// Moved from packages/trpc/src/routers/integration.ts, plus the Slack OAuth
// callback business logic out of
// apps/api/src/controllers/webhook.controller.ts (M6-006, ADR-008's module
// map: integration owns "S"+"C") — packages/trpc's integration router and
// apps/api's webhook controller call these directly, the same way V1 reaches
// every other dissolved service here.
export type { CompleteSlackOAuthCallbackResult } from './modules/integration/integration.service';
export { SlackOAuthCallbackError } from './modules/integration/integration.service';
// Slack's OAuth token-exchange wire contract (M6-006) — not integration
// config (stays out of the `*.constants` subpath, see
// modules/integration/src/slack-contract.ts's header), but apps/api's
// webhook controller still needs it to validate Slack's `oauth.v2.access`
// response, the same way it reaches slackInstaller above.
export { zSlackAuthResponse } from './modules/integration/src/slack-contract';
// packages/mcp absorbed whole (M5-007) — ADR-015 entry 2: stateless-only, so
// there is no SessionManager to manage. M15-003: the barrel carries the
// factory and the two types only. `handleStatelessMcpRequest` needs the
// API's `deps`, so the app shell reaches MCP the one way it ever did —
// `rest.routes.ts`'s `.use(mcpRoutes(deps))` and `ctx.services.mcp`.
export type {
  McpAuthContext,
  McpHttpResult,
} from './modules/mcp/mcp.service';
export { createMcpService } from './modules/mcp/mcp.service';
// Ported from apps/api's misc controller + apps/worker's cron.ping.ts (M7-008)
// — apps/api's misc controller and the worker's ping cron job call these
// directly, the same way V1 reaches every other dissolved service here.
// `GET /misc/og/clear` and `/misc/favicon/clear` are NOT ported (ADR-015
// entry #6: RULED + DEAD).
export type {
  GeoReport,
  ImageAssetResult,
  PingRecord,
  StatsResult,
} from './modules/misc/misc.service';
export {
  getFavicon,
  getGeoReport,
  getOgImage,
} from './modules/misc/misc.service';
export type {
  INotificationPayload,
  INotificationRuleCached,
} from './modules/notification/notification.service';
export {
  APP_NOTIFICATION_INTEGRATION_ID,
  BASE_INTEGRATIONS,
  createNotificationService,
  EMAIL_NOTIFICATION_INTEGRATION_ID,
  getFunnelRules,
  getHasFunnelRules,
  getNotificationRulesByProjectId,
  isBaseIntegration,
  matchEvent,
  matchEventFilters,
  notificationTemplateEvent,
  notificationTemplateFunnel,
} from './modules/notification/notification.service';
// Dissolved from @openpanel/db's services/notification.service.ts (M6-005,
// "rules + dispatch stay together"). `createNotification` /
// `triggerNotification` / `checkNotificationRulesForEvent` /
// `checkNotificationRulesForSessionEnd` — the BullMQ-producer orchestration
// around a rule match — came home from @openpanel/queue at M11-003 and now
// live in this module's own src/notification-dispatch.ts. Only the one the
// Kafka message handler is bound to at boot needs to leave the package.
export { checkNotificationRulesForEvent } from './modules/notification/src/notification-dispatch';
// New module (M6-003) — the onboarding-project mutation and the onboarding
// email drip, neither of which had a packages/db/src/services/* home to move
// from. V1's now-deleted packages/trpc onboarding router and apps/worker's
// onboarding cron job called these directly, the same way V1 reached every
// other dissolved service here.
export type {
  CreateOnboardingProjectResult,
  OnboardingCronSummary,
} from './modules/onboarding/onboarding.service';
export { createOnboardingService } from './modules/onboarding/onboarding.service';
// Dissolved from @openpanel/db's services/organization.service.ts +
// services/delete.service.ts (M6-001, folded together per the module map) —
// packages/trpc's organization router, apps/worker's delete cron job and
// packages/db's own engine/analytics services (`getSettingsForProject`) call
// these directly, the same way V1 reaches every other dissolved service here.
// packages/db/src/services/organization.service.ts stays a re-export shim
// (unlike delete.service.ts, which packages/db loses entirely — nothing but
// the worker's cron job reached it through @openpanel/db's barrel).
export type {
  DeleteCronResult,
  InviteUserResult,
  IServiceInvite,
  IServiceMember,
  IServiceOrganization,
  IServiceProjectAccess,
} from './modules/organization/organization.service';
export {
  createOrganizationService,
  getOrganizationBillingEventsCountSerieCached,
  getOrganizationByProjectIdCached,
} from './modules/organization/organization.service';
// Dissolved from @openpanel/db's services/overview.service.ts +
// pages.service.ts (M7-005) — packages/trpc's overview/event routers,
// apps/api's insights controller, apps/worker's win-back job and the
// mcp/assistant tools call these directly. packages/db/src/services/
// overview.service.ts and pages.service.ts stay re-export shims.
export type {
  IGetMapDataInput,
  IGetMetricsInput,
  IGetTopEntryExitInput,
  IGetTopEventsInput,
  IGetTopGenericInput,
  IGetTopGenericSeriesInput,
  IGetTopLinkOutInput,
  IGetTopPagesInput,
  IGetUserJourneyInput,
  ILiveData,
  ILiveMinuteCount,
  SegmentDailyPoint,
  TrafficColumn,
} from './modules/overview/overview.service';
export {
  zGetMapDataInput,
  zGetMetricsInput,
  zGetTopEntryExitInput,
  zGetTopEventsInput,
  zGetTopGenericInput,
  zGetTopGenericSeriesInput,
  zGetTopLinkOutInput,
  zGetTopPagesInput,
  zGetUserJourneyInput,
} from './modules/overview/overview.service';
export type {
  IGetPagesInput,
  IPageConversionRow,
  IPageTimeseriesRow,
  ITopPage,
} from './modules/overview/pages.service';
export type {
  AdjustProfilePropertyResult,
  FindProfilesInput,
  GetProfileListOptions,
  IClickhouseProfile,
  IdentifyProfileInput,
  IProfileMetrics,
  IServiceProfile,
  IServiceUpsertProfile,
  ProfileRequestContext,
} from './modules/profile/profile.service';
export { transformProfile } from './modules/profile/profile.service';
// Dissolved from @openpanel/db's services/project.service.ts (M6-002) —
// packages/trpc's project router, apps/api's manage controller and several
// core modules' `src/access.ts` call these directly, the same way V1
// reaches every other dissolved service here. packages/db/src/services/
// project.service.ts stays a re-export shim.
export { ProjectTypeNames } from './modules/project/project.constants';
export type {
  CreatedProjectClient,
  IServiceProject,
  IServiceProjectWithClients,
  ProjectActivationStatus,
} from './modules/project/project.service';
export { createProjectService } from './modules/project/project.service';
// The six ClickHouse queries moved from packages/trpc/src/routers/realtime.ts
// (M6-007) — packages/trpc's realtime router calls these directly, the same
// way V1 reaches every other dissolved service here. The `/live` websocket
// glue in the same file stays internal to core/realtime.routes.ts; V1's own
// Fastify `/live` controller is untouched (see realtime.service.ts's header)
// so nothing else needs it from this barrel.
export type {
  RealtimeBadgeDetailScope,
  RealtimeLocation,
} from './modules/realtime/realtime.service';
// Moved from packages/db/src/services/reference.service.ts, plus the
// query/mutation bodies packages/trpc/src/routers/reference.ts held inline
// (M6-004) — packages/trpc's reference router calls these directly, the same
// way V1 reaches every other dissolved service here. packages/db keeps a
// re-export shim.
export type { IServiceReference } from './modules/reference/reference.service';
export { createReferenceService } from './modules/reference/reference.service';
// Moved from packages/constants/index.ts and packages/validation/src/index.ts
// (M7-006, ADR-008's module map: report owns "C" for the chart/report/widget
// vocabulary) — apps/start's report builder and the assistant/mcp tools
// reach the vocabulary directly through @openpanel/core here, same shape as
// `emailCategories`/`ProjectTypeNames` below. Both origin packages stay
// re-export shims.
export type { IFilterValueType } from './modules/report/report.constants';
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
  zChartBreakdown,
  zChartBreakdowns,
  zChartEvent,
  zChartEventFilter,
  zChartEventItem,
  zChartEventSegment,
  zChartEventWithType,
  zChartFormula,
  zChartInput,
  zChartSeries,
  zChartType,
  zCriteria,
  zFunnelOptions,
  zHistogramOptions,
  zLineType,
  zMetric,
  zRange,
  zReport,
  zReportInput,
  zReportOptions,
  zRetentionOptions,
  zSankeyOptions,
  zTimeInterval,
  zWidgetOptions,
  zWidgetType,
} from './modules/report/report.constants';
// Dissolved from @openpanel/db's services/reports.service.ts, plus V1's
// report router mutation bodies (M7-006) — packages/trpc's report router,
// apps/api's insights controller and the mcp/assistant tools call these.
// packages/db/src/services/reports.service.ts stays a re-export shim.
export type { IServiceReport } from './modules/report/report.service';
export {
  createReportService,
  transformFilter,
  transformReport,
  transformReportEventItem,
} from './modules/report/report.service';
export type { ReportEventItem } from './modules/report/src/series';
export {
  mergeGlobalFilters,
  onlyReportEvents,
} from './modules/report/src/series';
// Moved from packages/db/src/services/salt.service.ts +
// apps/worker/src/jobs/cron.salt.ts (M8-004) — `main.ts` calls
// `createInitialSalts(deps)` directly at boot; `salt.jobs.ts`'s cron handler
// and everything else reach `rotateSalt`/`getSalts` through
// `ctx.services.salt`.
export type { Salts } from './modules/salt/salt.service';
export {
  createInitialSalts,
  createSaltService,
} from './modules/salt/salt.service';
// Dissolved from @openpanel/db's services/session.service.ts and
// session-context.ts, plus apps/worker's session-end job, reaper and vacuum
// (M7-001, ADR-008's module map: session owns "R,S,J") — packages/trpc's
// session router, the assistant/mcp tools and apps/worker's thin delegates
// call these directly, the same way V1 reaches every other dissolved service
// here. `packages/db`'s re-export shims for both files are gone
// (M9-CLEANUP-001). The `sessions` queue's own job and the reaper/vacuum cron
// fragments are registered in jobs.registry.ts, not exported.
export type {
  GetSessionListOptions,
  IClickhouseSession,
  IServiceSession,
  ISessionReplayChunkMeta,
  QuerySessionsInput,
  SessionDistinctField,
} from './modules/session/session.service';
export {
  getSessionsCountCached,
  SESSION_DISTINCT_FIELDS,
  transformSession,
} from './modules/session/session.service';
// Dissolved from @openpanel/db's services/insights* + referrer-spikes.service
// (M5-001) — apps/worker's insight job files and packages/trpc's insight
// router call these directly, the same way V1 reaches every other dissolved
// service here.
export type { SessionMetricsRedis } from './modules/session/src/session.metrics';
export { registerSessionScrapeMetrics } from './modules/session/src/session.metrics';
export {
  als,
  getAlsSessionId,
  runWithAlsSession,
} from './modules/session/src/session-context';
export type {
  EnqueueSessionEndInput,
  SessionEndJobData,
} from './modules/session/src/session-end';
export {
  createSessionEnd,
  getSessionEndJobId,
  sessionEndEnqueueOptions,
  sessionEndJobPayload,
} from './modules/session/src/session-end';
export { reapIdleSessions } from './modules/session/src/session-reaper';
export { vacuumStaleSessions } from './modules/session/src/session-vacuum';
export { updateEventsCount } from './modules/session/src/usage';
// Moved from packages/db/src/services/share.service.ts, plus the
// query/mutation bodies packages/trpc/src/routers/share.ts held inline
// (M6-004, ADR-008's module map: share owns "C") — packages/trpc's share
// router calls these directly, the same way V1 reaches every other dissolved
// service here. packages/db keeps a re-export shim: auth.service.ts's
// signInToShare and packages/trpc's chart/overview routers still reach
// validateShareAccess/validateOverviewShareAccess through it.
export {
  zShareDashboard,
  zShareOverview,
  zShareReport,
} from './modules/share/share.constants';
export { createShareService } from './modules/share/share.service';
// Moved from packages/trpc/src/routers/subscription.ts, plus the Polar
// webhook business logic out of
// apps/api/src/controllers/webhook.controller.ts (M6-006, ADR-008's module
// map: subscription owns "S"+"C") — packages/trpc's subscription router and
// apps/api's webhook controller call these directly, the same way V1 reaches
// every other dissolved service here.
export {
  createSubscriptionService,
  getCurrentSubscriptionProduct,
  toSubscriptionDiscount,
} from './modules/subscription/subscription.service';
// New module (M7-008) — apps/api's tools controller calls these directly,
// the same way V1 reaches every other dissolved service here.
export type {
  IpLookupOutcome,
  IpLookupResult,
} from './modules/tools/src/ip-lookup';
export { runIpLookup } from './modules/tools/src/ip-lookup';
export type {
  SiteCheckOutcome,
  SiteCheckResult,
} from './modules/tools/src/site-checker';
export { runSiteCheck } from './modules/tools/src/site-checker';
// Dissolved from @openpanel/db's services/user.service.ts (M6-001) —
// packages/trpc's auth/onboarding routers call `getUserById`/
// `getUserAccount` directly through @openpanel/db's re-export shim, the same
// way they reach every other dissolved service here.
export { createUserService } from './modules/user/user.service';
export { dashboardRoutes, opsRoutes, publicApiRoutes } from './rest.routes';
// The RPC base is on the barrel because it is the seam every module's own
// `<name>.rpc.ts` builds its router on: ONE tRPC instance (ADR-009), mounted
// by V2's `createTrpcFetchHandler`. V1's now-deleted `@openpanel/trpc`
// reached the same builder the same way, before all 28 routers moved into
// `modules/<name>/<name>.rpc.ts` (M11-001) and the package itself was
// deleted (M11-004).
export type {
  CacheMiddlewareDeps,
  EnforceRateLimit,
  Meta,
  RateLimitOptions,
  RpcCache,
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
  protectedProcedureWithoutAccess,
  publicProcedure,
} from './rpc/base';
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
export type {
  AccessChecks,
  AccessLookups,
  OrganizationAccessLike,
  ProjectAccessLike,
} from './shared/access';
export { createAccessChecks } from './shared/access';
export type { IProjectAccess } from './shared/access-lookups';
export {
  canWriteProject,
  getClientAccess,
  getOrganizationAccess,
  getProjectAccess,
} from './shared/access-lookups';
// Dissolved from packages/common/server (M4-003) — a still-live V1 package
// (db, queue, apps/worker) reaches these the same way apps/api and core
// itself do, until its own module lands. mcp reaches it as an internal
// relative import now that it lives inside core (M5-007).
export {
  createHash,
  generateSalt,
  hashPassword,
  verifyPassword,
} from './shared/crypto';
export {
  getChartPrevStartEndDate,
  getChartStartEndDate,
  getDatesFromRange,
  resolveDateRange,
} from './shared/date';
// Moved from apps/worker/src/jobs/lib/email-sequence.ts (M6-003) — shared by
// the onboarding module and, since M9-003, the organization module's
// wind-down track.
export type {
  RunSequenceOptions,
  SequenceResult,
  SequenceStep,
  SequenceSubject,
  StepResult,
} from './shared/email-sequence';
export { runSequence, step } from './shared/email-sequence';
export {
  decrypt,
  decryptCredential,
  encrypt,
  encryptCredential,
  isEncrypted,
} from './shared/encryption';
export {
  DEFAULT_IP_HEADER_ORDER,
  getClientIpFromHeaders,
  getTrustedIpFromHeaders,
  TRUSTED_IP_HEADER_ORDER,
} from './shared/get-client-ip';
export { generateId, generateSecureId, shortId } from './shared/id';
// packages/db reads ClickHouse row JSON through this (P11: packages/json's
// only definition already lived here; the barrel is how a package outside
// core reaches it, since the exports map has no ./shared/* entry).
export { getSafeJson } from './shared/json';
export { getReferrerWithQuery, parseReferrer } from './shared/parse-referrer';
export type {
  UserAgentInfo,
  UserAgentResult,
} from './shared/parser-user-agent';
export { getDevice, parseUserAgent } from './shared/parser-user-agent';
export { generateDeviceId } from './shared/profileId';
export type {
  SafeFetchOptions,
  SafeFetchResult,
  SafeFetchStreamResult,
} from './shared/safe-fetch';
export {
  assertPublicHostname,
  assertPublicUrl,
  BlockedUrlError,
  createPinnedAgent,
  isBlockedIp,
  safeFetch,
  safeFetchStream,
} from './shared/safe-fetch';
// Below the transports since M15-007 (ADR-022 R22): `rpc/base.ts` needs the
// empty shape and may not deep-import a module to get it.
export { EMPTY_SESSION } from './shared/session';
export { assertSafeUrl, createPinnedLookup } from './shared/ssrf';
