import { expect, spyOn, test } from 'bun:test';
import {
  REGEX_VALIDATION_BUDGET_MS,
  testFilterPattern,
  toFilterPattern,
  validateFilterPattern,
} from './filter-regex';

test('accepts ordinary patterns', () => {
  expect(validateFilterPattern('^/product/\\d+$')).toBeUndefined();
  expect(validateFilterPattern('(a+)+$')).toBeUndefined();
  expect(validateFilterPattern(toFilterPattern('/checkout|cart/'))).toBe(
    undefined
  );
});

test('rejects syntax RE2 does not support', () => {
  expect(validateFilterPattern('(?=foo)bar')).toContain(
    'Invalid regular expression'
  );
  expect(validateFilterPattern('(a)\\1')).toContain(
    'Invalid regular expression'
  );
  expect(validateFilterPattern('((a{100}){100}){100}')).toContain(
    'Invalid regular expression'
  );
});

test('rejects a pattern that runs over the time budget on the probes', () => {
  let now = 0;
  const clock = spyOn(performance, 'now').mockImplementation(() => {
    now += REGEX_VALIDATION_BUDGET_MS;
    return now;
  });

  try {
    expect(validateFilterPattern('abc')).toContain('too slow');
    expect(clock).toHaveBeenCalled();
  } finally {
    clock.mockRestore();
  }
});

test('matches anywhere in the input, like RegExp.test', () => {
  expect(testFilterPattern('product', '/shop/product/1')).toBe(true);
  expect(testFilterPattern('^product', '/shop/product/1')).toBe(false);
});
