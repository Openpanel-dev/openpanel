import type { Buffers } from './buffers/create-buffers';
import { bindReadsToSignal } from './ch-abortable';
import type { CoreConfig } from './config';
import type { QueueProducerHandle, QueueProducers } from './jobs.registry';
import type { Logger } from './logger';
import type { SessionValidationResult } from './modules/auth/src/login-session';
import { createServices, type Services } from './services';
import type { CookieJar, CookieOptions } from './shared/cookie';

// Type queries over the modules that construct the clients, so the aliases
// cannot drift from what `main.ts` passes. Type-only: core imports no database
// at runtime and `bun test` runs offline.
export type Db = typeof import('@openpanel/db/src/prisma-client').db;
export type ClickHouseClient =
  typeof import('@openpanel/db/src/clickhouse/client').ch;
export type RedisClient = ReturnType<
  typeof import('@openpanel/redis').getRedisCache
>;
export type ServiceClients = import('./clients/create-clients').ServiceClients;

// `unscopedDb` and the Prisma namespace are lazy so importing core constructs no
// database. Neither memoizes: the module registry already caches the import, and
// a second memo once handed one suite's mocked Prisma client to later files.

export type PrismaNamespace =
  typeof import('@openpanel/db/src/prisma-client').Prisma;

/**
 * Prisma's JSON sentinels (`DbNull`, `JsonNull`) that write an explicit SQL NULL
 * or JSON `null` onto a nullable `Json?` column. The scope carries just these
 * two instead of the `Prisma` namespace, a very large type for every
 * consumer's `tsc` to walk.
 */
export interface PrismaSentinels {
  DbNull: PrismaNamespace['DbNull'];
  JsonNull: PrismaNamespace['JsonNull'];
}

/**
 * The process's Postgres client, for the one path that cannot be handed a
 * scope: `shared/access-lookups.ts`, whose lookups are `cacheable` on their
 * arguments and so cannot take a leading `deps`. Everything else uses `deps.db`.
 */
export function unscopedDb(): Promise<Db> {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

export type { Buffers } from './buffers/create-buffers';

export type Session = SessionValidationResult;

export type { CoreConfig } from './config';

/** Boot scope. Built once at startup, closed once in shutdown. */
export interface AppDeps {
  db: Db;
  prisma: PrismaSentinels;
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
  prisma: PrismaSentinels;
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

/** What HTTP and tRPC add. */
export interface HttpCtx extends Ctx {
  headers: Headers;
  ip: string;
  cookies: CookieJar;
  /** Memoized: two guards and a handler asking cost one lookup. */
  session: () => Promise<Session | null>;
  setCookie(name: string, value: string, options?: CookieOptions): void;
  /**
   * Aborting it stops this request's ClickHouse reads: on client disconnect or,
   * for a transport with a deadline, when it passes. Set only on GET/HEAD.
   */
  cancellation?: AbortController;
}

/** What a job run adds. */
export interface JobCtx extends Ctx {
  job: { id: string; attempt: number; queue: string; name: string };
}

export interface ScopeMeta {
  requestId: string;
  /** Already child()-bound by the caller — createCtx does not bind it. */
  logger: Logger;
  /** When it aborts, the scope's ClickHouse reads stop (`bindReadsToSignal`). */
  signal?: AbortSignal;
}

/** The single builder: anything every handler needs is added here once. */
export function createCtx(deps: AppDeps, scope: ScopeMeta): Ctx {
  const ctx: Ctx = {
    db: deps.db,
    prisma: deps.prisma,
    ch: scope.signal ? bindReadsToSignal(deps.ch, scope.signal) : deps.ch,
    redis: deps.redis,
    clients: deps.clients,
    buffers: deps.buffers,
    logger: scope.logger,
    queues: deps.producers.scope({ requestId: scope.requestId }),
    config: deps.config,
    requestId: scope.requestId,
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
        prisma: ctx.prisma,
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
    enumerable: true,
    configurable: true,
  });
}
