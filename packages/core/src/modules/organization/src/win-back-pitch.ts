// One short OpenAI call that turns a lapsed trial's recent stats into a
// two-sentence pitch. A throw means "no pitch", never a failed email: the job
// falls back to a deterministic sentence built from the same facts.
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { callProvider } from '../../../clients/provider-error';
import type { CoreConfig } from '../../../config';
import { resolveOpenAITaskModel } from '../../assistant/src/providers';

const WIN_BACK_PROVIDER = 'openai';

export interface WinBackPitchInput {
  projectName: string;
  /** e.g. "the last 30 days" */
  window: string;
  eventsCount: number;
  uniqueVisitors: number;
  busiestDay?: { date: string; visitors: number };
  topPage?: { path: string; sessions: number };
}

const winBackOutputSchema = z.object({ pitch: z.string() });
const INSTRUCTION = `You write one short paragraph for an email to someone whose analytics trial expired months ago but whose website is still sending us tracking data. They have not looked at their dashboard in a long time. The email's goal is to get them to subscribe before we stop recording their events.

You receive their real stats from the recent window. Write 1-2 plain sentences with the most interesting concrete facts. The reader should think "huh, I didn't know that", not "I am being marketed to". The paragraph sits inside an email written in the founder's own casual voice, so it must read like a person, not a report.

Rules:
- No greeting and no sign-off (those are added around your text).
- No bullet lists, no markdown, no headings, no emoji. Just prose.
- Never mention the trial, pricing, deadlines, or that anything will be blocked. The surrounding email handles that.
- Never invent data; only use the numbers given. If the numbers are modest, keep it matter-of-fact.
- State the facts and stop. No concluding sentence about what the numbers mean, show, or suggest.
- No trailing participle clauses ("..., showing steady growth").
- No "not just X, but Y" constructions.
- Plain verbs: prefer "had", "was", "sent", "came from". Do not rotate through attracted, drew, saw, garnered, tracked as substitutes.
- Banned words: strong, notably, impressive, steady, robust, vibrant, significant, momentum, engagement, journey, insights, leverage, delve, testament, underscore, pivotal, crucial, remarkable, "during this period".
- No em dashes.
- Contractions are fine.`;

export async function generateWinBackPitch(
  config: CoreConfig,
  input: WinBackPitchInput
): Promise<string> {
  const result = await callProvider(WIN_BACK_PROVIDER, () =>
    generateText({
      model: resolveOpenAITaskModel(config, 'small'),
      instructions: INSTRUCTION,
      prompt: JSON.stringify(input),
      reasoning: 'low',
      output: Output.object({ schema: winBackOutputSchema }),
    })
  );

  // The instruction bans em dashes, but the model slips one in often enough
  // that a prompt rule alone won't hold across hundreds of sends. Commas read
  // fine in every construction it produces them in.
  return (result.output?.pitch ?? '').replace(/\s*[—–]\s*/g, ', ').trim();
}
