// Tier-1 insight enrichment: a one-shot OpenAI call that scores and summarizes
// insights so the product can filter noise, pick email-worthy items and flag
// chart-reference candidates. No persistence: the caller writes results back.
import { betterAgent, defineAgent } from '@better-agent/core';
import { z } from 'zod';
import { callProvider } from '../../../clients/provider-error';
import type { CoreConfig } from '../../../config';
import { ALLOWED_MODELS, resolveModel } from '../../assistant/src/providers';

// Bump when the prompt or output shape changes — the worker re-enriches any
// insight whose stored enrichVersion is below this.
export const ENRICH_VERSION = 1;

// Tier-1 is cheap, fast, non-reasoning work — gpt-4.1-mini is the right tier.
const ENRICH_MODEL_ID = 'gpt-4-1-mini';

// Both the preferred model and the fallback are OpenAI, so every failure this
// call classifies is an OpenAI one.
const ENRICH_PROVIDER = 'openai';

function enrichModel(config: CoreConfig) {
  const entry =
    ALLOWED_MODELS.find((m) => m.id === ENRICH_MODEL_ID) ??
    ALLOWED_MODELS.find((m) => m.group === 'OpenAI');
  if (!entry) {
    throw new Error('No OpenAI model available for insight enrichment');
  }
  return resolveModel(config, entry);
}

export interface InsightToEnrich {
  id: string;
  moduleKey: string;
  dimensionKey: string;
  windowKind: string;
  title: string;
  summary: string | null;
  displayName: string;
  direction: string | null;
  impactScore: number;
  severityBand: string | null;
  payload: unknown;
}

export type InsightCategory = 'spike' | 'drop' | 'shift' | 'anomaly' | 'trend';

export interface InsightEnrichment {
  id: string;
  relevanceScore: number;
  summary: string;
  category: InsightCategory;
  emailWorthy: boolean;
  referenceWorthy: boolean;
}

const enrichmentOutputSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      // No min/max here — OpenAI strict structured outputs reject numeric
      // constraints; the caller clamps to 0..1.
      relevanceScore: z.number(),
      summary: z.string(),
      category: z.enum(['spike', 'drop', 'shift', 'anomaly', 'trend']),
      emailWorthy: z.boolean(),
      referenceWorthy: z.boolean(),
    })
  ),
});

const enrichmentOutputJsonSchema = z.toJSONSchema(enrichmentOutputSchema, {
  target: 'draft-07',
});

const INSTRUCTION = `You are an analytics insight editor for OpenPanel, a web/product analytics platform.

You receive a JSON array of automatically-detected insights about ONE project's traffic. Each has a moduleKey (referrers, entry-pages, page-trends, geo, devices), a dimension, a time window, a statistically-derived title/summary, a direction, an impactScore, and a payload of metrics.

For EACH input insight, produce:
- relevanceScore (number 0..1): how much a busy site owner should care RIGHT NOW. Be a HARSH filter — most auto-detected insights are noise. Reserve >0.7 for genuinely notable, actionable changes. Tiny pages, routine wiggles, and statistically-significant-but-boring shifts should score below 0.3.
- summary (string): one plain-language sentence a non-analyst understands — what changed and why it might matter. No jargon, no "share shifted 0.5pp".
- category: one of spike | drop | shift | anomaly | trend.
- emailWorthy (boolean): true ONLY if it belongs in a weekly digest — a clear, interesting weekly-scale change. Usually false.
- referenceWorthy (boolean): true ONLY if it is a discrete, datable event worth pinning to a chart timeline (e.g. a sudden spike on a specific day), NOT a slow rolling trend. Usually false.

Return exactly one result per input insight, preserving each "id" verbatim. Be calibrated and consistent across the batch.`;

let _app: ReturnType<typeof betterAgent> | null = null;
function getApp(config: CoreConfig) {
  if (_app) {
    return _app;
  }
  const agent = defineAgent({
    name: 'insight-enrich',
    description:
      'Scores and summarizes analytics insights (one-shot, no persistence).',
    model: enrichModel(config),
    contextSchema: z.object({}),
    outputSchema: {
      schema: enrichmentOutputJsonSchema,
      name: 'insight_enrichment',
      strict: true,
    },
    instruction: () => INSTRUCTION,
    tools: () => [],
    maxSteps: 1,
    // biome-ignore lint/suspicious/noExplicitAny: same dodge as filter-command.ts
  } as any);
  _app = betterAgent({ agents: [agent] });
  return _app;
}

/**
 * Enrich a batch of insights in one model call. Returns one entry per insight
 * the model scored; the caller maps back by id and missing ids are skipped.
 * Keep batches modest (~25) so the prompt stays small and the mapping reliable.
 */
export async function enrichInsights(
  config: CoreConfig,
  insights: InsightToEnrich[]
): Promise<InsightEnrichment[]> {
  if (insights.length === 0) {
    return [];
  }

  const input = JSON.stringify(insights);
  const result = (await callProvider(ENRICH_PROVIDER, () =>
    getApp(config).run('insight-enrich', {
      input,
      context: {},
      // biome-ignore lint/suspicious/noExplicitAny: same dodge as filter-command.ts
    } as any)
  )) as { structured?: { results: InsightEnrichment[] } };

  return result.structured?.results ?? [];
}
