import * as HyperDX from '@hyperdx/node-opentelemetry';
import pino, { type Logger } from 'pino';

export type ILogger = Logger;

const logLevel = process.env.LOG_LEVEL ?? 'info';
const silent = process.env.LOG_SILENT === 'true';

// Exactly one shipping path at a time (see logging-capture-plan.md):
// - 'otlp': pino ships via the HyperDX transport (requires HYPERDX_API_KEY).
// - 'stdout': pino writes JSON to stdout; an external collector ships it.
const logExporter =
  process.env.LOG_EXPORTER ??
  (process.env.HYPERDX_API_KEY ? 'otlp' : 'stdout');

// Originals captured before interceptProcessOutput wraps the streams. Code
// that must bypass capture (e.g. crash handlers mirroring fatals to stderr)
// uses these so the line isn't re-ingested and shipped twice.
export const rawStdoutWrite = process.stdout.write.bind(process.stdout);
export const rawStderrWrite = process.stderr.write.bind(process.stderr);

// Substring match (lowercased). Catches camelCase, snake_case, prefixed and
// suffixed variants in one entry — e.g. 'token' covers accessToken,
// refresh_token, jwtToken, etc.
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'pwd',
  'token',
  'secret',
  'authorization',
  'apikey',
  'accesskey',
  'privatekey',
  'cookie',
  'bearer',
  'credential',
  'salt',
  'signature',
  'ip',
  'email',
  'firstname',
  'lastname',
  'surname',
];

const MAX_REDACT_DEPTH = 5;

function redactSensitive(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      ...value,
      message: value.message,
      stack: value.stack,
      name: value.name,
    };
  }
  if (
    depth >= MAX_REDACT_DEPTH ||
    value === null ||
    typeof value !== 'object'
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const lowered = key.toLowerCase();
    if (SENSITIVE_KEY_PATTERNS.some((k) => lowered.includes(k))) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSensitive(val, depth + 1);
    }
  }
  return result;
}

export function createLogger({ name }: { name: string }): ILogger {
  const service = [process.env.LOG_PREFIX, name, process.env.NODE_ENV ?? 'dev']
    .filter(Boolean)
    .join('-');

  const useHyperDX = logExporter === 'otlp' && !!process.env.HYPERDX_API_KEY;
  const usePretty = !useHyperDX && process.env.NODE_ENV !== 'production';

  return pino({
    name: service,
    level: logLevel,
    enabled: !silent,
    formatters: {
      log: (obj) => {
        return redactSensitive(obj) as Record<string, unknown>;
      },
    },
    // Keep trace_id/span_id on every line even in stdout mode so trace↔log
    // correlation survives when a collector does the shipping.
    mixin: process.env.HYPERDX_API_KEY
      ? HyperDX.getPinoMixinFunction
      : undefined,
    transport: useHyperDX
      ? HyperDX.getPinoTransport(logLevel, {
          detectResources: true,
          service,
        })
      : usePretty
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname,service',
            },
          }
        : undefined,
  });
}

const MAX_INTERCEPTED_LINE_LENGTH = 8192;

let intercepted = false;

/**
 * Route everything written to process.stdout/stderr through the given pino
 * logger, so output that bypasses our loggers (Prisma engine lines, dependency
 * console.*, Node warnings) still reaches the OTLP pipeline. Call it before
 * anything else runs in the app entry.
 *
 * No feedback loop: pino writes via sonic-boom straight to the file
 * descriptor (and transports write from a worker thread), so pino's own
 * output never passes through these wrappers. A reentrancy guard covers any
 * exotic transport that does.
 *
 * In otlp mode raw lines are also passed through to the original stream so
 * `docker logs` stays useful. In stdout mode pino's JSON line on stdout IS
 * the container output — teeing would print everything twice.
 */
export function interceptProcessOutput(logger: ILogger): void {
  if (intercepted) {
    return;
  }
  // Keep local dev output untouched.
  if (
    process.env.NODE_ENV !== 'production' &&
    !process.env.HYPERDX_API_KEY &&
    process.env.LOG_EXPORTER === undefined
  ) {
    return;
  }
  intercepted = true;

  const passthrough = logExporter !== 'stdout';
  let logging = false;

  const wrap = (
    stream: NodeJS.WriteStream,
    original: typeof rawStdoutWrite,
    emit: (line: string) => void
  ) => {
    let buffer = '';

    const emitLines = (chunk: string) => {
      if (logging) {
        return;
      }
      buffer += chunk;
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trimEnd();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          logging = true;
          try {
            emit(line.slice(0, MAX_INTERCEPTED_LINE_LENGTH));
          } finally {
            logging = false;
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
      if (buffer.length > MAX_INTERCEPTED_LINE_LENGTH) {
        const line = buffer;
        buffer = '';
        logging = true;
        try {
          emit(line.slice(0, MAX_INTERCEPTED_LINE_LENGTH));
        } finally {
          logging = false;
        }
      }
    };

    const write = (
      chunk: Uint8Array | string,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void
    ): boolean => {
      try {
        emitLines(
          typeof chunk === 'string'
            ? chunk
            : Buffer.from(chunk).toString('utf8')
        );
      } catch {
        // Interception must never break the stream.
      }
      if (passthrough) {
        return original(chunk as never, encodingOrCallback as never, callback);
      }
      const cb =
        typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      if (typeof cb === 'function') {
        process.nextTick(cb);
      }
      return true;
    };

    stream.write = write as typeof stream.write;
  };

  wrap(process.stdout, rawStdoutWrite, (line) =>
    logger.info({ source: 'stdout' }, line)
  );
  wrap(process.stderr, rawStderrWrite, (line) =>
    logger.error({ source: 'stderr' }, line)
  );
}
