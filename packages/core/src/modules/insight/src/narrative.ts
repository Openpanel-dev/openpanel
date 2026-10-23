// Weekly-digest narrative: one short OpenAI call that turns a project's
// week-over-week stats and notable insights into an intro paragraph.
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { callProvider } from '../../../clients/provider-error';
import type { CoreConfig } from '../../../config';
import { resolveOpenAITaskModel } from '../../assistant/src/providers';

const NARRATIVE_PROVIDER = 'openai';

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
const INSTRUCTION = `You write the intro paragraph for a weekly analytics email digest sent to a website/product owner.

You receive the project's week-over-week stats and a few notable insights (already filtered as email-worthy). Write 2-4 short, friendly, plain-language sentences summarizing how the week went and what stood out.

Rules:
- No greeting and no sign-off (those are added around your text).
- No bullet lists, no markdown, no headings — just prose.
- Be specific about the numbers that actually matter; do NOT restate every stat.
- If a notable insight explains a change, connect them.
- If the week was quiet, say so plainly and briefly. Never invent data.`;

export async function generateWeeklyNarrative(
  config: CoreConfig,
  input: WeeklyNarrativeInput
): Promise<string> {
  const result = await callProvider(NARRATIVE_PROVIDER, () =>
    generateText({
      model: resolveOpenAITaskModel(config, 'small'),
      instructions: INSTRUCTION,
      prompt: JSON.stringify(input),
      reasoning: 'low',
      output: Output.object({ schema: narrativeOutputSchema }),
    })
  );

  return result.output?.narrative ?? '';
}
