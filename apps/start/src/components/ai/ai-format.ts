// The dashboard formats numbers in one locale (see `useNumber`), not the browser's.
const NUMBER_LOCALE = 'en-US';
const SUB_CENT = 0.01;
const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const COMPACT_THRESHOLD = 10_000;

/** USD. LLM calls cost fractions of a cent, so two decimals would read as $0.00. */
export function formatCost(value: number): string {
  if (!value) {
    return '$0';
  }
  if (Math.abs(value) < SUB_CENT) {
    return `$${Number(value.toPrecision(2))}`;
  }
  return `$${value.toFixed(2)}`;
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
