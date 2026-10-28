import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { TRACK_BATCH_MAX_EVENTS, zTrackRequestBody } from './ingest.constants';

const event = (name: string) => ({ type: 'track', payload: { name } });
const batch = (payload: unknown[]) => ({ type: 'batch', payload });

describe('zTrackRequestBody', () => {
  it('still takes a single payload as it is', () => {
    expect(zTrackRequestBody.safeParse(event('page_view')).success).toBe(true);
    expect(zTrackRequestBody.safeParse(event('')).success).toBe(false);
  });

  it('takes a batch of 1 up to the limit, and no more', () => {
    const full = Array.from({ length: TRACK_BATCH_MAX_EVENTS }, (_, index) =>
      event(`event_${index}`)
    );
    expect(TRACK_BATCH_MAX_EVENTS).toBe(250);
    expect(zTrackRequestBody.safeParse(batch(full)).success).toBe(true);
    expect(zTrackRequestBody.safeParse(batch(full.slice(0, 1))).success).toBe(
      true
    );
    expect(
      zTrackRequestBody.safeParse(batch([...full, event('one_too_many')]))
        .success
    ).toBe(false);
    expect(zTrackRequestBody.safeParse(batch([])).success).toBe(false);
    expect(
      zTrackRequestBody.safeParse({ type: 'batch', payload: event('x') })
        .success
    ).toBe(false);
  });

  // Items are validated one by one when the batch is ingested, so a bad item
  // (or a nested batch) does not reject the envelope.
  it('leaves item validation to ingestion', () => {
    expect(
      zTrackRequestBody.safeParse(
        batch([event('page_view'), event(''), batch([event('nested')])])
      ).success
    ).toBe(true);
  });

  it('still documents every item type in the OpenAPI schema', () => {
    const schema = z.toJSONSchema(zTrackRequestBody) as unknown as {
      oneOf: {
        title?: string;
        properties: { payload: { items?: { oneOf?: { title?: string }[] } } };
      }[];
    };
    const batchSchema = schema.oneOf.find((option) => option.title === 'Batch');

    expect(
      batchSchema?.properties.payload.items?.oneOf?.map(
        (option) => option.title
      )
    ).toEqual([
      'Track',
      'Identify',
      'Increment',
      'Decrement',
      'Alias',
      'Replay',
      'Group',
      'Assign Group',
    ]);
  });
});
