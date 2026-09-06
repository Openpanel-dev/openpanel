import { describe, expect, test } from 'bun:test';
import { REQUEST_ID_LENGTH } from '../logger';
import { resolveRequestId, sanitizeRequestId } from './request-id';

describe('sanitizeRequestId', () => {
  test('keeps an id a caller can correlate on', () => {
    expect(sanitizeRequestId('adr018-1a2b_3c')).toBe('adr018-1a2b_3c');
  });

  test('strips everything outside [A-Za-z0-9_-]', () => {
    expect(sanitizeRequestId('a b/c\n<script>')).toBe('abcscript');
  });

  test('truncates to 64 characters', () => {
    expect(sanitizeRequestId('x'.repeat(200))).toHaveLength(64);
  });

  test('reports nothing survivable rather than an empty id', () => {
    expect(sanitizeRequestId('!!!')).toBeNull();
    expect(sanitizeRequestId('')).toBeNull();
    expect(sanitizeRequestId(null)).toBeNull();
    expect(sanitizeRequestId(undefined)).toBeNull();
  });
});

describe('resolveRequestId', () => {
  test('honours a supplied id', () => {
    expect(resolveRequestId('adr018-kafka')).toBe('adr018-kafka');
  });

  test('mints one when nothing survivable was supplied', () => {
    expect(resolveRequestId(undefined)).toHaveLength(REQUEST_ID_LENGTH);
    expect(resolveRequestId('!!!')).toHaveLength(REQUEST_ID_LENGTH);
  });
});
