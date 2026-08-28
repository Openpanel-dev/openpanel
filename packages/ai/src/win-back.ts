// Wind-down win-back pitch: one short OpenAI call that turns a lapsed trial's
// recent stats into a two-sentence selling argument for the wind-down emails.
// Same one-shot structured-output pattern as narrative.ts — and like the
// narrative, the caller must treat a throw as "no pitch", never as a failed
// email: the wind-down job falls back to a deterministic sentence built from
// the same facts.
import { betterAgent, defineAgent } from '@better-agent/core';
import { z } from 'zod';
import { ALLOWED_MODELS, resolveModel } from './providers';

const WIN_BACK_MODEL_ID = 'gpt-4-1-mini';

function winBackModel() {
  const entry =
    ALLOWED_MODELS.find((m) => m.id === WIN_BACK_MODEL_ID) ??
    ALLOWED_MODELS.find((m) => m.group === 'OpenAI');
  if (!entry) {
    throw new Error('No OpenAI model available for win-back pitch');
  }
  return resolveModel(entry);
}

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
const winBackOutputJsonSchema = z.toJSONSchema(winBackOutputSchema, {
  target: 'draft-07',
});

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

let _app: ReturnType<typeof betterAgent> | null = null;
function getApp() {
  if (_app) {
    return _app;
  }
  const agent = defineAgent({
    name: 'win-back-pitch',
    description: 'Writes a wind-down win-back paragraph (one-shot).',
    model: winBackModel(),
    contextSchema: z.object({}),
    outputSchema: {
      schema: winBackOutputJsonSchema,
      name: 'win_back_pitch',
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

export async function generateWinBackPitch(
  input: WinBackPitchInput,
): Promise<string> {
  const result = (await getApp().run('win-back-pitch', {
    input: JSON.stringify(input),
    context: {},
    // biome-ignore lint/suspicious/noExplicitAny: same dodge as enrich.ts
  } as any)) as { structured?: { pitch: string } };

  // The instruction bans em dashes, but the model slips one in often enough
  // that a prompt rule alone won't hold across hundreds of sends. Commas read
  // fine in every construction it produces them in.
  return (result.structured?.pitch ?? '').replace(/\s*[—–]\s*/g, ', ').trim();
}
