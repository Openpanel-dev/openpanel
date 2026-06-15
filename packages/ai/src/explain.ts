// Phase 5 — the "why". Given an insight plus a deterministic decomposition of
// the change (current vs baseline breakdowns across referrer/country/device/
// utm) and any nearby references, produce an honest explanation: which
// sub-segment drove the delta, and which off-platform event (reference) might
// correlate. It explains the *internal decomposition*, not invented external
// causes. The caller gathers the data (DB/CH); this module just narrates.
import { betterAgent, defineAgent } from '@better-agent/core';
import { z } from 'zod';
import { ALLOWED_MODELS, resolveModel } from './providers';

// gpt-4.1 (the larger non-reasoning model) synthesizes the supplied breakdown
// well without reasoning-option plumbing. Swap to a reasoning model later if
// deeper inference is wanted.
const EXPLAIN_MODEL_ID = 'gpt-4-1';

function explainModel() {
  const entry =
    ALLOWED_MODELS.find((m) => m.id === EXPLAIN_MODEL_ID) ??
    ALLOWED_MODELS.find((m) => m.group === 'OpenAI');
  if (!entry) {
    throw new Error('No OpenAI model available for insight explanation');
  }
  return resolveModel(entry);
}

export interface BreakdownComparison {
  column: string;
  current: { name: string | null; sessions: number }[];
  baseline: { name: string | null; sessions: number }[];
}

export interface ExplainInsightInput {
  insight: {
    title: string;
    dimension: string;
    window: string;
    summary?: string;
  };
  breakdowns: BreakdownComparison[];
  references: { title: string; date: string }[];
}

export interface InsightExplanation {
  summary: string;
  drivers: { label: string; detail: string }[];
  relatedReference: string;
  confidence: 'low' | 'medium' | 'high';
}

const explanationSchema = z.object({
  summary: z.string(),
  drivers: z.array(
    z.object({
      label: z.string(),
      detail: z.string(),
    }),
  ),
  // '' when nothing correlates — kept required for OpenAI strict mode.
  relatedReference: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
});

const explanationJsonSchema = z.toJSONSchema(explanationSchema, {
  target: 'draft-07',
});

const INSTRUCTION = `You explain WHY an analytics metric changed for a website/product owner.

You receive: the insight (what changed), a decomposition of the change across dimensions (referrer, country, device, utm_source) as current-window vs baseline-window session breakdowns, and any manual references (off-platform events the owner logged) near the window.

Produce:
- summary: 1-2 plain sentences answering "why did this happen", grounded in the decomposition. Name the sub-segment(s) that account for most of the change (e.g. "most of the lift came from reddit.com referrals").
- drivers: the concrete contributors, each a short label + a one-line detail with the numbers.
- relatedReference: the title of a reference that plausibly explains the change, or "" if none fits. Do not force a connection.
- confidence: low | medium | high — how clearly the decomposition explains the change.

Be honest and precise. You can only see what's in the data: explain the internal decomposition (which segment moved), not external causes you can't observe. If the breakdown doesn't clearly explain it, say so and set confidence low. Never invent numbers.`;

let _app: ReturnType<typeof betterAgent> | null = null;
function getApp() {
  if (_app) return _app;
  const agent = defineAgent({
    name: 'insight-explain',
    description: 'Explains why an insight changed (one-shot).',
    model: explainModel(),
    contextSchema: z.object({}),
    outputSchema: {
      schema: explanationJsonSchema,
      name: 'insight_explanation',
      strict: true,
    },
    instruction: () => INSTRUCTION,
    tools: () => [],
    maxSteps: 1,
    // biome-ignore lint/suspicious/noExplicitAny: same dodge as enrich.ts
  } as any);
  _app = betterAgent({ agents: [agent] });
  return _app;
}

export async function generateInsightExplanation(
  input: ExplainInsightInput,
): Promise<InsightExplanation | null> {
  const result = (await getApp().run('insight-explain', {
    input: JSON.stringify(input),
    context: {},
    // biome-ignore lint/suspicious/noExplicitAny: same dodge as enrich.ts
  } as any)) as { structured?: InsightExplanation };

  return result.structured ?? null;
}
