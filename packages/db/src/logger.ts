// Self-contained pino instantiation. packages/db is a leaf "stays" package
// (TARGET_ARCHITECTURE §7) and must not reach into @openpanel/core just to
// build a logger — that direction is backwards, since core itself depends on
// db. This is the same implementation @openpanel/core/clients/logger.ts
// carries (both descend from the pre-dissolve @openpanel/logger package,
// M4-003) — duplicated here deliberately rather than shared, because there is
// no home narrower than "the package itself" that both can reach without
// reintroducing the db <-> core cycle this file exists to remove.

import * as HyperDX from '@hyperdx/node-opentelemetry';
import pino, { type Logger as PinoLogger } from 'pino';

export type ILogger = PinoLogger;

const logLevel = process.env.LOG_LEVEL ?? 'info';
const silent = process.env.LOG_SILENT === 'true';

// Exactly one shipping path at a time (see logging-capture-plan.md):
// - 'otlp': pino ships via the HyperDX transport (requires HYPERDX_API_KEY).
// - 'stdout': pino writes JSON to stdout; an external collector ships it.
const logExporter =
  process.env.LOG_EXPORTER ?? (process.env.HYPERDX_API_KEY ? 'otlp' : 'stdout');

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

// Shared by logs and traces so both signals land under the same service
// name in ClickStack (e.g. new-api-production).
function getServiceName(name: string): string {
  return [process.env.LOG_PREFIX, name, process.env.NODE_ENV ?? 'dev']
    .filter(Boolean)
    .join('-');
}

export function createLogger({ name }: { name: string }): ILogger {
  const service = getServiceName(name);

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

export const logger = createLogger({ name: 'db:prisma' });
