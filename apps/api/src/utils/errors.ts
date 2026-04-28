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
  public readonly error?: Error | unknown;
  constructor(
    message: string,
    options?: {
      status?: number;
      fingerprint?: string;
      extra?: Record<string, unknown>;
      error?: Error | unknown;
    }
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = options?.status ?? 500;
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
          : 500;
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
      status: typeof e.statusCode === 'number' ? e.statusCode : 500,
      code: typeof e.code === 'string' ? e.code : undefined,
      message:
        typeof e.message === 'string' ? e.message : 'Internal server error',
      errorName: typeof e.name === 'string' ? e.name : 'Error',
    };
  }

  if (typeof error === 'string') {
    return { status: 500, code: undefined, message: error, errorName: 'Error' };
  }

  // null, undefined, number, boolean, symbol, bigint
  return {
    status: 500,
    code: undefined,
    message: 'Internal server error',
    errorName: 'Error',
  };
}
