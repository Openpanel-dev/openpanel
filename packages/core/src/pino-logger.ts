// Concrete pino implementation. `../logger.ts` is the structural interface
// every module and service codes against; this file is what actually
// instantiates pino, and it is deliberately the only place in core that
// imports it (ADR-007 layout: "pino instantiated in apps/api" — apps/api
// builds its named logger by calling `createLogger` from here rather than
// owning a copy).
//
// Ported from @openpanel/logger, unchanged (dissolved into core — M4-003).

import * as HyperDX from '@hyperdx/node-opentelemetry';
import pino, { type Logger as PinoLogger } from 'pino';
import type { CoreConfig } from './config';
import {
  isSensitiveKey,
  REDACTED,
  sanitizeUrlQuery,
} from './shared/sanitize-url';

export type ILogger = PinoLogger;

// Originals captured before interceptProcessOutput wraps the streams. Code
// that must bypass capture (e.g. crash handlers mirroring fatals to stderr)
// uses these so the line isn't re-ingested and shipped twice.
export const rawStdoutWrite = process.stdout.write.bind(process.stdout);
export const rawStderrWrite = process.stderr.write.bind(process.stderr);

const MAX_REDACT_DEPTH = 5;

export function redactSensitive(value: unknown, depth = 0): unknown {
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
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
    } else if (key.toLowerCase().includes('url') && typeof val === 'string') {
      // Backstop for anything that logs a raw URL: the credentials sit in the
      // query, not the key.
      result[key] = sanitizeUrlQuery(val);
    } else {
      result[key] = redactSensitive(val, depth + 1);
    }
  }
  return result;
}

// Shared by logs and traces so both signals land under the same service
// name in ClickStack (e.g. new-api-production).
export function getServiceName(config: CoreConfig, name: string): string {
  const { serviceNamePrefix, serviceNameEnvironment } = config.logging;
  return [serviceNamePrefix, name, serviceNameEnvironment]
    .filter(Boolean)
    .join('-');
}

// pino-pretty's transport runs in a worker thread that pino locates via
// require.resolve at the CALLING module's location. Under Bun that
// resolution is broken for a transitive dependency (a caller outside
// @openpanel/core, e.g. apps/api/src/main.ts's own `createLogger` call)
// and crashes the process instead of the log line — deterministic on this
// box, not a flake. Node has no such issue, so this only turns pretty
// printing off for the Bun-booted V2 API; every Node-booted process
// (V1 api/worker) is unaffected.
const isBun = !!process.versions.bun;

export function createLogger({
  name,
  config,
}: {
  name: string;
  config: CoreConfig;
}): ILogger {
  const service = getServiceName(config, name);
  const { level, silent, exporter, hyperdxApiKey } = config.logging;

  const useHyperDX = exporter === 'otlp' && !!hyperdxApiKey;
  const usePretty = !(useHyperDX || isBun || config.isProduction);

  return pino({
    name: service,
    level,
    enabled: !silent,
    formatters: {
      log: (obj) => {
        return redactSensitive(obj) as Record<string, unknown>;
      },
    },
    // Keep trace_id/span_id on every line even in stdout mode so trace↔log
    // correlation survives when a collector does the shipping.
    mixin: hyperdxApiKey ? HyperDX.getPinoMixinFunction : undefined,
    transport: useHyperDX
      ? HyperDX.getPinoTransport(level, {
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
export function interceptProcessOutput(
  config: CoreConfig,
  logger: ILogger
): void {
  if (intercepted) {
    return;
  }
  // Keep local dev output untouched.
  if (!config.logging.interceptProcessOutput) {
    return;
  }
  intercepted = true;

  const passthrough = config.logging.exporter !== 'stdout';
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
        typeof encodingOrCallback === 'function'
          ? encodingOrCallback
          : callback;
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
