// Server-only: the browser reads the catalog from `assistant.constants`.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel, streamText } from 'ai';
import type { CoreConfig } from '../../../config';
import type {
  ChatModelEntry,
  ChatProvider,
  ConfiguredProviders,
} from '../assistant.constants';

/** Cheap models for titles and the one-shot filter command. */
const UTILITY_MODEL_BY_PROVIDER = {
  openai: 'gpt-5.4-nano',
  anthropic: 'claude-haiku-5-5',
} as const satisfies Record<ChatProvider, string>;

// Memoized per `CoreConfig`, so a second config in one process (a test, a
// reboot) gets clients with its own credentials.
const openaiClients = new WeakMap<
  CoreConfig,
  ReturnType<typeof createOpenAI>
>();
const anthropicClients = new WeakMap<
  CoreConfig,
  ReturnType<typeof createAnthropic>
>();

function openai(config: CoreConfig) {
  const memoized = openaiClients.get(config);
  if (memoized) {
    return memoized;
  }
  const { apiKey, baseUrl, project, organization } = config.ai.openai;
  const client = createOpenAI({
    apiKey,
    baseURL: baseUrl,
    project,
    organization,
  });
  openaiClients.set(config, client);
  return client;
}

function anthropic(config: CoreConfig) {
  const memoized = anthropicClients.get(config);
  if (memoized) {
    return memoized;
  }
  const { apiKey, baseUrl, authToken } = config.ai.anthropic;
  const client = createAnthropic({ apiKey, baseURL: baseUrl, authToken });
  anthropicClients.set(config, client);
  return client;
}

export function configuredProviders(config: CoreConfig): ConfiguredProviders {
  return {
    openai: Boolean(config.ai.openai.apiKey),
    anthropic: Boolean(config.ai.anthropic.apiKey),
  };
}

function modelFor(
  config: CoreConfig,
  provider: ChatProvider,
  modelId: string
): LanguageModel {
  return provider === 'openai'
    ? openai(config)(modelId)
    : anthropic(config)(modelId);
}

export function resolveChatModel(
  config: CoreConfig,
  entry: ChatModelEntry
): LanguageModel {
  return modelFor(config, entry.provider, entry.modelId);
}

/** The cheapest configured model, for titles and the filter command. */
export function resolveUtilityModel(config: CoreConfig): LanguageModel | null {
  const providers = configuredProviders(config);
  if (providers.openai) {
    return modelFor(config, 'openai', UTILITY_MODEL_BY_PROVIDER.openai);
  }
  if (providers.anthropic) {
    return modelFor(config, 'anthropic', UTILITY_MODEL_BY_PROVIDER.anthropic);
  }
  return null;
}

type ProviderOptions = NonNullable<
  Parameters<typeof streamText>[0]['providerOptions']
>;

/** Reasoning summaries are off by default on both providers; the chat shows them. */
export function reasoningProviderOptions(
  entry: ChatModelEntry
): ProviderOptions {
  if (entry.provider === 'openai') {
    return { openai: { reasoningSummary: 'auto' as const } };
  }
  return {
    anthropic: {
      thinking: { type: 'adaptive' as const, display: 'summarized' as const },
    },
  };
}

/** OpenAI model ids the one-shot generators (digests, insights, win-back) pin to. */
export const OPENAI_TASK_MODELS = {
  /** Cheap batch scoring and short copy. */
  small: 'gpt-5.4-mini',
  /** Synthesis over a supplied breakdown. */
  standard: 'gpt-6.1-sol',
} as const;

export function resolveOpenAITaskModel(
  config: CoreConfig,
  size: keyof typeof OPENAI_TASK_MODELS
): LanguageModel {
  if (!config.ai.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  return modelFor(config, 'openai', OPENAI_TASK_MODELS[size]);
}
