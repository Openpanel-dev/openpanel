import { createRequire } from 'node:module';
import * as HyperDX from '@hyperdx/node-opentelemetry';
import pino, { type Logger as PinoLogger } from 'pino';
import type { CoreConfig } from './config';
import {
  isSensitiveKey,
  REDACTED,
  sanitizeUrlQuery,
} from './shared/sanitize-url';

export type ILogger = PinoLogger;

// Captured before interceptProcessOutput wraps the streams, so code that must
// bypass capture (crash handlers mirroring fatals) is not re-ingested twice.
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

// Shared by logs and traces so both signals land under one service name.
export function getServiceName(config: CoreConfig, name: string): string {
  const { serviceNamePrefix, serviceNameEnvironment } = config.logging;
  return [serviceNamePrefix, name, serviceNameEnvironment]
    .filter(Boolean)
    .join('-');
}

// pino-pretty's worker-thread transport is located via require.resolve at the
// CALLING module's location, which is broken under Bun for a transitive
// dependency (a caller outside @openpanel/core) and crashes the process.
// Pretty printing is therefore off under Bun.
const isBun = !!process.versions.bun;

const requireFromCore = createRequire(import.meta.url);

/**
 * The HyperDX transport with its target resolved from this package, which
 * depends on HyperDX. Left as a package name, pino resolves it from the caller,
 * and an app that does not install HyperDX itself crashes at boot.
 */
export function hyperdxTransport(
  level: string,
  service: string
): ReturnType<typeof HyperDX.getPinoTransport> {
  const transport = HyperDX.getPinoTransport(level, {
    detectResources: true,
    service,
  });
  return { ...transport, target: requireFromCore.resolve(transport.target) };
}

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
      ? hyperdxTransport(level, service)
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
 * No feedback loop: pino writes straight to the file descriptor, never through
 * these wrappers; a reentrancy guard covers any exotic transport that does.
 *
 * In otlp mode raw lines are also passed to the original stream so `docker
 * logs` stays useful. In stdout mode pino's JSON line IS the container output,
 * so teeing would print everything twice.
 */
export function interceptProcessOutput(
  config: CoreConfig,
  logger: ILogger
): void {
  if (intercepted) {
    return;
  }
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
