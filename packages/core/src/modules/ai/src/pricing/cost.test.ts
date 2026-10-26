import { describe, expect, test } from 'bun:test';
import { getCatalogSize, resolveModelPrice } from './catalog';
import { calculateAiCost } from './cost';

describe('resolveModelPrice', () => {
  test('the vendored catalog is populated with sane prices', () => {
    expect(getCatalogSize()).toBeGreaterThan(1000);
    const price = resolveModelPrice('gpt-5-mini', 'openai');
    expect(price?.key).toBe('gpt-5-mini');
    expect(price?.price.input).toBeGreaterThan(0);
    expect(price?.price.output).toBeGreaterThan(price?.price.input ?? 0);
  });

  test.each([
    ['gpt-5-mini', 'openai', 'gpt-5-mini'],
    ['GPT-5-Mini', undefined, 'gpt-5-mini'],
    ['gpt-5-mini-2025-08-07', 'openai', 'gpt-5-mini-2025-08-07'],
    ['gpt-5-mini-2099-01-01', 'openai', 'gpt-5-mini'],
    ['claude-sonnet-5-5', 'anthropic', 'claude-sonnet-5-5'],
    ['claude-sonnet-5-5@20260301', 'anthropic', 'claude-sonnet-5-5'],
    ['anthropic/claude-sonnet-5-5', 'openrouter', 'claude-sonnet-5-5'],
    [
      'anthropic.claude-sonnet-5-5-v1:0',
      'bedrock',
      'anthropic.claude-sonnet-5-5',
    ],
    ['gemini-2.5-pro', 'google', 'gemini/gemini-2.5-pro'],
    ['text-embedding-3-small', 'openai', 'text-embedding-3-small'],
  ])('%s (%s) resolves to %s', (model, provider, expected) => {
    expect(resolveModelPrice(model, provider)?.key).toBe(expected);
  });

  test('an unknown model resolves to nothing', () => {
    expect(resolveModelPrice('my-finetune-9000', 'acme')).toBeNull();
    expect(resolveModelPrice('', 'openai')).toBeNull();
  });
});

describe('calculateAiCost', () => {
  const gpt5Mini = resolveModelPrice('gpt-5-mini', 'openai')?.price;
  const sonnet = resolveModelPrice('claude-sonnet-5-5', 'anthropic')?.price;
  if (!(gpt5Mini && sonnet)) {
    throw new Error('catalog fixture models are missing');
  }

  test('passthrough wins over the catalog', () => {
    expect(
      calculateAiCost({
        model: 'gpt-5-mini',
        provider: 'openai',
        usage: { inputTokens: 1000, outputTokens: 1000 },
        cost: 0.42,
      })
    ).toEqual({
      inputCost: 0,
      outputCost: 0,
      totalCost: 0.42,
      source: 'passthrough',
    });
  });

  test('prices input and output tokens from the catalog', () => {
    const cost = calculateAiCost({
      model: 'gpt-5-mini',
      provider: 'openai',
      usage: { inputTokens: 1000, outputTokens: 200 },
    });
    expect(cost.source).toBe('catalog');
    expect(cost.priceKey).toBe('gpt-5-mini');
    expect(cost.inputCost).toBeCloseTo(1000 * gpt5Mini.input, 12);
    expect(cost.outputCost).toBeCloseTo(200 * gpt5Mini.output, 12);
    expect(cost.totalCost).toBeCloseTo(cost.inputCost + cost.outputCost, 12);
  });

  test('cached tokens are a subset of input and priced at the cache rates', () => {
    const cost = calculateAiCost({
      model: 'claude-sonnet-5-5',
      provider: 'anthropic',
      usage: {
        inputTokens: 1000,
        cacheReadTokens: 600,
        cacheWriteTokens: 100,
        outputTokens: 0,
      },
    });
    const expected =
      300 * sonnet.input +
      600 * (sonnet.cacheRead as number) +
      100 * (sonnet.cacheWrite as number);
    expect(cost.inputCost).toBeCloseTo(expected, 12);
  });

  test('cache counts larger than input are clamped instead of going negative', () => {
    const cost = calculateAiCost({
      model: 'gpt-5-mini',
      provider: 'openai',
      usage: { inputTokens: 100, cacheReadTokens: 500, outputTokens: 0 },
    });
    expect(cost.inputCost).toBeCloseTo(
      100 * (gpt5Mini.cacheRead as number),
      12
    );
  });

  test('reasoning tokens are part of output', () => {
    const cost = calculateAiCost({
      model: 'gpt-5-mini',
      provider: 'openai',
      usage: { inputTokens: 0, outputTokens: 500, reasoningTokens: 300 },
    });
    expect(cost.outputCost).toBeCloseTo(500 * gpt5Mini.output, 12);
  });

  test('costs are rounded so they read cleanly as property strings', () => {
    const cost = calculateAiCost({
      model: 'gpt-5-mini',
      provider: 'openai',
      usage: { inputTokens: 812, outputTokens: 140, cacheReadTokens: 100 },
    });
    expect(String(cost.totalCost)).toBe('0.0004605');
  });

  test('no model, no usage or an unknown model yields no cost', () => {
    expect(calculateAiCost({})).toMatchObject({ totalCost: 0, source: 'none' });
    expect(
      calculateAiCost({
        model: 'nope-9000',
        provider: 'acme',
        usage: { inputTokens: 5 },
      })
    ).toMatchObject({ totalCost: 0, source: 'none' });
  });
});
