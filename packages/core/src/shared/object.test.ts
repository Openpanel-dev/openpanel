// Subject moved to @openpanel/shared; the suite did not follow it. Nothing runs
// a `test` script in packages/shared yet — the root `test` script names its
// four workspaces explicitly and root package.json was outside M15-010's scope
// — so moving this file would take it out of every gate. Move it when that line
// can gain the filter.
import { describe, expect, it } from 'bun:test';
import { toDots } from '@openpanel/shared';

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
});
