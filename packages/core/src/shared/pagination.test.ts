import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  offsetFromPage,
} from './pagination';

describe('offsetFromPage', () => {
  test('page 0 or undefined is offset 0', () => {
    expect(offsetFromPage(0)).toBe(0);
    expect(offsetFromPage(undefined)).toBe(0);
  });

  test('multiplies by the default page size', () => {
    expect(offsetFromPage(2)).toBe(2 * DEFAULT_PAGE_SIZE);
  });

  test('honours a custom page size', () => {
    expect(offsetFromPage(3, 10)).toBe(30);
  });
});

interface KeysetCursor {
  createdAt: string;
  id: string;
}

function isKeysetCursor(value: unknown): value is KeysetCursor {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as KeysetCursor).createdAt === 'string' &&
    typeof (value as KeysetCursor).id === 'string'
  );
}

describe('encodeCursor / decodeCursor', () => {
  test('round-trips a cursor', () => {
    const cursor: KeysetCursor = {
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'evt_1',
    };
    expect(decodeCursor(encodeCursor(cursor), isKeysetCursor)).toEqual(cursor);
  });

  test('is URL-safe', () => {
    const encoded = encodeCursor({ createdAt: 'x'.repeat(50), id: 'evt_1' });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  test('fails closed on a garbled cursor instead of throwing', () => {
    expect(decodeCursor('not-base64-json', isKeysetCursor)).toBeNull();
  });

  test('fails closed on a well-formed but wrong-shaped cursor', () => {
    const encoded = encodeCursor({ other: 'shape' });
    expect(decodeCursor(encoded, isKeysetCursor)).toBeNull();
  });
});
