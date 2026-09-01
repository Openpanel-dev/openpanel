// One boot scope, one work scope, one builder. HTTP routes, tRPC procedures,
// job handlers and the Kafka consumer all extend the same `Ctx`, so a service
// written once works under every transport and the requestId minted at the
// edge reaches the query, the enqueue and the job that enqueue causes
// (ADR-007 decision 18, ADR-018 R1).

import type { QueueProducerHandle, QueueProducers } from './jobs.registry';
import type { Logger } from './logger';
import { createServices, type Services } from './services';
import type { CookieJar, CookieOptions } from './shared/cookie';

// Handles core does not own yet. Each real type arrives with the phase that
// builds it (db/ch/redis P3, clients P4, buffers P8); they are named now so
// AppDeps and Ctx are written once in their final shape and replacing an alias
// moves no field. `unknown` is deliberate — reading one before its type lands
// is a compile error rather than a silent `any`.
export type Db = unknown;
export type ClickHouseClient = unknown;
export type RedisClient = unknown;
export type ServiceClients = unknown;
export type Buffers = unknown;

// The resolved session (P6 auth). `CookieJar` is already real — it lives in
// shared/cookie.ts, wrapped over Elysia's primitive by http/context.ts.
export type Session = unknown;

/** The env-derived flags core needs. apps/api's config/env.ts is the sole
 *  reader of process.env; core reads none. */
export interface RuntimeFlags {
  selfHosted: boolean;
}

/** Boot scope. Built once in apps/api's main.ts, closed once in shutdown. */
export interface AppDeps {
  db: Db;
  ch: ClickHouseClient;
  redis: RedisClient;
  clients: ServiceClients;
  buffers: Buffers;
  producers: QueueProducerHandle;
  logger: Logger;
  config: RuntimeFlags;
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
      });
      return built;
    },
    // Enumerable so a transport that copies a Ctx keeps the field at all;
    // configurable so one may reinstall it.
    enumerable: true,
    configurable: true,
  });
}
