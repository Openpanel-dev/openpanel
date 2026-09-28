// The curated public surface of @openpanel/core.
//
// Never `export *`. What leaves this package is exactly what is named here
// plus the `*.constants` subpaths in package.json's exports map — see
// AGENTS.md. Everything below is what `apps/api` needs to build `AppDeps`
// once and mount the three route surfaces plus the tRPC router over it; a
// service, a client or a buffer is not reachable from here by design.

// packages/db reads ClickHouse row JSON through this (P11: packages/json's
// only definition already lived here; the barrel is how a package outside
// core reaches it, since the exports map has no ./shared/* entry).
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
// Dissolved from packages/common/server — a still-live V1 package (db, queue,
// apps/worker) reaches these the same way apps/api and core itself do, until
// its own module lands. mcp reaches it as an internal relative import now that
// it lives inside core.
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
// The seven buffers (moved from packages/db/src/buffers). Only the FACTORY is
// on the barrel: they are boot singletons on `AppDeps`, built once by
// `main.ts`, never module singletons. V1's packages/db/src/buffers/index.ts
// calls this once and re-exports the instances, so both boots share one set.
export type { BufferDeps } from './buffers/base-buffer';
export { registerBufferMetrics } from './buffers/buffer.metrics';
export type { Buffers } from './buffers/create-buffers';
export { createBuffers } from './buffers/create-buffers';
// R13, M15-008: of the ~35 `clients/` symbols this barrel used to re-export,
// `main.ts` imported one (`createClients`) and `apps/start` none. The rest —
// every AI call, the Slack/Discord senders, the geo lookups, the object-store
// adapters, the integration registry — are reached by relative import inside
// this package and are no longer on the public surface. `pino-logger` is the
// concrete implementation of `./logger`'s structural interface; main.ts builds
// its own named logger from it and mirrors a fatal to the real stderr with the
// write captured before `interceptProcessOutput` wrapped the stream.
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
// The root chain `main.ts` hangs every surface on: V1's CORS delegator and V1's
// error handler, both ported and both taking their deployment-derived values as
// arguments — core reads no environment.
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
// Moved from apps/api/src/agents/* +
// packages/trpc/src/agents/filter-command.ts. M15-003: the chat app, the run
// context and the filter command all take the API's `deps` now, so the barrel
// carries the factory and the types only — `assistant.routes.ts` and
// `overview.rpc.ts` reach them through `ctx.services.assistant`. `ChatApp` is
// the one type past `AppRouter` that crosses into apps/start
// (`src/agents/client.ts`); it stays a TYPE, so no value of this module reaches
// a browser bundle.
export type { ChatApp } from './modules/assistant/assistant.service';
export { createAssistantService } from './modules/assistant/assistant.service';
// Dissolved from @openpanel/auth — apps/api's OAuth callbacks call these
// directly; V1's now-deleted @openpanel/trpc auth/share/user/gsc routers did
// too, the same way they reached the other dissolved leaf packages here.
// `hashPassword` is renamed on the way out: `@openpanel/shared/server` already
// owns that name for the (unrelated) scrypt hash client secrets use.
//
// The sign-up/sign-in/TOTP/reset-password/share/OAuth-callback half joined it
// here — V1's now-deleted packages/trpc auth router and
// apps/api/src/controllers/oauth-callback.controller.tsx called these directly,
// the same way V1 reached every other dissolved service here.
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
// Moved from packages/db/src/services/auth-session.service.ts — the
// Postgres-backed login session CRUD. packages/db keeps a re-export shim
// (existing `@openpanel/db` importers, apps/api's app.ts).
export { validateSessionToken } from './modules/auth/src/login-session';
export { getIsRegistrationAllowed } from './modules/auth/src/registration';
// Dissolved from @openpanel/db's services/chart.service.ts and engine/ —
// packages/trpc's chart router, apps/api's export controller, V1's
// funnel/conversion/sankey/retention/overview services and the mcp/assistant
// tools reach the engine and the field/filter compilers here.
// packages/db/src/services/chart.service.ts and src/engine/index.ts stay
// re-export shims.
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
// Dissolved from @openpanel/db's services/funnel.service.ts — packages/db's
// reports.service, apps/api's insights controller and the mcp/assistant tools
// call these. packages/db/src/services/funnel.service.ts stays a re-export
// shim.
export { toSeries } from './modules/chart/funnel.service';
// Dissolved from @openpanel/db's services/retention.service.ts — apps/api's
// insights controller and the mcp/assistant tools call these.
// packages/db/src/services/retention.service.ts stays a re-export shim.
export type { IRetentionCohortRow } from './modules/chart/retention.service';
export { processCohortData } from './modules/chart/retention.service';
// Dissolved from @openpanel/db's services/sankey.service.ts — apps/api's
// insights controller and the mcp/assistant tools call these.
// packages/db/src/services/sankey.service.ts stays a re-export shim.
export { getRawWhereClause } from './modules/chart/sankey.service';
// Moved from packages/db/src/services/filter-where.service.ts — the
// sessions/profiles/events-table filter compiler, distinct from
// `getEventFiltersWhereClause` above. packages/db/src/services/
// filter-where.service.ts stays a re-export shim.
export type { FilterTableContext } from './modules/chart/src/table-filter-where';
export { buildFilterWhere } from './modules/chart/src/table-filter-where';
// Dissolved from @openpanel/db's services/clients.service.ts — packages/trpc's
// client router, apps/api's manage controller and mcp/utils auth call these
// directly, the same way V1 reaches every other dissolved service here.
// packages/db/src/services/clients.service.ts stays a re-export shim.
export type { IPublicClient } from './modules/client/client.service';
export {
  createClientService,
  // apps/api's session e2e clears one client's cache between runs.
  getClientByIdCached,
} from './modules/client/client.service';
// Dissolved from @openpanel/db's services/cohort.service.ts — packages/trpc's
// cohort router and apps/worker's cohort job files call these directly, the
// same way V1 reaches every other dissolved service here. Nothing else in the
// tree reached cohort.service.ts through @openpanel/db's barrel, so packages/db
// loses the file entirely rather than keeping a re-export shim (unlike
// gsc.ts/gsc.service.ts). Moved from @openpanel/db's
// services/conversation.service.ts — packages/trpc's conversation router,
// apps/api's live chat route and this package's own assistant.routes.ts stub
// call these directly. packages/db keeps a re-export shim (unlike cohort): both
// non-trpc call sites still reach it through `@openpanel/db`'s barrel.
export { createConversationService } from './modules/conversation/conversation.service';
// Dissolved from @openpanel/db's services/dashboard.service.ts, plus V1's
// dashboard router mutation bodies — packages/trpc's dashboard router,
// apps/api's insights controller and the mcp/assistant tools call these.
// packages/db/src/services/dashboard.service.ts stays a re-export shim.
export type {
  IServiceDashboard,
  IServiceDashboards,
} from './modules/dashboard/dashboard.service';
// R + C only: the router's three bodies are three small `db.emailUnsubscribe`
// calls, small enough to live inline in `email.rpc.ts` rather than a dedicated
// `email.service.ts` — see that file's header. `emailCategories` moved from
// packages/constants (ADR-008's module map: email owns "C"); packages/constants
// keeps a re-export shim.
export { emailCategories } from './modules/email/email.constants';
// Moved from apps/worker/src/jobs/lib/email-sequence.ts — shared by the
// onboarding module and, since M9-003, the organization module's wind-down
// track.
export type {
  SequenceStep,
  SequenceSubject,
} from './modules/email/src/sequence';
export { runSequence, step } from './modules/email/src/sequence';
// Dissolved from @openpanel/db's services/event.service.ts, profile.service.ts
// and group.service.ts, plus the query/mutation bodies packages/trpc's
// event/profile/group routers held inline and apps/api's profile controller
// (ADR-008's module map: event "R,S", profile "R,H,S", group "R,S,C") —
// packages/trpc's routers, apps/api's export controller, is-bot hook and
// profile controller, apps/worker's incoming-event job and the assistant/mcp
// tools call these directly, the same way V1 reaches every other dissolved
// service here. `packages/db`'s re-export shims for these three files are gone
// (M9-CLEANUP-001) — every caller now imports this barrel directly.
// `profileSearchSql` (cohort.service's one addition atop the shim) died with
// M12-003: its only caller now composes a `sql` fragment and uses
// `profileSearchCondition`.
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
// Dissolved from @openpanel/db's src/gsc.ts + services/gsc.service.ts —
// apps/worker's gsc job file, apps/api's gsc OAuth callback controller and
// packages/trpc's gsc router call these directly, the same way V1 reaches every
// other dissolved service here. packages/db/src/gsc.ts and
// packages/db/src/services/gsc.service.ts re-export the subset MCP's gsc tools
// and the assistant's SEO tools still reach via `@openpanel/db`.
export { getGscCannibalization } from './modules/gsc/gsc.service';
export { setShuttingDown } from './modules/health/src/shutdown';
// Dissolved from @openpanel/db's services/import.service.ts + apps/worker's job
// file + apps/api's /import controller — apps/worker's import job file and
// apps/api's import controller call these directly, the same way V1 reaches
// every other dissolved service here.
// packages/db/src/services/import.service.ts is deleted outright: nothing else
// reached it through @openpanel/db's barrel (same as cohort).
// The ingestion pipeline. apps/api's /track controller, its three route hooks
// and the legacy /event controller are thin delegates over these — the same
// functions core's own `ingestRoutes` calls.
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
// The Kafka transport itself: producer, consumer factory, admin/lag sampling
// and every topic/group/retry constant, moved from @openpanel/queue's kafka.ts
// unchanged. It constructs no client at import time, so the barrel stays
// offline-importable.
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
// Moved from packages/trpc/src/routers/integration.ts, plus the Slack OAuth
// callback business logic out of apps/api/src/controllers/webhook.controller.ts
// (ADR-008's module map: integration owns "S"+"C") — packages/trpc's
// integration router and apps/api's webhook controller call these directly, the
// same way V1 reaches every other dissolved service here.
// Slack's OAuth token-exchange wire contract — not integration config (stays
// out of the `*.constants` subpath, see
// modules/integration/src/slack-contract.ts's header), but apps/api's webhook
// controller still needs it to validate Slack's `oauth.v2.access` response, the
// same way it reaches slackInstaller above.
export { zSlackAuthResponse } from './modules/integration/src/slack-contract';
// Packages/mcp absorbed whole — ADR-015 entry 2: stateless-only, so there is no
// SessionManager to manage. M15-003: the barrel carries the factory and the two
// types only. `handleStatelessMcpRequest` needs the API's `deps`, so the app
// shell reaches MCP the one way it ever did — `rest.routes.ts`'s
// `.use(mcpRoutes(deps))` and `ctx.services.mcp`.
export type { McpAuthContext } from './modules/mcp/mcp.service';
// Ported from apps/api's misc controller + apps/worker's cron.ping.ts —
// apps/api's misc controller and the worker's ping cron job call these
// directly, the same way V1 reaches every other dissolved service here. `GET
// /misc/og/clear` and `/misc/favicon/clear` are NOT ported (ADR-015 entry #6:
// RULED + DEAD).
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
// Dissolved from @openpanel/db's services/notification.service.ts ("rules +
// dispatch stay together"). `createNotification` / `triggerNotification` /
// `checkNotificationRulesForEvent` / `checkNotificationRulesForSessionEnd` —
// the BullMQ-producer orchestration around a rule match — came home from
// @openpanel/queue at M11-003 and now live in this module's own
// src/notification-dispatch.ts. Only the one the Kafka message handler is bound
// to at boot needs to leave the package.
export { checkNotificationRulesForEvent } from './modules/notification/src/notification-dispatch';
// New module — the onboarding-project mutation and the onboarding email drip,
// neither of which had a packages/db/src/services/* home to move from. V1's
// now-deleted packages/trpc onboarding router and apps/worker's onboarding cron
// job called these directly, the same way V1 reached every other dissolved
// service here.
export { createOnboardingService } from './modules/onboarding/onboarding.service';
// Dissolved from @openpanel/db's services/organization.service.ts +
// services/delete.service.ts (folded together per the module map) —
// packages/trpc's organization router, apps/worker's delete cron job and
// packages/db's own engine/analytics services (`getSettingsForProject`) call
// these directly, the same way V1 reaches every other dissolved service here.
// packages/db/src/services/organization.service.ts stays a re-export shim
// (unlike delete.service.ts, which packages/db loses entirely — nothing but the
// worker's cron job reached it through @openpanel/db's barrel).
export type {
  IServiceMember,
  IServiceOrganization,
} from './modules/organization/organization.service';
export {
  createOrganizationService,
  getOrganizationByProjectIdCached,
} from './modules/organization/organization.service';
// Dissolved from @openpanel/db's services/overview.service.ts +
// pages.service.ts — packages/trpc's overview/event routers, apps/api's
// insights controller, apps/worker's win-back job and the mcp/assistant tools
// call these directly. packages/db/src/services/ overview.service.ts and
// pages.service.ts stay re-export shims.
export type { IGetTopGenericInput } from './modules/overview/overview.service';
export type {
  AdjustProfilePropertyResult,
  IClickhouseProfile,
  IdentifyProfileInput,
  IProfileMetrics,
  IServiceProfile,
  ProfileRequestContext,
} from './modules/profile/profile.service';
// Dissolved from @openpanel/db's services/project.service.ts — packages/trpc's
// project router, apps/api's manage controller and several core modules'
// `src/access.ts` call these directly, the same way V1 reaches every other
// dissolved service here. packages/db/src/services/ project.service.ts stays a
// re-export shim.
export type {
  IServiceProject,
  IServiceProjectWithClients,
} from './modules/project/project.service';
export { createProjectService } from './modules/project/project.service';
// The six ClickHouse queries moved from packages/trpc/src/routers/realtime.ts —
// packages/trpc's realtime router calls these directly, the same way V1 reaches
// every other dissolved service here. The `/live` websocket glue in the same
// file stays internal to core/realtime.routes.ts; V1's own Fastify `/live`
// controller is untouched (see realtime.service.ts's header) so nothing else
// needs it from this barrel.
// Moved from packages/db/src/services/reference.service.ts, plus the
// query/mutation bodies packages/trpc/src/routers/reference.ts held inline —
// packages/trpc's reference router calls these directly, the same way V1
// reaches every other dissolved service here. packages/db keeps a re-export
// shim.
export type { IServiceReference } from './modules/reference/reference.service';
export { createReferenceService } from './modules/reference/reference.service';
// Moved from packages/constants/index.ts and packages/validation/src/index.ts
// (ADR-008's module map: report owns "C" for the chart/report/widget
// vocabulary) — apps/start's report builder and the assistant/mcp tools reach
// the vocabulary directly through @openpanel/core here, same shape as
// `emailCategories`/`ProjectTypeNames` below. Both origin packages stay
// re-export shims.
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
// Dissolved from @openpanel/db's services/reports.service.ts, plus V1's report
// router mutation bodies — packages/trpc's report router, apps/api's insights
// controller and the mcp/assistant tools call these.
// packages/db/src/services/reports.service.ts stays a re-export shim.
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
// Moved from packages/db/src/services/salt.service.ts +
// apps/worker/src/jobs/cron.salt.ts — `main.ts` calls
// `createInitialSalts(deps)` directly at boot; `salt.jobs.ts`'s cron handler
// and everything else reach `rotateSalt`/`getSalts` through
// `ctx.services.salt`.
export {
  createInitialSalts,
  createSaltService,
} from './modules/salt/salt.service';
// Dissolved from @openpanel/db's services/session.service.ts and
// session-context.ts (now shared/als-session.ts), plus apps/worker's
// session-end job, reaper and vacuum (ADR-008's module map: session owns
// "R,S,J") — packages/trpc's session router, the assistant/mcp tools and
// apps/worker's thin delegates call these directly, the same way V1 reaches
// every other dissolved service here. `packages/db`'s re-export shims for both
// files are gone (M9-CLEANUP-001). The `sessions` queue's own job and the
// reaper/vacuum cron fragments are registered in jobs.registry.ts, not
// exported.
export type {
  IClickhouseSession,
  IServiceSession,
} from './modules/session/session.service';
export { SESSION_DISTINCT_FIELDS } from './modules/session/session.service';
// Dissolved from @openpanel/db's services/insights* + referrer-spikes.service —
// apps/worker's insight job files and packages/trpc's insight router call these
// directly, the same way V1 reaches every other dissolved service here.
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
// Moved from packages/db/src/services/share.service.ts, plus the query/mutation
// bodies packages/trpc/src/routers/share.ts held inline (ADR-008's module map:
// share owns "C") — packages/trpc's share router calls these directly, the same
// way V1 reaches every other dissolved service here. packages/db keeps a
// re-export shim: auth.service.ts's signInToShare and packages/trpc's
// chart/overview routers still reach
// validateShareAccess/validateOverviewShareAccess through it.
export {
  zShareDashboard,
  zShareOverview,
  zShareReport,
} from './modules/share/share.constants';
export { createShareService } from './modules/share/share.service';
// Moved from packages/trpc/src/routers/subscription.ts, plus the Polar webhook
// business logic out of apps/api/src/controllers/webhook.controller.ts
// (ADR-008's module map: subscription owns "S"+"C") — packages/trpc's
// subscription router and apps/api's webhook controller call these directly,
// the same way V1 reaches every other dissolved service here.
export { toSubscriptionDiscount } from './modules/subscription/subscription.service';
// New module — apps/api's tools controller calls these directly, the same way
// V1 reaches every other dissolved service here.
export { runIpLookup } from './modules/tools/src/ip-lookup';
export type { SiteCheckResult } from './modules/tools/src/site-checker';
export { runSiteCheck } from './modules/tools/src/site-checker';
// Dissolved from @openpanel/db's services/user.service.ts — packages/trpc's
// auth/onboarding routers call `getUserById`/ `getUserAccount` directly through
// @openpanel/db's re-export shim, the same way they reach every other dissolved
// service here.
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
// `<name>.rpc.ts` builds its router on: ONE tRPC instance, mounted by V2's
// `createTrpcFetchHandler`. V1's now-deleted `@openpanel/trpc` reached the same
// builder the same way, before all 28 routers moved into
// `modules/<name>/<name>.rpc.ts` and the package itself was deleted.
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
