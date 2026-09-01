// Structural interface only. pino satisfies this shape once it is
// instantiated in apps/api (ADR-007 layout: "pino instantiated later in
// apps/api") — nothing here imports pino, so shared/ and modules/ can depend
// on the shape of a logger without pulling the implementation into core.

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

// ADR-018 R1: one identifier, one name, one constant — the field is
// `requestId` everywhere (JobMeta.requestId, every log line, Ctx), replacing
// V1's `reqId`. Exported here to kill the four-file literal coupling.
export const REQUEST_ID_LOG_FIELD = 'requestId' as const;

// The wire header stays `request-id` byte-for-byte — it is caller-visible
// and NON_GOALS forbids changing endpoint contracts, even though the log
// field it feeds is renamed.
export const REQUEST_ID_HEADER = 'request-id' as const;
