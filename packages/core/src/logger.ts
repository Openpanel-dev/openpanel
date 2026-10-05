// Structural interface only: nothing here imports pino, so shared/ and modules/
// depend on the shape without pulling in the implementation.

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogFn {
  (msg: string, ...args: unknown[]): void;
  (obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
}

export interface Logger {
  fatal: LogFn;
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
  child(bindings: Record<string, unknown>): Logger;
}

// The log field is `requestId` everywhere (JobMeta.requestId, every log line, Ctx).
export const REQUEST_ID_LOG_FIELD = 'requestId' as const;

// 126 bits of nanoid. A correlation id, not a secret, and the hot path pays for
// it 5000x/s, hence `nanoid/non-secure` behind generateId.
export const REQUEST_ID_LENGTH = 21;

// The wire header stays `request-id`: it is caller-visible, unlike the log field.
export const REQUEST_ID_HEADER = 'request-id' as const;
