import { createAnthropic } from '@better-agent/providers/anthropic';
import { createOpenAI } from '@better-agent/providers/openai';
import { CHAT_MODELS, type ChatModelEntry } from '@openpanel/validation';

export { CHAT_MODELS as ALLOWED_MODELS } from '@openpanel/validation';
export type { ChatModelEntry } from '@openpanel/validation';

function requireEnv(name: string, provider: string): string {
  const value = process.env[name];
  if (!value) {
    console.warn(
      `[chat] ${name} is not set. Models routed through ${provider} will fail with "x-api-key required" until you add it to the API's env.`,
    );
  }
  return value ?? '';
}

let _openai: ReturnType<typeof createOpenAI> | null = null;
function openai() {
  if (!_openai) {
    _openai = createOpenAI({ apiKey: requireEnv('OPENAI_API_KEY', 'OpenAI') });
  }
  return _openai;
}

let _anthropic: ReturnType<typeof createAnthropic> | null = null;
function anthropic() {
  if (!_anthropic) {
    _anthropic = createAnthropic({
      apiKey: requireEnv('ANTHROPIC_API_KEY', 'Anthropic'),
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
