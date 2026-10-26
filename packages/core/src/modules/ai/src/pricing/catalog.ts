// Model → price lookup over the vendored LiteLLM catalog. Pure and in-memory:
// the ingest path resolves a price per event, so a miss must be cheap too.

import catalogJson from './llm-prices.json';

export interface ModelPrice {
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

export interface ResolvedModelPrice {
  /** The catalog key that matched, e.g. `gpt-5-mini`. */
  key: string;
  price: ModelPrice;
}

const catalog = catalogJson as {
  models: Record<string, ModelPrice>;
};

/** Catalog key prefixes a caller's provider name may stand for. */
const PROVIDER_PREFIXES: Record<string, string[]> = {
  openai: ['openai'],
  azure: ['azure', 'azure_ai'],
  'azure-openai': ['azure', 'azure_ai'],
  anthropic: ['anthropic'],
  google: ['gemini', 'vertex_ai'],
  gemini: ['gemini', 'vertex_ai'],
  vertex: ['vertex_ai', 'gemini'],
  'vertex-ai': ['vertex_ai', 'gemini'],
  bedrock: ['bedrock', 'bedrock_converse'],
  aws: ['bedrock', 'bedrock_converse'],
  'amazon-bedrock': ['bedrock', 'bedrock_converse'],
  mistral: ['mistral'],
  groq: ['groq'],
  xai: ['xai'],
  deepseek: ['deepseek'],
  openrouter: ['openrouter'],
  together: ['together_ai'],
  'together-ai': ['together_ai'],
  fireworks: ['fireworks_ai'],
  'fireworks-ai': ['fireworks_ai'],
  perplexity: ['perplexity'],
  cohere: ['cohere'],
  ollama: ['ollama'],
  cerebras: ['cerebras'],
};

/** Snapshot dates and provider version tags that are not part of the model name. */
const VERSION_SUFFIX =
  /[-@:._]?(\d{4}-\d{2}-\d{2}|\d{8}|v\d+(?::\d+)?|latest)$/;
const MAX_SUFFIX_STRIPS = 3;
const RESOLVE_CACHE_LIMIT = 10_000;

const resolveCache = new Map<string, ResolvedModelPrice | null>();

let plainKeysByLength: string[] | null = null;

/** Catalog keys without a provider prefix, longest first, for prefix matching. */
function getPlainKeys(): string[] {
  if (!plainKeysByLength) {
    plainKeysByLength = Object.keys(catalog.models)
      .filter((key) => !key.includes('/'))
      .sort((a, b) => b.length - a.length);
  }
  return plainKeysByLength;
}

function lookup(key: string): ResolvedModelPrice | null {
  const price = catalog.models[key];
  return price ? { key, price } : null;
}

function stripVersionSuffixes(model: string): string[] {
  const variants: string[] = [];
  let current = model;
  for (let i = 0; i < MAX_SUFFIX_STRIPS; i++) {
    const next = current.replace(VERSION_SUFFIX, '');
    if (next === current || next.length === 0) {
      break;
    }
    variants.push(next);
    current = next;
  }
  return variants;
}

function candidateNames(model: string): string[] {
  const names = [model];
  const segments = model.split('/');
  if (segments.length > 1) {
    names.push(segments.slice(1).join('/'), segments.at(-1) as string);
  }
  for (const name of [...names]) {
    names.push(...stripVersionSuffixes(name));
  }
  return [...new Set(names)];
}

function longestPrefixMatch(name: string): ResolvedModelPrice | null {
  for (const key of getPlainKeys()) {
    if (
      name.startsWith(key) &&
      (name.length === key.length || name[key.length] === '-')
    ) {
      return lookup(key);
    }
  }
  return null;
}

function resolveUncached(
  model: string,
  provider: string | undefined
): ResolvedModelPrice | null {
  const prefixes = provider ? (PROVIDER_PREFIXES[provider] ?? [provider]) : [];
  const names = candidateNames(model);

  for (const name of names) {
    for (const prefix of prefixes) {
      const match = lookup(`${prefix}/${name}`);
      if (match) {
        return match;
      }
    }
    const match = lookup(name);
    if (match) {
      return match;
    }
  }

  for (const name of names) {
    const match = longestPrefixMatch(name);
    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Finds the catalog price for a model. `provider` only steers the search
 * (`gemini-2.5-pro` from `google` prefers the `gemini/` entry); a model that
 * only exists under another provider still resolves.
 */
export function resolveModelPrice(
  model: string,
  provider?: string
): ResolvedModelPrice | null {
  const normalizedModel = model.trim().toLowerCase();
  const normalizedProvider = provider?.trim().toLowerCase() || undefined;
  if (!normalizedModel) {
    return null;
  }
  const cacheKey = `${normalizedProvider ?? ''}|${normalizedModel}`;
  const cached = resolveCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const resolved = resolveUncached(normalizedModel, normalizedProvider);
  if (resolveCache.size >= RESOLVE_CACHE_LIMIT) {
    resolveCache.clear();
  }
  resolveCache.set(cacheKey, resolved);
  return resolved;
}

export function getCatalogSize(): number {
  return Object.keys(catalog.models).length;
}
