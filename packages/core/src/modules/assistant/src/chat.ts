import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type Tool,
  toUIMessageStream,
} from 'ai';
import type { HttpCtx } from '../../../context';
import type { ServiceDeps } from '../../../services';
import {
  CHAT_MODELS,
  type ChatRequest,
  getAvailableChatModels,
  getDefaultChatModelId,
} from '../assistant.constants';
import { createChatActions } from './actions';
import type { ChatToolContext } from './context';
import { failInterruptedToolParts } from './interrupted-tools';
import type { AssistantUIMessage } from './message';
import { deleteMessagesFrom, loadMessages, saveMessages } from './persistence';
import { buildSystemPrompt } from './prompt';
import {
  configuredProviders,
  reasoningProviderOptions,
  resolveChatModel,
} from './providers';
import { generateConversationTitle } from './title';
import { createChatToolApproval, createChatTools } from './tools';

/** Dashboard-building turns chain many tool calls; the ceiling stops runaway loops. */
const MAX_STEPS = 30;
const MESSAGE_ID_PREFIX = 'msg';
const MESSAGE_ID_SIZE = 16;

export interface RunChatInput {
  httpCtx: HttpCtx;
  request: ChatRequest;
  userId: string;
  timezone: string;
  projectName: string;
  abortSignal?: AbortSignal;
}

function firstUserText(message: AssistantUIMessage | undefined): string {
  if (!message || message.role !== 'user') {
    return '';
  }
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim();
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Something went wrong.';
}

/** An abort right after the model started leaves only a step marker or an empty text part. */
function isSubstantive(part: AssistantUIMessage['parts'][number]): boolean {
  if (part.type === 'step-start') {
    return false;
  }
  if (part.type === 'text' || part.type === 'reasoning') {
    return part.text.trim().length > 0;
  }
  return true;
}

/** One chat turn: load history, run the model with tools, stream UI parts, persist on finish. */
export async function runChat(
  deps: ServiceDeps,
  input: RunChatInput
): Promise<Response> {
  const { request, httpCtx } = input;
  const config = deps.config;
  const providers = configuredProviders(config);
  const available = getAvailableChatModels(providers);
  // Cloud runs the one vetted model; only a self-hosted install may pick another.
  const requested = config.selfHosted
    ? CHAT_MODELS.find((model) => model.id === request.modelId)
    : undefined;
  const entry =
    requested && available.some((model) => model.id === requested.id)
      ? requested
      : available.find(
          (model) => model.id === getDefaultChatModelId(providers)
        );
  if (!entry) {
    return Response.json(
      { message: 'No AI provider is configured on the API.' },
      { status: 503 }
    );
  }

  const incoming = request.message as AssistantUIMessage | undefined;
  let history = await loadMessages(deps, request.id);
  if (request.trigger === 'regenerate-message' && request.messageId) {
    const index = history.findIndex(
      (message) => message.id === request.messageId
    );
    if (index >= 0) {
      history = history.slice(0, index);
      await deleteMessagesFrom(deps, request.id, request.messageId);
    }
  }
  // A turn cut off mid tool call stores calls without results, and the model
  // refuses such a history outright. Repaired rows are written back on finish.
  const repaired = new Map<string, AssistantUIMessage>();
  history = history.map((message) => {
    const fixed = failInterruptedToolParts(message);
    if (fixed !== message && message.id !== incoming?.id) {
      repaired.set(message.id, fixed);
    }
    return fixed;
  });
  if (incoming) {
    const existing = history.findIndex((message) => message.id === incoming.id);
    history =
      existing >= 0
        ? history.map((message) =>
            message.id === incoming.id ? incoming : message
          )
        : [...history, incoming];
  }

  const isFirstTurn =
    incoming?.role === 'user' &&
    history.filter((message) => message.role === 'user').length === 1;

  const toolContext: ChatToolContext = {
    deps,
    config,
    projectId: request.projectId,
    organizationId: request.organizationId,
    userId: input.userId,
    projectName: input.projectName,
    timezone: input.timezone,
    hint: request.hint,
    actions: await createChatActions(httpCtx),
  };
  const tools = createChatTools(toolContext);
  const runsInBrowser = (toolName: string) =>
    (tools as Record<string, Tool | undefined>)[toolName]?.execute == null;
  const modelMessages = await convertToModelMessages(history, { tools });
  const startedAt = Date.now();
  let title: string | null = null;

  const stream = createUIMessageStream<AssistantUIMessage>({
    originalMessages: history,
    generateId: createIdGenerator({
      prefix: MESSAGE_ID_PREFIX,
      size: MESSAGE_ID_SIZE,
    }),
    execute: async ({ writer }) => {
      const titlePromise = isFirstTurn
        ? generateConversationTitle(config, firstUserText(incoming)).then(
            (generated) => {
              if (generated) {
                title = generated;
                writer.write({
                  type: 'data-title',
                  data: { title: generated },
                  transient: true,
                });
              }
            }
          )
        : Promise.resolve();

      const result = streamText({
        model: resolveChatModel(config, entry),
        instructions: buildSystemPrompt({
          projectName: input.projectName,
          timezone: input.timezone,
          selfHosted: config.selfHosted,
          hint: request.hint,
        }),
        messages: modelMessages,
        tools,
        toolApproval: createChatToolApproval(toolContext),
        stopWhen: isStepCount(MAX_STEPS),
        reasoning: entry.reasoning,
        providerOptions: reasoningProviderOptions(entry),
        abortSignal: input.abortSignal,
      });

      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          sendReasoning: true,
          onError: describeError,
          messageMetadata: ({ part }) => {
            if (part.type === 'start') {
              return { modelId: entry.id, createdAt: startedAt };
            }
            if (part.type === 'finish') {
              const durationMs = Date.now() - startedAt;
              deps.logger.info(
                {
                  conversationId: request.id,
                  organizationId: request.organizationId,
                  projectId: request.projectId,
                  userId: input.userId,
                  modelId: entry.id,
                  // Keys avoid "token": the log redaction masks any key containing it.
                  usage: {
                    input: part.totalUsage.inputTokens,
                    output: part.totalUsage.outputTokens,
                    total: part.totalUsage.totalTokens,
                  },
                  durationMs,
                },
                'chat turn finished'
              );
              return {
                totalTokens: part.totalUsage.totalTokens,
                durationMs,
              };
            }
            return undefined;
          },
        })
      );

      await titlePromise;
    },
    onError: describeError,
    onEnd: async ({ responseMessage }) => {
      const toSave: AssistantUIMessage[] = [...repaired.values()];
      if (incoming?.role === 'user') {
        toSave.push({
          ...incoming,
          metadata: { ...incoming.metadata, createdAt: startedAt },
        });
      }
      // An aborted turn ends with server tools still running; a client tool
      // is meant to end the stream and wait for the browser.
      const response = failInterruptedToolParts(responseMessage, runsInBrowser);
      if (response.parts.some(isSubstantive)) {
        toSave.push(response);
      }
      if (toSave.length === 0) {
        return;
      }
      await saveMessages(deps, {
        conversationId: request.id,
        projectId: request.projectId,
        organizationId: request.organizationId,
        userId: input.userId,
        messages: toSave,
        title,
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
