// Stubs shared by the rpc tests. Not a test file (no `*.test.ts` suffix), so
// the runner does not pick it up.

import {
  type AppDeps,
  createCtx,
  extendCtx,
  type HttpCtx,
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

export interface HttpCtxStub {
  ctx: HttpCtx;
  logger: CapturedLogger;
  /** Cookies written through the *unwrapped* HttpCtx.setCookie, if any. */
  cookies: { name: string; value: string; options: unknown }[];
  sessionCalls: number;
}

export function stubHttpCtx(
  overrides: Partial<HttpCtx> & { logger?: CapturedLogger } = {},
  session: unknown = { userId: 'user_1' }
): HttpCtxStub {
  const logger = overrides.logger ?? capturingLogger();
  const cookies: HttpCtxStub['cookies'] = [];
  const stub = { sessionCalls: 0 };

  const deps: AppDeps = {
    db: {},
    ch: {},
    redis: {},
    clients: {},
    buffers: {},
    producers: createRecordingProducers(queues),
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
        return Promise.resolve(session);
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
