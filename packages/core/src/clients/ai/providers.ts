// Ported from @openpanel/ai (dissolved into core — M4-005).
//
// SERVER-ONLY. This module instantiates `@better-agent/providers` clients from
// the credentials the config loader parsed (ADR-022 R9: config in). Never
// value-import it from the browser (apps/start) — import the model
// catalog/types from
// `@openpanel/core/modules/assistant/assistant.constants` instead.
import { createAnthropic } from '@better-agent/providers/anthropic';
import { createOpenAI } from '@better-agent/providers/openai';
import type { CoreConfig } from '../../config';
import type { ChatModelEntry } from '../../modules/assistant/assistant.constants';

export type { ChatModelEntry } from '../../modules/assistant/assistant.constants';
export { CHAT_MODELS as ALLOWED_MODELS } from '../../modules/assistant/assistant.constants';

// One provider client per process, built on first use. The credentials are
// the same object for every caller — `loadConfig` runs once at boot — so the
// memo cannot serve one caller another caller's key.
let _openai: ReturnType<typeof createOpenAI> | null = null;
function openai(config: CoreConfig) {
  if (!_openai) {
    const { apiKey, baseUrl, project, organization } = config.ai.openai;

    if (!apiKey) {
      console.warn(
        `[chat] OPENAI_API_KEY is not set. Models routed through OpenAI will fail with "x-api-key required" until you add it to the API's env.`
      );
    }

    _openai = createOpenAI({
      apiKey,
      baseURL: baseUrl,
      project,
      organization,
    });
  }
  return _openai;
}

let _anthropic: ReturnType<typeof createAnthropic> | null = null;
function anthropic(config: CoreConfig) {
  if (!_anthropic) {
    const { apiKey, baseUrl, authToken, version } = config.ai.anthropic;

    if (!apiKey) {
      console.warn(
        `[chat] ANTHROPIC_API_KEY is not set. Models routed through Anthropic will fail with "x-api-key required" until you add it to the API's env.`
      );
    }

    _anthropic = createAnthropic({
      apiKey,
      baseURL: baseUrl,
      authToken,
      anthropicVersion: version,
    });
  }
  return _anthropic;
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
