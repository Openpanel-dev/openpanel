import { afterEach, describe, expect, it } from 'vitest';
import { BaseImportProvider } from './base-provider';
import type { BaseRawEvent } from './types';

class TestProvider extends BaseImportProvider<BaseRawEvent> {
  provider = 'test';
  version = '1.0.0';

  // biome-ignore lint/correctness/useYield: stub for an abstract member
  async *parseSource(): AsyncGenerator<BaseRawEvent, void, unknown> {
    return;
  }

  transformEvent(): never {
    throw new Error('not used');
  }

  validate(): boolean {
    return true;
  }

  getTotalEventsCount(): Promise<number> {
    return Promise.resolve(-1);
  }

  /** Exposed so the env parsing can be asserted directly. */
  public chunkSizeDays(): number {
    return this.getChunkSizeDays();
  }
}

const ORIGINAL = process.env.IMPORT_CHUNK_SIZE_DAYS;

afterEach(() => {
  if (ORIGINAL === undefined) {
    Reflect.deleteProperty(process.env, 'IMPORT_CHUNK_SIZE_DAYS');
  } else {
    process.env.IMPORT_CHUNK_SIZE_DAYS = ORIGINAL;
  }
});

describe('getChunkSizeDays', () => {
  const provider = new TestProvider();

  it('defaults to one day per request', () => {
    Reflect.deleteProperty(process.env, 'IMPORT_CHUNK_SIZE_DAYS');
    expect(provider.chunkSizeDays()).toBe(1);
  });

  it('honours the env override', () => {
    process.env.IMPORT_CHUNK_SIZE_DAYS = '7';
    expect(provider.chunkSizeDays()).toBe(7);
  });

  it('clamps rather than accepting 0, negatives or absurd ranges', () => {
    process.env.IMPORT_CHUNK_SIZE_DAYS = '0';
    expect(provider.chunkSizeDays()).toBe(1);

    process.env.IMPORT_CHUNK_SIZE_DAYS = '-3';
    expect(provider.chunkSizeDays()).toBe(1);

    process.env.IMPORT_CHUNK_SIZE_DAYS = '365';
    expect(provider.chunkSizeDays()).toBe(31);
  });

  it('falls back to the default on unparseable input', () => {
    process.env.IMPORT_CHUNK_SIZE_DAYS = 'weekly';
    expect(provider.chunkSizeDays()).toBe(1);

    process.env.IMPORT_CHUNK_SIZE_DAYS = '';
    expect(provider.chunkSizeDays()).toBe(1);
  });
});

describe('getDateChunks with a larger chunk size', () => {
  const provider = new TestProvider();

  it('covers the range with no gaps or overlaps', () => {
    const chunks = provider.getDateChunks('2025-01-01', '2025-01-10', {
      chunkSizeDays: 3,
    });

    expect(chunks).toEqual([
      ['2025-01-01', '2025-01-03'],
      ['2025-01-04', '2025-01-06'],
      ['2025-01-07', '2025-01-09'],
      ['2025-01-10', '2025-01-10'],
    ]);
  });

  it('never runs past the requested end date', () => {
    const chunks = provider.getDateChunks('2025-01-01', '2025-01-05', {
      chunkSizeDays: 31,
    });

    expect(chunks).toEqual([['2025-01-01', '2025-01-05']]);
  });

  it('makes far fewer requests for a long range', () => {
    const daily = provider.getDateChunks('2025-01-01', '2025-09-23', {
      chunkSizeDays: 1,
    });
    const weekly = provider.getDateChunks('2025-01-01', '2025-09-23', {
      chunkSizeDays: 7,
    });

    expect(daily.length).toBe(266);
    expect(weekly.length).toBe(38);
    // Same coverage either way.
    expect(daily[0]![0]).toBe(weekly[0]![0]);
    expect(daily.at(-1)![1]).toBe(weekly.at(-1)![1]);
  });
});
