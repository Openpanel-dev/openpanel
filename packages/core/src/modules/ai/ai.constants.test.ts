import { describe, expect, test } from 'bun:test';
import { zAiPayload } from './ai.constants';

describe('zAiPayload', () => {
  test('a span may name the trace or another span as parent', () => {
    for (const parentId of ['trace-1', 'span-0', undefined]) {
      expect(
        zAiPayload.safeParse({
          kind: 'span',
          traceId: 'trace-1',
          spanId: 'span-1',
          parentId,
        }).success
      ).toBe(true);
    }
  });

  test('a span may not be its own parent', () => {
    const result = zAiPayload.safeParse({
      kind: 'span',
      traceId: 'trace-1',
      spanId: 'span-1',
      parentId: 'span-1',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['parentId']);
  });
});
