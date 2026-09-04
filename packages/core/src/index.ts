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
// Slack's OAuth token-exchange wire contract (M6-006) — not integration
// config (stays out of the `*.constants` subpath, see
// modules/integration/src/slack-contract.ts's header), but apps/api's
// webhook controller still needs it to validate Slack's `oauth.v2.access`
// response, the same way it reaches slackInstaller above.
export { zSlackAuthResponse } from './modules/integration/src/slack-contract';

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
//
// The sign-up/sign-in/TOTP/reset-password/share/OAuth-callback half (M6-003)
// joined it here — packages/trpc's auth router and
// apps/api/src/controllers/oauth-callback.controller.tsx call these
// directly, the same way V1 reaches every other dissolved service here.
export type {
  AuthProvider,
  AuthService,
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
  COOKIE_OPTIONS,
  completeOAuthCallback,
  consumeRecoveryCode,
  createAuthService,
  decodeSessionToken,
  deleteSessionTokenCookie,
  disableTotp,
  enableTotp,
  extendSessionCookie,
  fetchGithubOAuthUser,
  fetchGoogleOAuthUser,
  generateQrDataUrl,
  generateRecoveryCodes,
  generateSessionToken,
  generateTotpSecret,
  getTotpStatus,
  github,
  google,
  googleGsc,
  hashPassword as hashUserPassword,
  hashRecoveryCodes,
  hashSessionToken,
  normalizeRecoveryCode,
  OAuthCallbackError,
  parseCookieDomain,
  regenerateTotpRecoveryCodes,
  requestPasswordReset,
  resetPasswordWithToken,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
  setupTotp,
  signInToShare,
  signInWithEmail,
  signInWithTotp,
  signOutUser,
  signUpWithEmail,
  startOAuthSignIn,
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
// R + C only (M6-004): the router's three bodies are three small
// `db.emailUnsubscribe` calls, small enough to live inline in
// `email.rpc.ts` rather than a dedicated `email.service.ts` — see that
// file's header. `emailCategories` moved from @openpanel/constants (ADR-008's
// module map: email owns "C"); @openpanel/constants keeps a re-export shim.
export type { EmailCategory } from './modules/email/email.constants';
export { emailCategories } from './modules/email/email.constants';
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
// Moved from packages/trpc/src/routers/integration.ts, plus the Slack OAuth
// callback business logic out of
// apps/api/src/controllers/webhook.controller.ts (M6-006, ADR-008's module
// map: integration owns "S"+"C") — packages/trpc's integration router and
// apps/api's webhook controller call these directly, the same way V1 reaches
// every other dissolved service here.
export type { CompleteSlackOAuthCallbackResult } from './modules/integration/integration.service';
export {
  completeSlackOAuthCallback,
  createOrUpdateSlackIntegration,
  deleteIntegration,
  getIntegrationById,
  listIntegrationsForProject,
  SlackOAuthCallbackError,
  testExportIntegrationConnection,
  testIntegrationConnection,
  upsertIntegration,
} from './modules/integration/integration.service';
// Dissolved from @openpanel/db's services/notification.service.ts (M6-005,
// "rules + dispatch stay together") — packages/trpc's notification router,
// packages/db's own enqueue orchestration (createNotification et al, which
// stays there — see that file's header for why) and apps/worker's
// notification job all call these directly, the same way V1 reaches every
// other dissolved service here. packages/db/src/services/notification.service.ts
// stays a re-export shim for the pieces that moved.
export type {
  INotificationPayload,
  INotificationRuleCached,
  NotificationService,
} from './modules/notification/notification.service';
export {
  APP_NOTIFICATION_INTEGRATION_ID,
  BASE_INTEGRATIONS,
  createNotificationService,
  createOrUpdateNotificationRule,
  deleteNotificationRule,
  deliverNotification,
  EMAIL_NOTIFICATION_INTEGRATION_ID,
  getFunnelRules,
  getHasFunnelRules,
  getNotificationRuleByIdOrThrow,
  getNotificationRulesByProjectId,
  isBaseIntegration,
  listNotificationRules,
  listNotifications,
  matchEvent,
  matchEventFilters,
  notificationTemplateEvent,
  notificationTemplateFunnel,
} from './modules/notification/notification.service';
// New module (M6-003) — the onboarding-project mutation and the onboarding
// email drip, neither of which had a packages/db/src/services/* home to move
// from. packages/trpc's onboarding router and apps/worker's onboarding cron
// job call these directly, the same way V1 reaches every other dissolved
// service here.
export type {
  CreateOnboardingProjectResult,
  OnboardingCronSummary,
  OnboardingService,
} from './modules/onboarding/onboarding.service';
export {
  canSkipOnboarding,
  createOnboardingProject,
  createOnboardingService,
  runOnboardingCron,
} from './modules/onboarding/onboarding.service';
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
export {
  getRealtimeActiveSessions,
  getRealtimeCoordinates,
  getRealtimeGeo,
  getRealtimeMapBadgeDetails,
  getRealtimePaths,
  getRealtimeReferrals,
} from './modules/realtime/realtime.service';
// Moved from packages/db/src/services/reference.service.ts, plus the
// query/mutation bodies packages/trpc/src/routers/reference.ts held inline
// (M6-004) — packages/trpc's reference router calls these directly, the same
// way V1 reaches every other dissolved service here. packages/db keeps a
// re-export shim.
export type { IServiceReference } from './modules/reference/reference.service';
export {
  createReference,
  deleteReference,
  getChartReferences,
  getReferenceById,
  getReferenceByIdOrThrow,
  listReferences,
  updateReference,
} from './modules/reference/reference.service';
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
export {
  createShareDashboard,
  createShareOverview,
  createShareReport,
  getShareByProjectId,
  getShareDashboard,
  getShareDashboardByDashboardId,
  getShareDashboardById,
  getShareDashboardReports,
  getShareDashboardSettings,
  getShareOverview,
  getShareOverviewById,
  getShareOverviewSettings,
  getShareReport,
  getShareReportById,
  getShareReportByReportId,
  getShareReportSettings,
  validateOverviewShareAccess,
  validateReportAccess,
  validateShareAccess,
} from './modules/share/share.service';
// Moved from packages/trpc/src/routers/subscription.ts, plus the Polar
// webhook business logic out of
// apps/api/src/controllers/webhook.controller.ts (M6-006, ADR-008's module
// map: subscription owns "S"+"C") — packages/trpc's subscription router and
// apps/api's webhook controller call these directly, the same way V1 reaches
// every other dissolved service here.
export {
  applySaveDiscount,
  cancelSubscription,
  checkout,
  getCurrentSubscriptionProduct,
  getUsage,
  handlePolarWebhookEvent,
  listProducts,
  pauseSubscription,
  portal,
  resumeSubscription,
  toSubscriptionDiscount,
} from './modules/subscription/subscription.service';
// Dissolved from @openpanel/db's services/user.service.ts (M6-001) —
// packages/trpc's auth/onboarding routers call `getUserById`/
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
// Moved from apps/worker/src/jobs/lib/email-sequence.ts (M6-003) — shared by
// the onboarding module and, until it moves too, apps/worker's own
// cron.wind-down.ts, which reaches it through this barrel (same shape as
// every other still-live V1 consumer here).
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
