import * as HyperDX from '@hyperdx/node-opentelemetry';
import pino, { type Logger } from 'pino';

export type ILogger = Logger;

const logLevel = process.env.LOG_LEVEL ?? 'info';
const silent = process.env.LOG_SILENT === 'true';

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

  const useHyperDX = !!process.env.HYPERDX_API_KEY;
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
    mixin: useHyperDX ? HyperDX.getPinoMixinFunction : undefined,
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
