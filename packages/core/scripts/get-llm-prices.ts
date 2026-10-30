// Regenerates src/modules/ai/src/pricing/llm-prices.json from LiteLLM's
// catalog (MIT, updated several times a day). Only the fields the cost engine
// reads are kept, so the vendored file stays a few hundred KB.
//
//   bun run --filter @openpanel/core gen:llm-prices

import path from 'node:path';
import { z } from 'zod';

const SOURCE_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const OUTPUT_PATH = path.join(
  import.meta.dir,
  '../src/modules/ai/src/pricing/llm-prices.json'
);
/** Modes that bill per token and that an `ai_generation` / `ai_embedding` can describe. */
const TOKEN_BILLED_MODES = new Set([
  'chat',
  'completion',
  'responses',
  'embedding',
]);

const zSourceEntry = z.object({
  mode: z.string().optional(),
  litellm_provider: z.string().optional(),
  input_cost_per_token: z.number().optional(),
  output_cost_per_token: z.number().optional(),
  cache_read_input_token_cost: z.number().optional(),
  cache_creation_input_token_cost: z.number().optional(),
  cache_creation_input_token_cost_above_1hr: z.number().optional(),
  output_cost_per_reasoning_token: z.number().optional(),
  deprecation_date: z.string().optional(),
});

export interface LlmPriceEntry {
  provider: string;
  mode: 'chat' | 'embedding';
  /** USD per token. */
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
  reasoning?: number;
}

export interface LlmPriceCatalog {
  source: string;
  generatedAt: string;
  models: Record<string, LlmPriceEntry>;
}

function toEntry(raw: unknown): LlmPriceEntry | null {
  const parsed = zSourceEntry.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const entry = parsed.data;
  if (!(entry.mode && TOKEN_BILLED_MODES.has(entry.mode))) {
    return null;
  }
  if (entry.input_cost_per_token === undefined) {
    return null;
  }
  return {
    provider: entry.litellm_provider ?? 'unknown',
    mode: entry.mode === 'embedding' ? 'embedding' : 'chat',
    input: entry.input_cost_per_token,
    output: entry.output_cost_per_token ?? 0,
    ...(entry.cache_read_input_token_cost !== undefined && {
      cacheRead: entry.cache_read_input_token_cost,
    }),
    ...(entry.cache_creation_input_token_cost !== undefined && {
      cacheWrite: entry.cache_creation_input_token_cost,
    }),
    ...(entry.cache_creation_input_token_cost_above_1hr !== undefined && {
      cacheWrite1h: entry.cache_creation_input_token_cost_above_1hr,
    }),
    ...(entry.output_cost_per_reasoning_token !== undefined && {
      reasoning: entry.output_cost_per_reasoning_token,
    }),
  };
}

export function buildCatalog(
  source: Record<string, unknown>,
  generatedAt: Date
): LlmPriceCatalog {
  const models: Record<string, LlmPriceEntry> = {};
  for (const key of Object.keys(source).sort()) {
    if (key === 'sample_spec') {
      continue;
    }
    const entry = toEntry(source[key]);
    if (entry) {
      models[key.toLowerCase()] = entry;
    }
  }
  return {
    source: SOURCE_URL,
    generatedAt: generatedAt.toISOString(),
    models,
  };
}

if (import.meta.main) {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Fetching ${SOURCE_URL} failed with ${response.status}`);
  }
  const source = (await response.json()) as Record<string, unknown>;
  const catalog = buildCatalog(source, new Date());
  await Bun.write(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    `Wrote ${Object.keys(catalog.models).length} priced models to ${OUTPUT_PATH}`
  );
}
