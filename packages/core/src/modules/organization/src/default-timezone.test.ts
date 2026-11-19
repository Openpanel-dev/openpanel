import { describe, expect, it } from 'bun:test';
import { DateTime } from '@openpanel/shared';
import { resolveDefaultTimezone } from './default-timezone';

function resolve(value: string | undefined): {
  timezone: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const timezone = resolveDefaultTimezone(value, (message) => {
    warnings.push(message);
  });
  return { timezone, warnings };
}

describe('resolveDefaultTimezone', () => {
  it('returns UTC without warning when unset', () => {
    expect(resolve(undefined)).toEqual({ timezone: 'UTC', warnings: [] });
  });

  it('returns UTC without warning for an empty value', () => {
    expect(resolve('')).toEqual({ timezone: 'UTC', warnings: [] });
  });

  it('returns the configured timezone when valid', () => {
    expect(resolve('Asia/Riyadh')).toEqual({
      timezone: 'Asia/Riyadh',
      warnings: [],
    });
  });

  for (const value of ['Asia/Ryiadh', 'Foo/Bar']) {
    it(`returns UTC and warns once for ${value}`, () => {
      expect(resolve(value)).toEqual({
        timezone: 'UTC',
        warnings: ['Invalid DEFAULT_TIMEZONE, falling back to UTC'],
      });
    });
  }

  for (const value of ['local', 'UTC+3']) {
    it(`rejects the Luxon-only timezone ${value}`, () => {
      expect(DateTime.now().setZone(value).isValid).toBe(true);
      expect(resolve(value)).toEqual({
        timezone: 'UTC',
        warnings: ['Invalid DEFAULT_TIMEZONE, falling back to UTC'],
      });
    });
  }

  it('accepts UTC without warning', () => {
    expect(resolve('UTC')).toEqual({ timezone: 'UTC', warnings: [] });
  });

  it('treats whitespace-only input as absent', () => {
    expect(resolve(' \t ')).toEqual({ timezone: 'UTC', warnings: [] });
  });

  for (const value of [' Asia/Riyadh ', 'utc']) {
    it(`does not normalize the nonempty value ${JSON.stringify(value)}`, () => {
      expect(resolve(value)).toEqual({
        timezone: 'UTC',
        warnings: ['Invalid DEFAULT_TIMEZONE, falling back to UTC'],
      });
    });
  }

  it('does not include the raw invalid value in its warning', () => {
    const result = resolve('synthetic-sensitive-input');
    expect(result.timezone).toBe('UTC');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).not.toContain('synthetic-sensitive-input');
  });
});
