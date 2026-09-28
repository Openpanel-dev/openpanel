// Ported from @openpanel/ai (dissolved into core — M4-005). Moved out of
// `clients/ai/` by M15-008: the assistant is its only consumer, so ADR-022 A2
// puts it in this module's `src/` — which is also what removes its upward edge
// onto `assistant.constants`.
//
// SERVER-ONLY. This module instantiates `@better-agent/providers` clients from
// the credentials the config loader parsed (ADR-022 R9: config in). Never
// value-import it from the browser (apps/start) — import the model
// catalog/types from `@openpanel/core/modules/assistant/assistant.constants`
// instead.
import { createAnthropic } from '@better-agent/providers/anthropic';
import { createOpenAI } from '@better-agent/providers/openai';
import type { CoreConfig } from '../../../config';
import type { ChatModelEntry } from '../assistant.constants';

export type { ChatModelEntry } from '../assistant.constants';
export { CHAT_MODELS as ALLOWED_MODELS } from '../assistant.constants';

// A provider client is memoized per `CoreConfig`, not per process (ADR-022 R16:
// what a thing owns dies with its owner, and nothing outlives the thing that
// opened it). `loadConfig` runs once per boot, so a running API still builds
// each client exactly once; a second config in the same process — a test, a
// second boot — gets a client carrying ITS credentials rather than the first
// config's, and both are collected with the config that produced them.
//
// There is nothing here to close: `createOpenAI`/`createAnthropic` return a
// closure over a base URL and a header set that calls the global `fetch`. They
// hold no socket, so R16's "whoever opens a connection closes it" has no
// connection to name — only a lifetime, which is what the key fixes.
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
