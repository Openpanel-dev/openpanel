// The curated public surface of @openpanel/core.
//
// Never `export *`. What leaves this package is exactly what is named here
// plus the `*.constants` subpaths in package.json's exports map — see
// AGENTS.md. Everything below is what `apps/api` needs to build `AppDeps`
// once and mount the three route surfaces plus the tRPC router over it; a
// service, a client or a buffer is not reachable from here by design.

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
// (db, importer, integrations, mcp, queue, apps/worker) reaches these the
// same way apps/api and core itself do, until its own module lands.
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
