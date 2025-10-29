import { describe, expect, it } from 'vitest';
import { toDots } from './object';

describe('toDots', () => {
  it('should convert an object to a dot object', () => {
    const obj = {
      a: 1,
      b: 2,
      array: ['1', '2', '3'],
      arrayWithObjects: [{ a: 1 }, { b: 2 }, { c: 3 }],
      objectWithArrays: { a: [1, 2, 3] },
      null: null,
      undefined: undefined,
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
});
