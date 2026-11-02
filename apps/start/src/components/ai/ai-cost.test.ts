import { describe, expect, it } from 'vitest';
import { describeAiCost, isUnpricedCall } from './ai-cost';
import { formatCost, formatLatencyOrNone } from './ai-format';

describe('describeAiCost', () => {
  it('shows a priced cost as is', () => {
    expect(describeAiCost(0.0086, 0)).toEqual({ text: '$0.0086' });
  });

  it('shows a dash with a hint when nothing could be priced', () => {
    const { text, hint } = describeAiCost(0, 2);
    expect(text).toBe('—');
    expect(hint).toContain('Cost unknown');
  });

  it('shows a partly priced total as a lower bound that never rounds up', () => {
    expect(describeAiCost(0.016, 1).text).toBe('$0.01+');
    expect(describeAiCost(0.002_39, 3).text).toBe('$0.0023+');
    expect(describeAiCost(0.016, 1).hint).toContain('1 call has');
    expect(describeAiCost(0.29, 1).text).toBe('$0.29+');
  });

  it('shows a dash when the priced part is too small to show', () => {
    expect(describeAiCost(4e-8, 1).text).toBe('—');
  });
});

describe('isUnpricedCall', () => {
  it('counts only successful model calls without a price', () => {
    expect(
      isUnpricedCall({ type: 'generation', isError: false, costSource: 'none' })
    ).toBe(true);
    expect(
      isUnpricedCall({ type: 'generation', isError: true, costSource: 'none' })
    ).toBe(false);
    expect(
      isUnpricedCall({ type: 'span', isError: false, costSource: 'none' })
    ).toBe(false);
    expect(
      isUnpricedCall({
        type: 'embedding',
        isError: false,
        costSource: 'catalog',
      })
    ).toBe(false);
  });
});

describe('formatCost rounding', () => {
  it('rounds to nearest by default and down on request', () => {
    expect(formatCost(0.016)).toBe('$0.02');
    expect(formatCost(0.016, 'down')).toBe('$0.01');
    expect(formatCost(0.000_529, 'down')).toBe('$0.00052');
    expect(formatCost(0.29, 'down')).toBe('$0.29');
    expect(formatCost(0.000_29, 'down')).toBe('$0.00029');
    expect(formatCost(0.289_999_999_999_99, 'down')).toBe('$0.28');
    expect(formatCost(1.5, 'down')).toBe('$1.50');
  });
});

describe('formatLatencyOrNone', () => {
  it('shows a dash when latency was not measured', () => {
    expect(formatLatencyOrNone(null)).toBe('—');
    expect(formatLatencyOrNone(0)).toBe('0ms');
  });
});
