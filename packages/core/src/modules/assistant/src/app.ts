// Tool handlers close over `deps` because @better-agent/core's tool handler
// signature has no context parameter.
import { betterAgent, defineAgent } from '@better-agent/core';
import type { ServiceDeps } from '../../../services';
import { type ChatAgentContext, chatContextSchema } from './context';
import { createConversationStore } from './persistence';
import { buildSystemPrompt } from './prompt';
import {
  ALLOWED_MODELS,
  type ChatModelEntry,
  openaiProvider,
  resolveModel,
} from './providers';
import { composeChatTools } from './tools';

/**
 * One agent per whitelisted model; they differ only in the provider model. The
 * config is `any`-cast because `resolveModel` returns a union and
 * `defineAgent`'s conditional generics fall back to `object`, which strips
 * `instruction` and `tools` from the inferred type. `defineAgent` still
 * validates the definition at runtime.
 */
function createChatAgent(deps: ServiceDeps, entry: ChatModelEntry) {
  return defineAgent({
    name: entry.id,
    description: `OpenPanel chat assistant (${entry.label})`,
    model: resolveModel(deps.config, entry),
    contextSchema: chatContextSchema,
    instruction: (context: ChatAgentContext) => buildSystemPrompt(context),
    tools: (context: ChatAgentContext) => composeChatTools(deps, context),
    maxSteps: 20,
    // Reasoning-capable models need `reasoning.summary` to stream reasoning text.
    ...(entry.reasoning
      ? {
          defaultModelOptions: {
            reasoning: {
              effort: 'medium',
              summary: 'auto',
            },
          },
        }
      : {}),
    // biome-ignore lint/suspicious/noExplicitAny: see block comment above
  } as any);
}

/** Cheap agent that titles a new conversation (3-5 words) after its first turn. */
function createTitlerAgent(deps: ServiceDeps) {
  return defineAgent({
    name: '__titler',
    description: 'Generates concise 3-5 word titles for chat conversations.',
    // biome-ignore lint/suspicious/noExplicitAny: OpenAI model id union is open
    model: openaiProvider(deps.config).model('gpt-4.1-mini' as any),
    instruction:
      'You generate concise 3-5 word titles for chat conversations. Respond with ONLY the title. No quotes, no punctuation, no trailing period.',
    maxSteps: 1,
    // biome-ignore lint/suspicious/noExplicitAny: see block comment on createChatAgent
  } as any);
}

/**
 * The Better Agent app for one unit of work; `.handler` is mounted by
 * `assistant.routes.ts`, which checks auth and project access first.
 */
export function createChatApp(deps: ServiceDeps) {
  return betterAgent({
    agents: [
      ...ALLOWED_MODELS.map((entry) => createChatAgent(deps, entry)),
      createTitlerAgent(deps),
    ],
    persistence: {
      conversations: createConversationStore(deps),
    },
    baseURL: '/ai/agents',
  });
}

export type ChatApp = ReturnType<typeof createChatApp>;
