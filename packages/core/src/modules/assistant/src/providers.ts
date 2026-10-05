// Server-only: browser code imports the model catalog from `assistant.constants`.
import { createAnthropic } from '@better-agent/providers/anthropic';
import { createOpenAI } from '@better-agent/providers/openai';
import type { CoreConfig } from '../../../config';
import type { ChatModelEntry } from '../assistant.constants';

export type { ChatModelEntry } from '../assistant.constants';
export { CHAT_MODELS as ALLOWED_MODELS } from '../assistant.constants';

// Memoized per `CoreConfig`, so a second config in one process (a test, a
// reboot) gets clients with its own credentials. Nothing to close: the clients
// are closures over `fetch` and hold no socket.
const openaiClients = new WeakMap<
  CoreConfig,
  ReturnType<typeof createOpenAI>
>();

function openai(config: CoreConfig) {
  const memoized = openaiClients.get(config);
  if (memoized) {
    return memoized;
  }

  const { apiKey, baseUrl, project, organization } = config.ai.openai;

  if (!apiKey) {
    console.warn(
      `[chat] OPENAI_API_KEY is not set. Models routed through OpenAI will fail with "x-api-key required" until you add it to the API's env.`
    );
  }

  const client = createOpenAI({
    apiKey,
    baseURL: baseUrl,
    project,
    organization,
  });
  openaiClients.set(config, client);
  return client;
}

const anthropicClients = new WeakMap<
  CoreConfig,
  ReturnType<typeof createAnthropic>
>();

function anthropic(config: CoreConfig) {
  const memoized = anthropicClients.get(config);
  if (memoized) {
    return memoized;
  }

  const { apiKey, baseUrl, authToken, version } = config.ai.anthropic;

  if (!apiKey) {
    console.warn(
      `[chat] ANTHROPIC_API_KEY is not set. Models routed through Anthropic will fail with "x-api-key required" until you add it to the API's env.`
    );
  }

  const client = createAnthropic({
    apiKey,
    baseURL: baseUrl,
    authToken,
    anthropicVersion: version,
  });
  anthropicClients.set(config, client);
  return client;
}

export const openaiProvider = openai;
export const anthropicProvider = anthropic;

export function resolveModel(config: CoreConfig, entry: ChatModelEntry) {
  switch (entry.group) {
    case 'OpenAI':
      // biome-ignore lint/suspicious/noExplicitAny: OpenAI model id union is open
      return openai(config).model(entry.modelId as any);
    case 'Anthropic':
      // biome-ignore lint/suspicious/noExplicitAny: Anthropic model id union is open
      return anthropic(config).model(entry.modelId as any);
  }
}
