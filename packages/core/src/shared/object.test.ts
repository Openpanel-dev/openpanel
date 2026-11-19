// Tests @openpanel/shared's object helpers from here because the root `test` script
// does not run packages/shared.
import { describe, expect, it } from 'bun:test';
import {
  TO_DOTS_MAX_KEYS,
  TO_DOTS_MAX_KEYS_PER_OBJECT,
  toDots,
  toObject,
} from '@openpanel/shared';

describe('toDots', () => {
  it('should convert an object to a dot object', () => {
    const obj = {
      a: 1,
      b: 2,
      array: ['1', '2', '3'],
      arrayWithObjects: [{ a: 1 }, { b: 2 }, { c: 3 }],
      objectWithArrays: { a: [1, 2, 3] },
      null: null,
      undefined,
      empty: '',
      jsonString: '{"a": 1, "b": 2}',
    };
    expect(toDots(obj)).toEqual({
      a: '1',
      b: '2',
      'array.0': '1',
      'array.1': '2',
      'array.2': '3',
      'arrayWithObjects.0.a': '1',
      'arrayWithObjects.1.b': '2',
      'arrayWithObjects.2.c': '3',
      'objectWithArrays.a.0': '1',
      'objectWithArrays.a.1': '2',
      'objectWithArrays.a.2': '3',
      'jsonString.a': '1',
      'jsonString.b': '2',
    });
  });

  it('should handle malformed JSON strings gracefully', () => {
    const obj = {
      validJson: '{"key":"value"}',
      malformedJson: '{"key":"unterminated string',
      startsWithBrace: '{not json at all',
      startsWithBracket: '[also not json',
      regularString: 'normal string',
    };

    expect(toDots(obj)).toEqual({
      'validJson.key': 'value',
      regularString: 'normal string',
    });
  });

  it('decodes a JSON-serialised Node Buffer instead of flattening its bytes', () => {
    const body = JSON.stringify({ signedPayload: 'abc' });
    const data = Array.from(new TextEncoder().encode(body));
    expect(toDots({ requestBody: { type: 'Buffer', data } })).toEqual({
      'requestBody.signedPayload': 'abc',
    });
  });

  it('keeps every root property up to the total cap', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < TO_DOTS_MAX_KEYS_PER_OBJECT * 2; i++) {
      wide[`k${i}`] = i;
    }
    expect(Object.keys(toDots(wide))).toHaveLength(
      TO_DOTS_MAX_KEYS_PER_OBJECT * 2
    );
  });

  it('caps a wide root object at the total cap', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < TO_DOTS_MAX_KEYS * 2; i++) {
      wide[`k${i}`] = i;
    }
    const result = toDots(wide);
    expect(Object.keys(result)).toHaveLength(TO_DOTS_MAX_KEYS);
    expect(result.k0).toBe('0');
    expect(result[`k${TO_DOTS_MAX_KEYS}`]).toBeUndefined();
  });

  it('applies the per-object limit to nested objects and arrays', () => {
    const longArray = Array.from(
      { length: TO_DOTS_MAX_KEYS_PER_OBJECT + 10 },
      (_, i) => i
    );
    const child: Record<string, number> = {};
    for (let i = 0; i < TO_DOTS_MAX_KEYS_PER_OBJECT + 10; i++) {
      child[`c${i}`] = i;
    }
    const result = toDots({ longArray, child, short: [1, 2] });
    const keys = Object.keys(result);
    expect(keys.filter((k) => k.startsWith('longArray.'))).toHaveLength(
      TO_DOTS_MAX_KEYS_PER_OBJECT
    );
    expect(keys.filter((k) => k.startsWith('child.'))).toHaveLength(
      TO_DOTS_MAX_KEYS_PER_OBJECT
    );
    expect(result[`longArray.${TO_DOTS_MAX_KEYS_PER_OBJECT}`]).toBeUndefined();
    expect(result['short.1']).toBe('2');
  });

  it('caps the total number of keys for deeply nested input', () => {
    const level = (child: unknown) =>
      Object.fromEntries(
        Array.from({ length: TO_DOTS_MAX_KEYS_PER_OBJECT }, (_, i) => [
          `k${i}`,
          child,
        ])
      );
    expect(Object.keys(toDots(level(level(level(1)))))).toHaveLength(
      TO_DOTS_MAX_KEYS
    );
  });

  it('strips lone surrogates and keeps valid pairs', () => {
    expect(toDots({ s: 'a\uD800b👋' })).toEqual({ s: 'ab👋' });
  });
});

describe('toObject', () => {
  it('rebuilds nested objects from dotted keys', () => {
    expect(toObject({ a: '1', 'b.c': '2', 'b.d.e': '3' })).toEqual({
      a: '1',
      b: { c: '2', d: { e: '3' } },
    });
  });

  it('lets a later key replace a scalar on its path', () => {
    expect(toObject({ a: '1', 'a.b': '2' })).toEqual({ a: { b: '2' } });
  });

  it('stores a __proto__ segment as data, not as the prototype', () => {
    const result = toObject({ '__proto__.polluted': 'yes' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
});
