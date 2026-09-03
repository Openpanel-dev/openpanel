// The curated public surface of @openpanel/core.
//
// Never `export *`. What leaves this package is exactly what is named here
// plus the `*.constants` subpaths in package.json's exports map — see
// AGENTS.md. Everything below is what `apps/api` needs to build `AppDeps`
// once and mount the three route surfaces plus the tRPC router over it; a
// service, a client or a buffer is not reachable from here by design.

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
// The concrete pino implementation (dissolved from @openpanel/logger,
// M4-003). `./logger` above is the structural interface every module codes
// against; this is what apps/api, and the still-live apps/worker, call to
// build one.
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
  Ctx,
  HttpCtx,
  JobCtx,
  RuntimeFlags,
  ScopeMeta,
  Session,
} from './context';
export { createCtx, extendCtx } from './context';
export { requestContext, requestLogging } from './http/context';
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
// Moved from apps/api/src/agents/* + packages/trpc/src/agents/filter-command.ts
// (M5-005) — apps/api's `/ai/agents/*` Fastify wrapper and packages/trpc's
// overview router call these.
//
// Loaded via dynamic import, NOT a static re-export like every other service
// on this barrel: packages/db/src/buffers/base-buffer.ts already imports
// `@openpanel/core` eagerly, and this module's own chain reaches deep into
// `@openpanel/db` (the Prisma-backed conversation store, ~30 analytics/report
// tool functions). A static re-export here would make THIS barrel's own
// evaluation re-enter `@openpanel/db` while it is still mid-evaluation of
// `./buffers` — `bot-buffer.ts extends BaseBuffer` then sees `BaseBuffer` as
// `undefined` (a live TDZ binding that never got the chance to fill in).
// `event-buffer.test.ts` et al. hit exactly this before this indirection was
// added. `chatApp` and `chatRunContext` are one-time-per-process values, so
// callers resolve them once (apps/api's Fastify wrapper does so inside its
// own already-async route registration) and keep the reference.
export type {
  ChatApp,
  ChatRunContext,
  FilterCommandResult,
} from './modules/assistant/assistant.service';

import type { PageContext } from './modules/assistant/assistant.constants';

let _assistant:
  | Promise<typeof import('./modules/assistant/assistant.service')>
  | undefined;
function loadAssistant() {
  if (!_assistant) {
    _assistant = import('./modules/assistant/assistant.service');
  }
  return _assistant;
}

export async function getChatApp() {
  return (await loadAssistant()).chatApp;
}
export async function getChatRunContext() {
  return (await loadAssistant()).chatRunContext;
}
export async function runFilterCommand(input: {
  query: string;
  projectId: string;
  pageContext?: PageContext;
  timezone: string;
}) {
  const { runFilterCommand: run } = await loadAssistant();
  return run(input);
}
// Dissolved from @openpanel/auth (M4-007) — apps/api's OAuth callbacks and
// @openpanel/trpc's auth/share/user/gsc routers call these directly, the same
// way they reach the other dissolved leaf packages here. `hashPassword` is
// renamed on the way out: `./shared/crypto` already owns that name for the
// (unrelated) scrypt hash client secrets use.
export type { AuthService, OAuth2Tokens } from './modules/auth/auth.service';
export {
  Arctic,
  buildOtpauthUrl,
  COOKIE_MAX_AGE,
  COOKIE_OPTIONS,
  consumeRecoveryCode,
  createAuthService,
  decodeSessionToken,
  deleteSessionTokenCookie,
  generateQrDataUrl,
  generateRecoveryCodes,
  generateSessionToken,
  generateTotpSecret,
  github,
  google,
  googleGsc,
  hashPassword as hashUserPassword,
  hashRecoveryCodes,
  hashSessionToken,
  normalizeRecoveryCode,
  parseCookieDomain,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
  verifyPasswordHash,
  verifyTotpCode,
} from './modules/auth/auth.service';
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
  createClientForOrganization,
  deleteClientForOrganization,
  getClientById,
  getClientByIdCached,
  getClientForOrganization,
  getClientsByOrganizationId,
  getClientsByProjectId,
  listClientsForOrganization,
  updateClientForOrganization,
} from './modules/client/client.service';
// Dissolved from @openpanel/db's services/cohort.service.ts (M5-003) —
// packages/trpc's cohort router and apps/worker's cohort job files call
// these directly, the same way V1 reaches every other dissolved service
// here. Nothing else in the tree reached cohort.service.ts through
// @openpanel/db's barrel, so packages/db loses the file entirely rather than
// keeping a re-export shim (unlike gsc.ts/gsc.service.ts).
export type { CohortService } from './modules/cohort/cohort.service';
export {
  computeCohort,
  countCohort,
  deleteCohortMembership,
  getCohortCount,
  getCohortEventsPerDay,
  getCohortMemberEvents,
  getCohortMemberRoutes,
  getCohortMembers,
  getProfilesInCohort,
  listCohortMemberProfiles,
  listRefreshableCohortIds,
  updateCohortMembership,
} from './modules/cohort/cohort.service';
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
export {
  deleteConversation,
  getConversationById,
  listConversations,
  upsertConversationTitle,
} from './modules/conversation/conversation.service';
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
export {
  completeGscOAuthCallback,
  disconnectGscConnection,
  getGscAiEngines,
  getGscCannibalization,
  getGscConnection,
  getGscOverview,
  getGscPageDetails,
  getGscPages,
  getGscPreviousOverview,
  getGscQueries,
  getGscQueryDetails,
  getGscSearchEngines,
  gscGetCannibalizationCore,
  gscGetOverviewCore,
  gscGetPageDetailsCore,
  gscGetQueryDetailsCore,
  gscGetQueryOpportunitiesCore,
  gscGetTopPagesCore,
  gscGetTopQueriesCore,
  listGscConnectionsForSync,
  listGscSites,
  resolveGscDateRange,
  runGscProjectBackfill,
  runGscProjectSync,
  selectGscSite,
  syncGscData,
} from './modules/gsc/gsc.service';
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
  OrganizationService,
} from './modules/organization/organization.service';
export {
  cancelOrganizationDeletion,
  connectUserToOrganization,
  createOrganizationService,
  deleteFromClickhouse,
  deleteOrganization,
  deleteProjects,
  getInviteById,
  getInviteOrThrow,
  getInvites,
  getMember,
  getMembers,
  getOrganizationBillingEventsCount,
  getOrganizationBillingEventsCountSerie,
  getOrganizationBillingEventsCountSerieCached,
  getOrganizationById,
  getOrganizationByProjectId,
  getOrganizationByProjectIdCached,
  getOrganizationEventsCount,
  getOrganizationEventsCountSince,
  getOrganizationSubscriptionChartEndDate,
  getOrganizations,
  getSettingsForOrganization,
  getSettingsForProject,
  inviteUserToOrganization,
  removeOrganizationMember,
  revokeInvite,
  runDeleteCron,
  scheduleOrganizationDeletion,
  updateOrganization,
  updateOrganizationMemberAccess,
} from './modules/organization/organization.service';
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
export {
  cancelProjectDeletion,
  createProjectForOrganization,
  deleteProjectForOrganization,
  getLastEventPerProject,
  getProjectActivationStatus,
  getProjectById,
  getProjectByIdCached,
  getProjectEventsCount,
  getProjectForOrganization,
  getProjects,
  getProjectWithClients,
  listProjectsCore,
  listProjectsForOrganization,
  resolveClientProjectId,
  scheduleProjectDeletion,
  updateProjectForOrganization,
} from './modules/project/project.service';
// Dissolved from @openpanel/db's services/user.service.ts (M6-001) —
// packages/trpc's auth/onboarding routers still call `getUserById`/
// `getUserAccount` directly through @openpanel/db's re-export shim, the same
// way they reach every other dissolved service here.
export type { IServiceUser } from './modules/user/user.service';
export {
  deleteUserAccount,
  getUserAccount,
  getUserById,
  listUserDeletionBlockers,
  updateUserProfile,
} from './modules/user/user.service';

// packages/mcp absorbed whole (M5-007) — apps/api's mcp.router.ts is the one
// external caller, delegating the streamable-HTTP POST protocol here
// (DELEGATE PATTERN). ADR-015 entry 2: stateless-only, so there is no
// SessionManager to manage.
//
// Loaded via dynamic import, NOT a static re-export, for the same reason
// `getChatApp`/`runFilterCommand` above are: `mcp.service` reaches
// `@openpanel/db` (auth's client lookup, every analytics tool), and
// `@openpanel/db/src/buffers/base-buffer.ts` already imports `@openpanel/core`
// eagerly. A static export here would make this barrel's own evaluation
// re-enter `@openpanel/db` mid-evaluation — observed as a `PagesService` TDZ
// ReferenceError two modules away, in a tool file that never otherwise runs
// at import time.
let _mcp: Promise<typeof import('./modules/mcp/mcp.service')> | undefined;
function loadMcp() {
  if (!_mcp) {
    _mcp = import('./modules/mcp/mcp.service');
  }
  return _mcp;
}

export async function handleMcpRequest(
  query: Record<string, unknown>,
  authHeader: string | undefined,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const { extractToken, handleStatelessMcpRequest } = await loadMcp();
  const token = extractToken(query, authHeader);
  return handleStatelessMcpRequest(token, body);
}
// Dissolved from @openpanel/db's services/import.service.ts +
// apps/worker's job file + apps/api's /import controller (M5-004) —
// apps/worker's import job file and apps/api's import controller call these
// directly, the same way V1 reaches every other dissolved service here.
// packages/db/src/services/import.service.ts is deleted outright: nothing
// else reached it through @openpanel/db's barrel (same as cohort, M5-003).
export type {
  ImportJobProgress,
  ImportService,
  ImportStageResult,
  ImportSteps,
  InsertRawEventsResult,
  UpdateImportStatusOptions,
} from './modules/import/import.service';
export {
  backfillSessionsToProduction,
  cleanupSessionStartEndEvents,
  cleanupStagingData,
  createSessionsStartEndEvents,
  generateGapBasedSessionIds,
  getImportDateBounds,
  insertImportBatch,
  insertProfilesBatch,
  insertRawEventsBatch,
  moveImportsToProduction,
  runImportJob,
  updateImportStatus,
} from './modules/import/import.service';
// Dissolved from @openpanel/db's services/insights* + referrer-spikes.service
// (M5-001) — apps/worker's insight job files and packages/trpc's insight
// router call these directly, the same way V1 reaches every other dissolved
// service here.
export type {
  DailyInsightCandidate,
  GetReferrerSpikesInput,
  ReferrerSpikeCluster,
  WeeklyDigestPreview,
  WeeklyDigestResult,
} from './modules/insight/insight.service';
export {
  cleanupStaleInsights,
  explainInsight,
  getReferrerSpikes,
  listAllInsights,
  listDailyInsightCandidates,
  listInsights,
  previewWeeklyDigest,
  runProjectInsights,
  scanLegacyInsights,
  sendWeeklyDigests,
} from './modules/insight/insight.service';
export { dashboardRoutes, opsRoutes, publicApiRoutes } from './rest.routes';
// The RPC base is on the barrel because it is the seam `@openpanel/trpc`
// builds its 28 routers on: ONE tRPC instance, mounted by V1's Fastify
// adapter and by V2's `createTrpcFetchHandler` alike (ADR-009). Those routers
// move into `modules/<name>/<name>.rpc.ts` with their waves (P5-P8), and this
// block shrinks back to what apps/api needs when the last one has moved.
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
// Dissolved from @openpanel/common/server (M4-003) — a still-live V1 package
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
export { assertSafeUrl, createPinnedLookup } from './shared/ssrf';
