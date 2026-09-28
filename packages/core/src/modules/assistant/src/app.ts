// The app is BUILT from the `deps` `assistant.routes.ts` already holds, not
// constructed at module scope (R15). Importing this file now opens nothing — no
// provider client, no agent, no conversation store — and every tool handler
// closes over the same `deps`, which is what `@better-agent/core`'s
// context-free tool-handler signature ruled out doing as an argument.
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
 * Create one agent per model in the whitelist. All agents share the
 * same context schema, instruction builder, and dynamic tool composer
 * — they only differ by which provider model runs the conversation.
 *
 * The frontend "model picker" is an "agent picker" in disguise: it
 * just selects which agent name to pass to `useAgent()`.
 *
 * The whole config is `any`-cast because `resolveModel` returns a
 * union of provider model types, and `defineAgent`'s conditional
 * generics (`InstructionEnabled`, `DefineAgentToolFields`) can't
 * narrow over the union — they fall back to `object`, which strips
 * the `instruction` and `tools` fields from the inferred config type.
 * All providers in our whitelist support both at runtime; the cast
 * just sidesteps the TS narrowing limit. `defineAgent` itself runs
 * a runtime `validateAgentDefinition` check so misconfigurations
 * still throw at startup.
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
    // Reasoning-capable models (gpt-5.x / o-series) need the
    // `reasoning.summary` option to stream reasoning text back; the
    // client's REASONING_MESSAGE_* events feed our `ReasoningBlock`
    // UI. Non-reasoning models skip this block entirely.
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

/**
 * Dedicated cheap agent for generating 3-5 word conversation titles.
 * Called fire-and-forget by the route after the first turn of a new
 * conversation completes.
 */
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
 * The Better Agent app for one unit of work. Exposes a `.handler` that
 * `assistant.routes.ts` calls under `/ai/agents/*`. Holds:
 *   - one agent per allowed model
 *   - the Prisma-backed conversation store for persistence
 *   - a dedicated titler agent for conversation titles
 *
 * Auth + project-access are enforced by `assistant.routes.ts` before this
 * handler runs.
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
