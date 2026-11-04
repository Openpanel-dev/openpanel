// The dashboard formats numbers in one locale (see `useNumber`), not the browser's.
const NUMBER_LOCALE = 'en-US';
const SUB_CENT = 0.01;
const COST_SIGNIFICANT_DIGITS = 2;
// Below this a few-token embedding prints as $4e-8 or a digit string too wide for a table cell.
export const SMALLEST_SHOWN_COST = 0.000_001;
const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const COMPACT_THRESHOLD = 10_000;

const CENT_DECIMALS = 2;

/**
 * Drops digits past the shown precision instead of rounding them up. Works on
 * the decimal string: `0.29 * 100` is 28.999… in binary and would floor to 0.28.
 */
function floorToPrecision(value: number): number {
  const [whole = '0', fraction = ''] = String(value).split('.');
  const leadingZeros = fraction.match(/^0*/)?.[0].length ?? 0;
  const decimals =
    value >= SUB_CENT ? CENT_DECIMALS : leadingZeros + COST_SIGNIFICANT_DIGITS;
  return Number(`${whole}.${fraction.slice(0, decimals) || '0'}`);
}

/**
 * USD. LLM calls cost fractions of a cent, so two decimals would read as $0.00.
 * `down` keeps a lower bound from claiming more than was priced.
 */
export function formatCost(
  value: number,
  rounding: 'nearest' | 'down' = 'nearest'
): string {
  if (!value) {
    return '$0';
  }
  if (Math.abs(value) < SMALLEST_SHOWN_COST) {
    return '<$0.000001';
  }
  const shown = rounding === 'down' ? floorToPrecision(value) : value;
  if (Math.abs(value) < SUB_CENT) {
    return `$${Number(shown.toPrecision(COST_SIGNIFICANT_DIGITS))}`;
  }
  return `$${shown.toFixed(2)}`;
}

/** No chat calls in range means latency was not measured, not that it was 0ms. */
export function formatLatencyOrNone(ms: number | null): string {
  return ms === null ? '—' : formatLatency(ms);
}

export function formatLatency(ms: number): string {
  if (!ms) {
    return '0ms';
  }
  if (ms < SECOND_MS) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < MINUTE_MS) {
    return `${(ms / SECOND_MS).toFixed(1)}s`;
  }
  return `${(ms / MINUTE_MS).toFixed(1)}m`;
}

export function formatTokens(value: number): string {
  if (value >= COMPACT_THRESHOLD) {
    return new Intl.NumberFormat(NUMBER_LOCALE, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat(NUMBER_LOCALE).format(value);
}

export const AI_TYPE_LABELS = {
  generation: 'Generation',
  embedding: 'Embedding',
  span: 'Span',
  trace: 'Trace',
} as const;
