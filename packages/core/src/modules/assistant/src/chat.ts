import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
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
import type { AssistantUIMessage } from './message';
import { deleteMessagesFrom, loadMessages, saveMessages } from './persistence';
import { buildSystemPrompt } from './prompt';
import {
  configuredProviders,
  reasoningProviderOptions,
  resolveChatModel,
} from './providers';
import { generateConversationTitle } from './title';
import { CHAT_TOOL_APPROVAL, createChatTools } from './tools';

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

/** One chat turn: load history, run the model with tools, stream UI parts, persist on finish. */
export async function runChat(
  deps: ServiceDeps,
  input: RunChatInput
): Promise<Response> {
  const { request, httpCtx } = input;
  const config = deps.config;
  const providers = configuredProviders(config);
  const available = getAvailableChatModels(providers);
  const requested = CHAT_MODELS.find((model) => model.id === request.modelId);
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
          hint: request.hint,
        }),
        messages: modelMessages,
        tools,
        toolApproval: CHAT_TOOL_APPROVAL,
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
              return {
                totalTokens: part.totalUsage.totalTokens,
                durationMs: Date.now() - startedAt,
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
      const toSave: AssistantUIMessage[] = [];
      if (incoming?.role === 'user') {
        toSave.push({
          ...incoming,
          metadata: { ...incoming.metadata, createdAt: startedAt },
        });
      }
      toSave.push(responseMessage);
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
