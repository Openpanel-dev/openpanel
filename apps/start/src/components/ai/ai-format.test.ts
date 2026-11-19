import { describe, expect, it } from 'vitest';
import { formatCost } from './ai-format';

describe('formatCost', () => {
  it('keeps two significant digits for sub-cent calls', () => {
    expect(formatCost(0.000_052)).toBe('$0.000052');
    expect(formatCost(0.0086)).toBe('$0.0086');
  });

  it('never prints exponent notation for a few-token embedding', () => {
    expect(formatCost(4e-8)).toBe('<$0.000001');
  });

  it('rounds whole amounts to cents', () => {
    expect(formatCost(0)).toBe('$0');
    expect(formatCost(12.345)).toBe('$12.35');
  });
});
