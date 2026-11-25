import { describe, expect, test } from 'bun:test';
import {
  fitOversizedEventPayload,
  MAX_SINGLE_EVENT_PAYLOAD_LENGTH,
  PLACEHOLDER_IMAGE_DATA_URI,
  shrinkDataUris,
} from './oversize';

const FULL_SNAPSHOT = 2;

function base64Of(length: number): string {
  return 'A'.repeat(length);
}

function snapshotJson(attributes: Record<string, string>): string {
  return JSON.stringify([
    {
      type: FULL_SNAPSHOT,
      timestamp: 1,
      data: { node: { type: 2, tagName: 'img', attributes } },
    },
  ]);
}

describe('shrinkDataUris', () => {
  test('replaces a large image data URI with the placeholder', () => {
    const json = snapshotJson({
      src: `data:image/png;base64,${base64Of(50_000)}`,
    });

    const parsed = JSON.parse(shrinkDataUris(json));

    expect(parsed[0].data.node.attributes.src).toBe(PLACEHOLDER_IMAGE_DATA_URI);
  });

  test('strips a large non-image data URI', () => {
    const json = snapshotJson({
      _cssText: `@font-face { src: url("data:font/woff2;base64,${base64Of(50_000)}"); }`,
    });

    const parsed = JSON.parse(shrinkDataUris(json));

    expect(parsed[0].data.node.attributes._cssText).toBe(
      '@font-face { src: url(""); }'
    );
  });

  test('keeps the JSON valid when the data URI sits inside an escaped CSS url("...")', () => {
    const json = snapshotJson({
      style: `background: url("data:image/jpeg;charset=utf-8;base64,${base64Of(50_000)}") no-repeat`,
    });

    const parsed = JSON.parse(shrinkDataUris(json));

    expect(parsed[0].data.node.attributes.style).toBe(
      `background: url("${PLACEHOLDER_IMAGE_DATA_URI}") no-repeat`
    );
  });

  test('leaves small data URIs alone', () => {
    const icon = `data:image/png;base64,${base64Of(200)}`;
    const json = snapshotJson({ src: icon });

    expect(shrinkDataUris(json)).toBe(json);
  });
});

describe('fitOversizedEventPayload', () => {
  test('sends an event over the chunk cap but within the ingest limit unchanged', () => {
    const json = snapshotJson({
      src: `data:image/png;base64,${base64Of(1_500_000)}`,
    });

    expect(fitOversizedEventPayload(json)).toBe(json);
  });

  test('shrinks an event over the ingest limit until it fits', () => {
    const json = snapshotJson({
      src: `data:image/png;base64,${base64Of(MAX_SINGLE_EVENT_PAYLOAD_LENGTH)}`,
    });

    const fitted = fitOversizedEventPayload(json);

    expect(fitted).not.toBeNull();
    expect((fitted ?? '').length).toBeLessThanOrEqual(
      MAX_SINGLE_EVENT_PAYLOAD_LENGTH
    );
    expect(JSON.parse(fitted ?? '')[0].type).toBe(FULL_SNAPSHOT);
  });

  test('gives up when the event is too large without any data URIs', () => {
    const json = snapshotJson({
      title: 'x'.repeat(MAX_SINGLE_EVENT_PAYLOAD_LENGTH),
    });

    expect(fitOversizedEventPayload(json)).toBeNull();
  });
});
