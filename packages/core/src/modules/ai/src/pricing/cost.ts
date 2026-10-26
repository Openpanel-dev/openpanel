import type { IAiUsage } from '../../ai.constants';
import { type ModelPrice, resolveModelPrice } from './catalog';

export type AiCostSource = 'passthrough' | 'catalog' | 'none';

export interface AiCost {
  /** USD. */
  inputCost: number;
  outputCost: number;
  totalCost: number;
  source: AiCostSource;
  /** The catalog key the price came from, when `source` is `catalog`. */
  priceKey?: string;
}

export interface AiCostInput {
  model?: string;
  provider?: string;
  usage?: IAiUsage;
  /** A caller-supplied total wins over everything else. */
  cost?: number;
}

// When the catalog has no cache price. Anthropic documents cache reads at
// 10% and writes at 125% of input; other providers cluster around 50% for
// reads. Stated here rather than hidden in the number.
const ANTHROPIC_CACHE_READ_RATIO = 0.1;
const DEFAULT_CACHE_READ_RATIO = 0.5;
const DEFAULT_CACHE_WRITE_RATIO = 1.25;
const NO_COST: AiCost = {
  inputCost: 0,
  outputCost: 0,
  totalCost: 0,
  source: 'none',
};

function isAnthropic(price: ModelPrice, provider: string | undefined): boolean {
  return price.provider === 'anthropic' || provider === 'anthropic';
}

function inputCostFor(
  usage: IAiUsage,
  price: ModelPrice,
  provider: string | undefined
): number {
  const input = usage.inputTokens ?? 0;
  const cacheRead = Math.min(usage.cacheReadTokens ?? 0, input);
  const cacheWrite = Math.min(usage.cacheWriteTokens ?? 0, input - cacheRead);
  const uncached = input - cacheRead - cacheWrite;
  const readRatio = isAnthropic(price, provider)
    ? ANTHROPIC_CACHE_READ_RATIO
    : DEFAULT_CACHE_READ_RATIO;
  const cacheReadPrice = price.cacheRead ?? price.input * readRatio;
  const cacheWritePrice =
    price.cacheWrite ?? price.input * DEFAULT_CACHE_WRITE_RATIO;
  return (
    uncached * price.input +
    cacheRead * cacheReadPrice +
    cacheWrite * cacheWritePrice
  );
}

function outputCostFor(usage: IAiUsage, price: ModelPrice): number {
  const output = usage.outputTokens ?? 0;
  const reasoning = Math.min(usage.reasoningTokens ?? 0, output);
  const reasoningPrice = price.reasoning ?? price.output;
  return (output - reasoning) * price.output + reasoning * reasoningPrice;
}

/** Floats like 0.00046049999999999997 read badly in a property map. */
const COST_DECIMALS = 10;

function roundCost(value: number): number {
  return Number(value.toFixed(COST_DECIMALS));
}

export function calculateAiCost(input: AiCostInput): AiCost {
  if (input.cost !== undefined) {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: roundCost(input.cost),
      source: 'passthrough',
    };
  }
  if (!(input.model && input.usage)) {
    return NO_COST;
  }
  const resolved = resolveModelPrice(input.model, input.provider);
  if (!resolved) {
    return NO_COST;
  }
  const inputCost = inputCostFor(input.usage, resolved.price, input.provider);
  const outputCost = outputCostFor(input.usage, resolved.price);
  return {
    inputCost: roundCost(inputCost),
    outputCost: roundCost(outputCost),
    totalCost: roundCost(inputCost + outputCost),
    source: 'catalog',
    priceKey: resolved.key,
  };
}
