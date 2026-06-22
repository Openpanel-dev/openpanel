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

// Per-day sessions for the insight's own segment, so the model can read the
// *shape* of the change (one-off spike on a date vs sustained growth) rather
// than just current-vs-baseline totals.
export interface DailyPoint {
  date: string;
  sessions: number;
}

export interface ExplainInsightInput {
  insight: {
    title: string;
    dimension: string;
    window: string;
    summary?: string;
  };
  // The insight metric's daily series for its own segment.
  dailySeries?: {
    metric: string;
    current: DailyPoint[];
    baseline: DailyPoint[];
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

You receive: the insight (what changed); a dailySeries — the segment's own per-day values for the current window vs the baseline window; a decomposition of the change across dimensions (referrer, country, device, utm_source) as current-vs-baseline session breakdowns; and any manual references (off-platform events the owner logged) near the window.

Read the dailySeries FIRST — it tells you the *shape* of the change, which the totals alone hide:
- A one-off spike: most of the change is concentrated in one or a few days, then it returns toward baseline. Say so explicitly and name the peak date(s) and the peak value. A single-day spike inflating a window total is NOT sustained growth — do not describe it as "grew to X" as if it held.
- A step change: it jumps to a new level and stays there.
- Sustained/gradual growth or decline: it moves steadily across the window.
If the series is flat except for a spike, lead with the spike.

Produce:
- summary: 1-2 plain sentences answering "why did this happen", grounded in the data. State the shape (spike / step / sustained) with the peak date when it's a spike, then name the sub-segment(s) that account for most of the change (e.g. "a one-off spike on May 28 — ~60 sessions vs a ~5/day baseline — drove the lift; traffic has since returned to baseline").
- drivers: the concrete contributors, each a short label + a one-line detail with the numbers (include the peak date/value when relevant).
- relatedReference: the title of a reference whose date lines up with the spike/change date, or "" if none fits. Prefer a reference dated on or just before the peak day. Do not force a connection.
- confidence: low | medium | high — how clearly the data explains the change.

Be honest and precise. You can only see what's in the data: explain the shape and the internal decomposition (which segment moved, when), not external causes you can't observe. If the data doesn't clearly explain it, say so and set confidence low. Never invent numbers or dates.`;

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
