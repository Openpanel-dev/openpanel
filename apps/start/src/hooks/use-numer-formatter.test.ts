import { describe, expect, it } from 'vitest';
import { fancyMinutes } from './use-numer-formatter';

describe('fancyMinutes', () => {
  it('carries rounded-up seconds into the minute', () => {
    expect(fancyMinutes(239.854)).toBe('4m 0s');
    expect(fancyMinutes(59.6)).toBe('1m 0s');
  });

  it('keeps whole-second values as they were', () => {
    expect(fancyMinutes(4)).toBe('4s');
    expect(fancyMinutes(76)).toBe('1m 16s');
    expect(fancyMinutes(3 * 3600 + 120)).toBe('3h 2m');
  });
});
