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
    db: {},
    ch: {},
    redis: {},
    clients: {},
    buffers: {} as Buffers,
    producers: createRecordingProducers(queues),
    produceIncomingEvent: () => Promise.resolve(),
    logger,
    config: { selfHosted: false },
  };

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
      ...overrides,
    }
  );

  return {
    ctx,
    logger,
    cookies,
    get sessionCalls() {
      return stub.sessionCalls;
    },
  };
}
