// Stubs shared by the rpc tests. Not a test file (no `*.test.ts` suffix), so
// the runner does not pick it up.

import {
  type AppDeps,
  type Buffers,
  createCtx,
  extendCtx,
  type HttpCtx,
  type Session,
} from '../src/context';
import { createRecordingProducers } from '../src/jobs/testing';
import { queues } from '../src/jobs.registry';
import type { LogFn, Logger } from '../src/logger';
import type { Services } from '../src/services';

export interface LoggedLine {
  level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  payload: unknown;
  message: unknown;
}

export interface CapturedLogger extends Logger {
  lines: LoggedLine[];
}

/** A logger that records instead of writing, so a branch is assertable. */
export function capturingLogger(lines: LoggedLine[] = []): CapturedLogger {
  const at =
    (level: LoggedLine['level']): LogFn =>
    (payload: unknown, message?: unknown) => {
      lines.push({ level, payload, message });
    };

  const logger: CapturedLogger = {
    lines,
    fatal: at('fatal'),
    error: at('error'),
    warn: at('warn'),
    info: at('info'),
    debug: at('debug'),
    trace: at('trace'),
    child: () => logger,
  };
  return logger;
}

export const TEST_REQUEST_ID = 'req_abcdefghijklmnopqrstu';

const TEST_EPOCH = new Date('2026-09-03T00:00:00.000Z');

/** A real `SessionValidationResult`, so an assertion on `ctx.session` types. */
export const TEST_SESSION: Session = {
  session: {
    id: 'sess_1',
    userId: 'user_1',
    createdAt: TEST_EPOCH,
    updatedAt: TEST_EPOCH,
    expiresAt: TEST_EPOCH,
  },
  user: {
    id: 'user_1',
    email: 'carl@openpanel.dev',
    firstName: null,
    lastName: null,
    createdAt: TEST_EPOCH,
    updatedAt: TEST_EPOCH,
    deletedAt: null,
  },
  userId: 'user_1',
};

export interface HttpCtxStub {
  ctx: HttpCtx;
  logger: CapturedLogger;
  /** Cookies written through the *unwrapped* HttpCtx.setCookie, if any. */
  cookies: { name: string; value: string; options: unknown }[];
  sessionCalls: number;
}

export function stubHttpCtx(
  overrides: Partial<HttpCtx> & { logger?: CapturedLogger } = {},
  session: unknown = TEST_SESSION
): HttpCtxStub {
  const logger = overrides.logger ?? capturingLogger();
  const cookies: HttpCtxStub['cookies'] = [];
  const stub = { sessionCalls: 0 };

  const deps: AppDeps = {
    db: {} as AppDeps['db'],
    ch: {} as AppDeps['ch'],
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
    producers: createRecordingProducers(queues),
    logger,
    config: { selfHosted: false },
  };

  const { services, ...rest } = overrides;
  const ctx = extendCtx(
    createCtx(deps, { requestId: TEST_REQUEST_ID, logger }),
    {
      headers: new Headers(),
      ip: '',
      cookies: { get: () => undefined },
      session: () => {
        stub.sessionCalls++;
        return Promise.resolve(session as Session | null);
      },
      setCookie: (name: string, value: string, options?: unknown) => {
        cookies.push({ name, value, options });
      },
      ...rest,
    }
  );
  // `services` is a getter with no setter on the prototype, so assigning it
  // through extendCtx's Object.assign throws. Shadow it instead.
  if (services) {
    Object.defineProperty(ctx, 'services', {
      value: services,
      enumerable: true,
    });
  }

  return {
    ctx,
    logger,
    cookies,
    get sessionCalls() {
      return stub.sessionCalls;
    },
  };
}

/**
 * `services` with the permission ladder already granted.
 *
 * `protectedProcedure` runs `enforceAccess` BEFORE the input parser
 * (M11-001), so a test that wants to assert on a zod rejection has to get
 * past the ladder first — and the real one reaches Postgres. Everything a
 * procedure does after the parser is out of these tests' scope, so only the
 * two lookups `enforceAccess` makes are stubbed.
 */
export function servicesWithProjectAccess(): Services {
  return {
    auth: {
      requireProjectAccess: () => Promise.resolve({ level: 'write' }),
      getOrganizationAccess: () => Promise.resolve({ role: 'org:admin' }),
    },
  } as unknown as Services;
}
