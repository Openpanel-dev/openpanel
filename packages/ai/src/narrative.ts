// Weekly-digest narrative: one short OpenAI call that turns a project's
// week-over-week stats + notable insights into a friendly intro paragraph.
// Structured output (a single `narrative` string) reuses the same reliable
// pattern as enrich.ts / filter-command.ts.
import { betterAgent, defineAgent } from '@better-agent/core';
import { z } from 'zod';
import { ALLOWED_MODELS, resolveModel } from './providers';

const NARRATIVE_MODEL_ID = 'gpt-4-1-mini';

function narrativeModel() {
  const entry =
    ALLOWED_MODELS.find((m) => m.id === NARRATIVE_MODEL_ID) ??
    ALLOWED_MODELS.find((m) => m.group === 'OpenAI');
  if (!entry) {
    throw new Error('No OpenAI model available for weekly narrative');
  }
  return resolveModel(entry);
}

export interface WeeklyNarrativeInput {
  projectName: string;
  dateRange: string;
  stats: {
    label: string;
    current: number;
    previous: number;
    unit?: string;
  }[];
  insights: { title: string; summary?: string }[];
}

const narrativeOutputSchema = z.object({ narrative: z.string() });
const narrativeOutputJsonSchema = z.toJSONSchema(narrativeOutputSchema, {
  target: 'draft-07',
});

const INSTRUCTION = `You write the intro paragraph for a weekly analytics email digest sent to a website/product owner.

You receive the project's week-over-week stats and a few notable insights (already filtered as email-worthy). Write 2-4 short, friendly, plain-language sentences summarizing how the week went and what stood out.

Rules:
- No greeting and no sign-off (those are added around your text).
- No bullet lists, no markdown, no headings — just prose.
- Be specific about the numbers that actually matter; do NOT restate every stat.
- If a notable insight explains a change, connect them.
- If the week was quiet, say so plainly and briefly. Never invent data.`;

let _app: ReturnType<typeof betterAgent> | null = null;
function getApp() {
  if (_app) return _app;
  const agent = defineAgent({
    name: 'weekly-narrative',
    description: 'Writes a weekly digest intro paragraph (one-shot).',
    model: narrativeModel(),
    contextSchema: z.object({}),
    outputSchema: {
      schema: narrativeOutputJsonSchema,
      name: 'weekly_narrative',
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

export async function generateWeeklyNarrative(
  input: WeeklyNarrativeInput,
): Promise<string> {
  const result = (await getApp().run('weekly-narrative', {
    input: JSON.stringify(input),
    context: {},
    // biome-ignore lint/suspicious/noExplicitAny: same dodge as enrich.ts
  } as any)) as { structured?: { narrative: string } };

  return result.structured?.narrative ?? '';
}
