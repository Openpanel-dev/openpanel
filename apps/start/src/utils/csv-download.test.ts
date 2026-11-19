import { describe, expect, it } from 'vitest';
import { cohortMembersToCSV, escapeCsvValue } from './csv-download';

describe('escapeCsvValue', () => {
  it('keeps numbers numeric, negative ones included', () => {
    expect(escapeCsvValue(-12.5)).toBe('-12.5');
  });

  it.each([
    '-5',
    '-3.2',
    '+7',
    '-.5',
    '-1e3',
  ])('leaves the numeric string %j unprefixed', (value) => {
    expect(escapeCsvValue(value)).toBe(value);
  });

  it('leaves ordinary text alone', () => {
    expect(escapeCsvValue('/pricing')).toBe('/pricing');
  });

  it.each([
    '=HYPERLINK("https://evil.test")',
    '+1+1',
    '-1+1',
    '-5+cmd|"/c calc"!A0',
    ' -5',
    '@SUM(A1)',
    '\t=1',
    '  =1+1',
  ])('makes %j literal text', (value) => {
    expect(escapeCsvValue(value).replace(/^"/, '')).toMatch(/^'/);
  });

  it('quotes a neutralised cell that holds a delimiter', () => {
    expect(escapeCsvValue('=1,2')).toBe(`"'=1,2"`);
  });

  it('quotes and doubles embedded quotes', () => {
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('cohortMembersToCSV', () => {
  it('neutralises a formula-shaped profile id', () => {
    expect(cohortMembersToCSV(['=cmd'])).toBe("profile_id\n'=cmd");
  });
});
