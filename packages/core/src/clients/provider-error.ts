// A client classifies once, where it still holds the provider's status code. A
// retryable failure is rethrown so the queue retries; a permanent refusal is
// logged and swallowed, because a retry cannot change it.

/** Too Many Requests. */
export const RATE_LIMITED_STATUS = 429;

/** The first status in the "provider is broken, not the request" range. */
const SERVER_ERROR_STATUS_FLOOR = 500;

/**
 * 429 and 5xx are worth another attempt; every other 4xx is the provider
 * refusing THIS request and will refuse it identically next time.
 */
export function isRetryableStatus(status: number): boolean {
  return status === RATE_LIMITED_STATUS || status >= SERVER_ERROR_STATUS_FLOOR;
}

export interface ProviderErrorOptions {
  status?: number;
  /**
   * Overrides the status classification, for failures that never reached the
   * provider (DNS, connect, TLS, timeout) where another attempt can succeed.
   */
  retryable?: boolean;
  cause?: unknown;
}

/** A third party refused or failed a call. `provider` names the transport ('slack', 'gcs', 'openai'). */
export class ProviderError extends Error {
  readonly provider: string;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(
    provider: string,
    message: string,
    options: ProviderErrorOptions = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = options.status;
    this.retryable =
      options.retryable ??
      (options.status === undefined ? true : isRetryableStatus(options.status));
  }
}

export function isProviderError(value: unknown): value is ProviderError {
  return value instanceof ProviderError;
}

/**
 * Every SDK reports its HTTP status somewhere different: the AWS SDK under
 * `$metadata.httpStatusCode`, the Google SDK and most fetch wrappers as
 * `code`/`status`/`statusCode`.
 */
export function providerStatusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const values = [
    candidate.$metadata?.httpStatusCode,
    candidate.status,
    candidate.statusCode,
    candidate.code,
  ];
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

/** Wrap whatever an SDK threw. A `ProviderError` passes through: it was already classified where the provider's own answer was available. */
export function providerErrorFrom(
  provider: string,
  error: unknown,
  message?: string
): ProviderError {
  if (isProviderError(error)) {
    return error;
  }
  const status = providerStatusOf(error);
  const detail =
    message ?? (error instanceof Error ? error.message : String(error));
  return new ProviderError(provider, detail, { status, cause: error });
}

/** Run one outbound call and classify whatever it throws. */
export async function callProvider<T>(
  provider: string,
  call: () => Promise<T>
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw providerErrorFrom(provider, error);
  }
}
