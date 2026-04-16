import { createOpenAI } from '@better-agent/providers/openai';
import { CHAT_MODELS, type ChatModelEntry } from '@openpanel/validation';

export { CHAT_MODELS as ALLOWED_MODELS, DEFAULT_MODEL_ID } from '@openpanel/validation';
export type { ChatModelEntry } from '@openpanel/validation';

// ────────────────────────────────────────────────────────────────────
// Provider clients (lazy-built singletons)
// ────────────────────────────────────────────────────────────────────

function requireEnv(name: string, provider: string): string {
  const value = process.env[name];
  if (!value) {
    // Don't throw here — the agent is built eagerly at import time and
    // we still want startup to succeed so the user can pick a model
    // whose key IS set. We throw when the agent actually runs.
    console.warn(
      `[chat] ${name} is not set. Models routed through ${provider} will fail with "x-api-key required" until you add it to the API's env.`,
    );
  }
  return value ?? '';
}

let _openai: ReturnType<typeof createOpenAI> | null = null;
function openai() {
  if (!_openai) {
    _openai = createOpenAI({
      apiKey: requireEnv('OPENAI_API_KEY', 'OpenAI'),
    });
  }
  return _openai;
}

/**
 * Exposed for the titler agent in `app.ts`. Same singleton as the one
 * used by the chat agents so we don't duplicate API-key wiring.
 */
export const openaiProvider = openai;

/**
 * Resolve a model entry to the provider's model instance.
 * Used by the agent factory.
 *
 * NB: Anthropic support has been removed. Re-add `createAnthropic`
 * from `@better-agent/providers/anthropic` + a switch arm here when
 * an Anthropic model is added to the whitelist.
 */
export function resolveModel(entry: ChatModelEntry) {
  switch (entry.group) {
    case 'OpenAI':
      // biome-ignore lint/suspicious/noExplicitAny: OpenAI model id union is open
      return openai().model(entry.modelId as any);
  }
}
