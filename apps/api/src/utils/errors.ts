export class LogError extends Error {
  public readonly payload?: Record<string, unknown>;

  constructor(
    message: string,
    payload?: Record<string, unknown>,
    options?: ErrorOptions,
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
    },
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
