import { describe, expect, test } from 'bun:test';
import { HttpError, LogError, normalizeError } from './errors';

describe('LogError', () => {
  test('carries a payload and keeps its name and prototype chain', () => {
    const error = new LogError('bad state', { projectId: 'p1' });
    expect(error).toBeInstanceOf(LogError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('LogError');
    expect(error.payload).toEqual({ projectId: 'p1' });
  });
});

describe('HttpError', () => {
  test('defaults to a 500 status', () => {
    expect(new HttpError('boom').status).toBe(500);
  });

  test('carries an explicit status, fingerprint, extra and cause', () => {
    const cause = new Error('root cause');
    const error = new HttpError('rate limited', {
      status: 429,
      fingerprint: 'rate-limit',
      extra: { key: 'abc' },
      error: cause,
    });
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(429);
    expect(error.fingerprint).toBe('rate-limit');
    expect(error.extra).toEqual({ key: 'abc' });
    expect(error.error).toBe(cause);
  });
});

describe('normalizeError', () => {
  test('reads statusCode off an Error', () => {
    const error = Object.assign(new Error('nope'), { statusCode: 404 });
    expect(normalizeError(error)).toEqual({
      status: 404,
      code: undefined,
      message: 'nope',
      errorName: 'Error',
    });
  });

  test('prefers statusCode over status when both are present', () => {
    const error = Object.assign(new Error('nope'), {
      statusCode: 404,
      status: 500,
    });
    expect(normalizeError(error).status).toBe(404);
  });

  test('falls back to status when statusCode is absent', () => {
    const error = Object.assign(new Error('nope'), { status: 403 });
    expect(normalizeError(error).status).toBe(403);
  });

  test('normalizes a plain thrown object', () => {
    expect(
      normalizeError({ statusCode: 400, message: 'bad input', code: 'E_BAD' })
    ).toEqual({
      status: 400,
      code: 'E_BAD',
      message: 'bad input',
      errorName: 'Error',
    });
  });

  test('handles a bare string throw', () => {
    expect(normalizeError('oops')).toEqual({
      status: 500,
      code: undefined,
      message: 'oops',
      errorName: 'Error',
    });
  });

  test('handles null, undefined and other non-object throws', () => {
    expect(normalizeError(null).message).toBe('Internal server error');
    expect(normalizeError(undefined).status).toBe(500);
    expect(normalizeError(42).message).toBe('Internal server error');
  });
});
