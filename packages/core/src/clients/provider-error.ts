// The one failure type every outbound client raises.
//
// A client classifies ONCE, at the edge where it still holds the provider's own
// status code; a handler then reads `retryable` instead of re-deriving it from
// a message string. The rule the flag encodes: a retryable failure is rethrown
// so the queue runs the unit of work again, a permanent refusal is logged and
// swallowed, because a retry cannot change it.

/** Too Many Requests — the provider is asking for the same call, later. */
export const RATE_LIMITED_STATUS = 429;

/** The first status in the "the provider is broken, not the request" range. */
const SERVER_ERROR_STATUS_FLOOR = 500;

/**
 * 429 and 5xx are worth another attempt; every other 4xx is the provider
 * refusing THIS request (bad credential, unknown bucket, malformed body) and
 * will refuse it identically next time.
 */
export function isRetryableStatus(status: number): boolean {
  return status === RATE_LIMITED_STATUS || status >= SERVER_ERROR_STATUS_FLOOR;
}

export interface ProviderErrorOptions {
  /** Provider status, when the call got far enough to have one. */
  status?: number;
  /**
   * Overrides the status classification. Only for failures that never reached
   * the provider — DNS, connect, TLS, timeout — where there is no status to
   * read and another attempt genuinely can succeed.
   */
  retryable?: boolean;
  cause?: unknown;
}

/**
 * A third party refused or failed a call. `provider` names the transport
 * ('slack', 'gcs', 'openai') so a log line identifies the hop without the
 * handler knowing which client it called.
 */
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
 * Every SDK we call reports its HTTP status somewhere different: the AWS SDK
 * under `$metadata.httpStatusCode`, the Google SDK and most fetch wrappers as
 * `code`/`status`/`statusCode`. Read all of them here so no client has to.
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

/**
 * Wrap whatever an SDK threw. A `ProviderError` passes through unchanged —
 * it was already classified by the client that raised it, and reclassifying
 * would throw away the one place that had the provider's own answer.
 */
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

/**
 * Run one outbound call and classify whatever it throws. Every `catch`
 * upstream of it can then read `retryable` instead of inspecting an
 * SDK-specific error shape.
 */
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
