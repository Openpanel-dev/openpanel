import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';

interface RecordOptions {
  checkoutEveryNms?: number;
}

let recordOptions: RecordOptions = {};

mock.module('rrweb', () => ({
  record: (options: RecordOptions) => {
    recordOptions = options;
    return () => undefined;
  },
}));

const { startReplayRecorder, stopReplayRecorder } = await import('./recorder');

const FIVE_MINUTES_MS = 5 * 60 * 1000;

let dom: JSDOM;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
  });
  recordOptions = {};
});

afterEach(() => {
  stopReplayRecorder();
  dom.window.close();
});

describe('full snapshot interval', () => {
  test('defaults to five minutes, whatever the flush interval', () => {
    startReplayRecorder({ flushIntervalMs: 5000 }, () => undefined);

    expect(recordOptions.checkoutEveryNms).toBe(FIVE_MINUTES_MS);
  });

  test('can be set on its own', () => {
    startReplayRecorder({ fullSnapshotIntervalMs: 60_000 }, () => undefined);

    expect(recordOptions.checkoutEveryNms).toBe(60_000);
  });
});
