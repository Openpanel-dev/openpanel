import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import type { eventWithTime } from 'rrweb';

type Emit = (event: eventWithTime, isCheckout?: boolean) => void;

let emit: Emit = () => undefined;

mock.module('rrweb', () => ({
  record: (options: { emit: Emit }) => {
    emit = options.emit;
    return () => undefined;
  },
}));

const { startReplayRecorder, stopReplayRecorder } = await import('./recorder');
const { MAX_SINGLE_EVENT_PAYLOAD_LENGTH } = await import('./oversize');

const FULL_SNAPSHOT = 2;
const META = 4;

function fullSnapshotWithImage(base64Length: number): eventWithTime {
  return {
    type: FULL_SNAPSHOT,
    timestamp: 2,
    data: {
      node: {
        type: 2,
        tagName: 'img',
        attributes: {
          src: `data:image/png;base64,${'A'.repeat(base64Length)}`,
        },
      },
    },
  } as unknown as eventWithTime;
}

const meta = { type: META, timestamp: 1, data: {} } as unknown as eventWithTime;

let dom: JSDOM;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
  });
});

afterEach(() => {
  stopReplayRecorder();
  dom.window.close();
});

describe('startReplayRecorder', () => {
  test('sends a full snapshot that is over the chunk cap instead of dropping it', () => {
    const chunks: { is_full_snapshot: boolean; payload: string }[] = [];
    startReplayRecorder({}, (chunk) => chunks.push(chunk));

    emit(meta);
    emit(fullSnapshotWithImage(1_500_000), true);

    const snapshotChunk = chunks.find((chunk) =>
      chunk.payload.includes(`"type":${FULL_SNAPSHOT}`)
    );
    expect(snapshotChunk?.is_full_snapshot).toBe(true);
    expect(JSON.parse(snapshotChunk?.payload ?? '[]')).toHaveLength(1);
  });

  test('replaces the data URIs of a full snapshot over the ingest limit', () => {
    const chunks: { payload: string }[] = [];
    startReplayRecorder({}, (chunk) => chunks.push(chunk));

    emit(fullSnapshotWithImage(MAX_SINGLE_EVENT_PAYLOAD_LENGTH), true);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.payload.length).toBeLessThanOrEqual(
      MAX_SINGLE_EVENT_PAYLOAD_LENGTH
    );
  });
});
