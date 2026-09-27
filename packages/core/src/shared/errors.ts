// Ported from apps/api/src/utils/errors.ts. Transport-agnostic: HTTP, jobs
// and the Kafka consumer all throw and normalize through this, not through
// an rpc/-specific error type (see rpc/errors.ts for the TRPCError family).

import { classifyDriverError } from './driver-errors';

const DEFAULT_HTTP_STATUS = 500;

export class LogError extends Error {
  public readonly payload?: Record<string, unknown>;

  constructor(
    message: string,
    payload?: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'LogError';
    this.payload = payload;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class HttpError extends Error {
  public readonly status: number;
  public readonly fingerprint?: string;
  public readonly extra?: Record<string, unknown>;
  public readonly error?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      fingerprint?: string;
      extra?: Record<string, unknown>;
      error?: unknown;
    }
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = options?.status ?? DEFAULT_HTTP_STATUS;
    this.fingerprint = options?.fingerprint;
    this.extra = options?.extra;
    this.error = options?.error;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface NormalizedError {
  status: number;
  code: string | undefined;
  message: string;
  errorName: string;
}

export function normalizeError(error: unknown): NormalizedError {
  // A driver failure the CALLER caused answers with its own status and a
  // message that is not the driver's — Prisma's invocation text and
  // ClickHouse's scope clause are not the caller's business (ISSUES.md H12).
  const driverFailure = classifyDriverError(error);
  if (driverFailure) {
    return {
      status: driverFailure.status,
      code: undefined,
      message: driverFailure.message,
      errorName: 'Error',
    };
  }

  if (error instanceof Error) {
    const meta = error as Error & {
      statusCode?: unknown;
      status?: unknown;
      code?: unknown;
    };
    const status =
      typeof meta.statusCode === 'number'
        ? meta.statusCode
        : typeof meta.status === 'number'
          ? meta.status
          : DEFAULT_HTTP_STATUS;
    return {
      status,
      code: typeof meta.code === 'string' ? meta.code : undefined,
      message: error.message || 'Internal server error',
      errorName: error.name || 'Error',
    };
  }

  // Plain object thrown (e.g. `throw { statusCode: 400, message: '...' }`).
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    return {
      status:
        typeof e.statusCode === 'number' ? e.statusCode : DEFAULT_HTTP_STATUS,
      code: typeof e.code === 'string' ? e.code : undefined,
      message:
        typeof e.message === 'string' ? e.message : 'Internal server error',
      errorName: typeof e.name === 'string' ? e.name : 'Error',
    };
  }

  if (typeof error === 'string') {
    return {
      status: DEFAULT_HTTP_STATUS,
      code: undefined,
      message: error,
      errorName: 'Error',
    };
  }

  // null, undefined, number, boolean, symbol, bigint
  return {
    status: DEFAULT_HTTP_STATUS,
    code: undefined,
    message: 'Internal server error',
    errorName: 'Error',
  };
}
