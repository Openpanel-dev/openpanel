// The classification is the whole point of the type, so the boundaries (429
// retryable, 4xx not, no status at all) are pinned here rather than re-derived
// by every handler that reads the flag.

import { describe, expect, it } from 'bun:test';
import {
  callProvider,
  isProviderError,
  isRetryableStatus,
  ProviderError,
  providerErrorFrom,
  providerStatusOf,
} from './provider-error';

describe('isRetryableStatus', () => {
  it('treats 429 and 5xx as retryable', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('treats every other 4xx as permanent', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });
});

describe('ProviderError', () => {
  it('classifies from the status it was given', () => {
    expect(new ProviderError('slack', 'x', { status: 429 }).retryable).toBe(
      true
    );
    expect(new ProviderError('slack', 'x', { status: 403 }).retryable).toBe(
      false
    );
  });

  it('is retryable with no status — nothing was refused', () => {
    expect(new ProviderError('gcs', 'connect ETIMEDOUT').retryable).toBe(true);
  });

  it('lets an explicit flag override the status classification', () => {
    const error = new ProviderError('gcs', 'bad key', {
      status: 500,
      retryable: false,
    });
    expect(error.retryable).toBe(false);
  });

  it('keeps provider, status and cause for the handler that logs it', () => {
    const cause = new Error('underlying');
    const error = new ProviderError('s3', 'upload failed', {
      status: 503,
      cause,
    });
    expect(error.provider).toBe('s3');
    expect(error.status).toBe(503);
    expect(error.cause).toBe(cause);
    expect(isProviderError(error)).toBe(true);
    expect(isProviderError(cause)).toBe(false);
  });
});

describe('providerStatusOf', () => {
  it('reads the AWS SDK shape', () => {
    expect(providerStatusOf({ $metadata: { httpStatusCode: 403 } })).toBe(403);
  });

  it('reads the Google SDK / fetch-wrapper shapes', () => {
    expect(providerStatusOf({ code: 404 })).toBe(404);
    expect(providerStatusOf({ status: 429 })).toBe(429);
    expect(providerStatusOf({ statusCode: 500 })).toBe(500);
  });

  it('ignores a non-numeric code', () => {
    expect(providerStatusOf({ code: 'ECONNREFUSED' })).toBeUndefined();
    expect(providerStatusOf(new Error('nope'))).toBeUndefined();
  });
});

describe('providerErrorFrom', () => {
  it('classifies an SDK error by its status', () => {
    const wrapped = providerErrorFrom('s3', {
      $metadata: { httpStatusCode: 404 },
      message: 'NoSuchBucket',
    });
    expect(wrapped.retryable).toBe(false);
    expect(wrapped.status).toBe(404);
  });

  it('passes an already-classified error through unchanged', () => {
    const original = new ProviderError('slack', 'x', {
      status: 500,
      retryable: false,
    });
    expect(providerErrorFrom('slack', original)).toBe(original);
  });
});

describe('callProvider', () => {
  it('returns the value when the call succeeds', async () => {
    await expect(callProvider('openai', async () => 'ok')).resolves.toBe('ok');
  });

  it('classifies whatever the call threw', async () => {
    const thrown = await callProvider('openai', () =>
      Promise.reject({ status: 429, message: 'rate limited' })
    ).catch((error: unknown) => error);

    expect(isProviderError(thrown)).toBe(true);
    expect((thrown as ProviderError).retryable).toBe(true);
    expect((thrown as ProviderError).provider).toBe('openai');
  });
});
