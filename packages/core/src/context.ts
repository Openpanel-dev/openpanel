// One boot scope, one work scope, one builder. HTTP routes, tRPC procedures,
// job handlers and the Kafka consumer all extend the same `Ctx`, so a service
// written once works under every transport and the requestId minted at the
// edge reaches the query, the enqueue and the job that enqueue causes
// (ADR-007 decision 18, ADR-018 R1).

import type { Buffers } from './buffers/create-buffers';
import type { CoreConfig } from './config';
import type { QueueProducerHandle, QueueProducers } from './jobs.registry';
import type { Logger } from './logger';
import type { SessionValidationResult } from './modules/auth/src/login-session';
import { createServices, type Services } from './services';
import type { CookieJar, CookieOptions } from './shared/cookie';

// The four boot handles, landed at M9-004 when main.ts became the only
// entrypoint and had to build a real `AppDeps` for the mounted route
// surfaces. Each is a TYPE QUERY over the module that constructs the client,
// so the alias cannot drift from what `main.ts` actually passes; all four are
// type-only, so core still imports no database at runtime and `bun test`
// still runs offline.
export type Db = typeof import('@openpanel/db/src/prisma-client').db;
export type ClickHouseClient =
  typeof import('@openpanel/db/src/clickhouse/client').ch;
export type RedisClient = ReturnType<
  typeof import('@openpanel/redis').getRedisCache
>;
export type ServiceClients = import('./clients/create-clients').ServiceClients;

// The two `@openpanel/db` VALUES core cannot reach through a scope, and the
// one file allowed to name them: `core-uses-ctx-not-db-internals` exempts
// this module by path, and it is already where core declares its handles.
// Both are LAZY, so importing core still constructs no database and
// `bun test` still runs offline, and neither memoizes its result — the module
// registry already caches the import, and a second memo is exactly what let
// the deleted compat seam hand one suite's mocked Prisma client to every
// later file in the process.

export type PrismaNamespace =
  typeof import('@openpanel/db/src/prisma-client').Prisma;

/**
 * Prisma's JSON sentinels (`DbNull`, `JsonNull`): frozen constants that write
 * an explicit SQL NULL — or a JSON `null` — onto a nullable `Json?` column.
 * They are values on the namespace, not a client, so nothing about them is
 * per-request and `ServiceDeps` carries no field for them.
 */
export function prismaSentinels(): Promise<PrismaNamespace> {
  return import('@openpanel/db/src/prisma-client').then((m) => m.Prisma);
}

/**
 * The process's Postgres client, for the one path that cannot be handed a
 * scope: `shared/access-lookups.ts`. Its lookups are `cacheable` on their
 * ARGUMENTS, so they cannot take a leading `deps`, and their bare signature is
 * pinned by the protected wire contract
 * `verification/contracts/auth/group-b-project-access.mts`, which imports them
 * through `packages/db/src/services/access.service.ts` with no app boot at
 * all. It is the same client `main.ts` puts on `AppDeps.db`. Every other
 * caller in core reaches Postgres as `deps.db`.
 */
export function unscopedDb(): Promise<Db> {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

// Landed at M8-001: built once by `createBuffers(deps)` in main.ts, never a
// module singleton.
export type { Buffers } from './buffers/create-buffers';

// The resolved session. `SessionValidationResult` is Prisma-shaped
// (Session + User) but the import above is type-only, so nothing of
// `@openpanel/db` is loaded at runtime — core stays importable with no
// database, which is what lets `bun test` run offline. It stays defined next
// to the Prisma-touching session CRUD in `./modules/auth/src/login-session.ts`
// (M8-005) rather than here, which is the same file that CRUD lazily reaches
// `@openpanel/db`'s Prisma client from.
export type Session = SessionValidationResult;

// The parsed environment. `apps/api`'s config/env.ts is the sole reader of
// process.env and core reads none (ADR-022 R7, made true at M15-006), so the
// shape of what core needs is declared in `./config.ts` and arrives here.
export type { CoreConfig } from './config';

/** Boot scope. Built once in apps/api's main.ts, closed once in shutdown. */
export interface AppDeps {
  db: Db;
  ch: ClickHouseClient;
  redis: RedisClient;
  clients: ServiceClients;
  buffers: Buffers;
  producers: QueueProducerHandle;
  logger: Logger;
  config: CoreConfig;
}

/** Work scope. One per HTTP request, RPC call, job run or Kafka batch. */
export interface Ctx {
  db: Db;
  ch: ClickHouseClient;
  redis: RedisClient;
  clients: ServiceClients;
  buffers: Buffers;
  logger: Logger;
  queues: QueueProducers;
  config: CoreConfig;
  services: Services;
  requestId: string;
}

/** What HTTP and tRPC add. No req/res in core, from day one. */
export interface HttpCtx extends Ctx {
  headers: Headers;
  ip: string;
  cookies: CookieJar;
  /** Memoized: two guards and a handler asking cost one lookup. */
  session: () => Promise<Session | null>;
  setCookie(name: string, value: string, options?: CookieOptions): void;
}

/** What a job run adds. */
export interface JobCtx extends Ctx {
  job: { id: string; attempt: number; queue: string; name: string };
}

export interface ScopeMeta {
  requestId: string;
  /** Already child()-bound by the caller — createCtx does not bind it. */
  logger: Logger;
}

/**
 * The single builder. When something new must reach every handler it is added
 * here once and all four transports have it.
 */
export function createCtx(deps: AppDeps, scope: ScopeMeta): Ctx {
  const ctx: Ctx = {
    db: deps.db,
    ch: deps.ch,
    redis: deps.redis,
    clients: deps.clients,
    buffers: deps.buffers,
    logger: scope.logger,
    queues: deps.producers.scope({ requestId: scope.requestId }),
    config: deps.config,
    requestId: scope.requestId,
    // Installed as a getter immediately below.
    services: undefined as unknown as Services,
  };

  installLazyServices(ctx);
  return ctx;
}

/**
 * Extend a Ctx into an HttpCtx or a JobCtx. Never spread one: `{ ...ctx }`
 * reads `services`, which forces the build the hot path exists to avoid.
 */
export function extendCtx<Extras extends object>(
  ctx: Ctx,
  extras: Extras
): Ctx & Extras {
  return Object.assign(Object.create(ctx) as Ctx, extras);
}

// The services graph is built from the SCOPED ctx, never from deps: a service
// must log to this request's logger and enqueue through this request's
// producers. /track never touches it and pays one defineProperty.
function installLazyServices(ctx: Ctx): void {
  let built: Services | undefined;
  Object.defineProperty(ctx, 'services', {
    get() {
      built ??= createServices({
        db: ctx.db,
        ch: ctx.ch,
        redis: ctx.redis,
        clients: ctx.clients,
        buffers: ctx.buffers,
        logger: ctx.logger,
        queues: ctx.queues,
        config: ctx.config,
      });
      return built;
    },
    // Enumerable so a transport that copies a Ctx keeps the field at all;
    // configurable so one may reinstall it.
    enumerable: true,
    configurable: true,
  });
}
