import { expect, test } from 'bun:test';
import { stripNullCharacters } from './persistence';

test('stripNullCharacters removes NUL from nested strings and keys', () => {
  const parts: unknown = [
    { type: 'text', text: 'a\u0000b' },
    {
      type: 'tool-query_events',
      output: {
        rows: [{ 'na\u0000me': 'x\u0000', count: 1, ok: true, none: null }],
      },
    },
  ];
  expect(stripNullCharacters(parts)).toEqual([
    { type: 'text', text: 'ab' },
    {
      type: 'tool-query_events',
      output: { rows: [{ name: 'x', count: 1, ok: true, none: null }] },
    },
  ]);
});

test('stripNullCharacters keeps a clean value as is', () => {
  const value = { text: 'clean', list: [1, 'two', { three: 3 }] };
  expect(stripNullCharacters(value)).toEqual(value);
});
