import { createAnthropic } from '@better-agent/providers/anthropic';
import { createOpenAI } from '@better-agent/providers/openai';
import type { ChatModelEntry } from '@openpanel/validation';
import z from 'zod';

export type { ChatModelEntry } from '@openpanel/validation';
export { CHAT_MODELS as ALLOWED_MODELS } from '@openpanel/validation';

const openAiEnvSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_PROJECT: z.string().optional(),
  OPENAI_ORGANIZATION: z.string().optional(),
});

const anthropicEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().optional(),
  ANTHROPIC_TOKEN: z.string().optional(),
  ANTHROPIC_VERSION: z.string().optional(),
});

let _openai: ReturnType<typeof createOpenAI> | null = null;
function openai() {
  if (!_openai) {
    const {
      OPENAI_API_KEY,
      OPENAI_BASE_URL,
      OPENAI_PROJECT,
      OPENAI_ORGANIZATION,
    } = openAiEnvSchema.parse(process.env);

    if (!OPENAI_API_KEY) {
      console.warn(
        `[chat] OPENAI_API_KEY is not set. Models routed through OpenAI will fail with "x-api-key required" until you add it to the API's env.`
      );
    }

    _openai = createOpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_BASE_URL,
      project: OPENAI_PROJECT,
      organization: OPENAI_ORGANIZATION,
    });
  }
  return _openai;
}

let _anthropic: ReturnType<typeof createAnthropic> | null = null;
function anthropic() {
  if (!_anthropic) {
    const {
      ANTHROPIC_API_KEY,
      ANTHROPIC_BASE_URL,
      ANTHROPIC_TOKEN,
      ANTHROPIC_VERSION,
    } = anthropicEnvSchema.parse(process.env);

    if (!ANTHROPIC_API_KEY) {
      console.warn(
        `[chat] ANTHROPIC_API_KEY is not set. Models routed through Anthropic will fail with "x-api-key required" until you add it to the API's env.`
      );
    }

    _anthropic = createAnthropic({
      apiKey: ANTHROPIC_API_KEY,
      baseURL: ANTHROPIC_BASE_URL,
      authToken: ANTHROPIC_TOKEN,
      anthropicVersion: ANTHROPIC_VERSION,
    });
  }
  return _anthropic;
}

export const openaiProvider = openai;
export const anthropicProvider = anthropic;

export function resolveModel(entry: ChatModelEntry) {
  switch (entry.group) {
    case 'OpenAI':
      // biome-ignore lint/suspicious/noExplicitAny: OpenAI model id union is open
      return openai().model(entry.modelId as any);
    case 'Anthropic':
      // biome-ignore lint/suspicious/noExplicitAny: Anthropic model id union is open
      return anthropic().model(entry.modelId as any);
  }
}
