// Records calls made through the official `openai` client: Chat Completions,
// the Responses API and embeddings, streamed or not. The interfaces below
// describe only the fields read, so any SDK version with these shapes works.

import type { AiModelParameters, AiUsage } from '@openpanel/sdk';
import {
  type CallDescription,
  type CallResult,
  type CreateAdapter,
  definedOnly,
  instrumentCreate,
  type StreamAccumulator,
} from './instrument';
import {
  FILE_PLACEHOLDER,
  type Message,
  type MessagePart,
  toolInput,
} from './messages';
import type { AiIntegrationOptions } from './payload';

interface ContentPart {
  type: string;
  text?: string;
  refusal?: string;
  input_audio?: { format?: string };
}

interface ChatToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface ChatMessage {
  role: string;
  content?: string | ContentPart[] | null;
  refusal?: string | null;
  tool_calls?: ChatToolCall[] | null;
  tool_call_id?: string;
}

interface ChatParams {
  model: string;
  messages: ChatMessage[];
  stream?: boolean | null;
  tools?: {
    type: string;
    function?: { name: string; description?: string; parameters?: unknown };
    custom?: { name: string; description?: string };
  }[];
  temperature?: number | null;
  max_tokens?: number | null;
  max_completion_tokens?: number | null;
  top_p?: number | null;
  frequency_penalty?: number | null;
  presence_penalty?: number | null;
  seed?: number | null;
  stop?: string | string[] | null;
  reasoning_effort?: string | null;
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
  completion_tokens_details?: { reasoning_tokens?: number } | null;
}

interface ChatCompletion {
  model?: string;
  choices?: { message?: ChatMessage; finish_reason?: string | null }[];
  usage?: ChatUsage | null;
}

interface ChatChunk {
  model?: string;
  usage?: ChatUsage | null;
  choices?: {
    index?: number;
    finish_reason?: string | null;
    delta?: {
      content?: string | null;
      refusal?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
}

interface ResponseItem {
  type?: string;
  role?: string;
  content?: string | ContentPart[];
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: unknown;
  summary?: { text?: string }[];
}

interface ResponsesParams {
  model?: string;
  input?: string | ResponseItem[];
  instructions?: string | null;
  stream?: boolean | null;
  tools?: {
    type: string;
    name?: string;
    description?: string | null;
    parameters?: unknown;
  }[];
  temperature?: number | null;
  max_output_tokens?: number | null;
  top_p?: number | null;
  reasoning?: { effort?: string | null } | null;
}

interface ResponseObject {
  model?: string;
  status?: string;
  output?: ResponseItem[];
  incomplete_details?: { reason?: string } | null;
  error?: { code?: string; message?: string } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number } | null;
    output_tokens_details?: { reasoning_tokens?: number } | null;
  } | null;
}

interface ResponseStreamEvent {
  type?: string;
  response?: ResponseObject;
  delta?: string;
  output_index?: number;
  content_index?: number;
}

interface EmbeddingParams {
  model: string;
  input: unknown;
}

interface EmbeddingResponse {
  model?: string;
  usage?: { prompt_tokens?: number } | null;
}

/** The resources wrapped; each is optional so a partial or older client still works. */
interface OpenAIClient {
  chat?: { completions?: unknown };
  responses?: unknown;
  embeddings?: unknown;
}

const PROVIDER = 'openai';

const CHAT_STOP_REASONS: Record<string, string> = {
  stop: 'stop',
  length: 'length',
  tool_calls: 'tool-calls',
  function_call: 'tool-calls',
  content_filter: 'content-filter',
};

const INCOMPLETE_STOP_REASONS: Record<string, string> = {
  max_output_tokens: 'length',
  content_filter: 'content-filter',
};

const FINAL_RESPONSE_EVENTS = new Set([
  'response.completed',
  'response.incomplete',
  'response.failed',
]);
const RESPONSE_CREATED_EVENT = 'response.created';
const DELTA_EVENT_SUFFIX = '.delta';
const OUTPUT_TEXT_DELTA_EVENT = 'response.output_text.delta';

function contentPart(part: ContentPart): MessagePart {
  switch (part.type) {
    case 'text':
    case 'input_text':
    case 'output_text':
      return { type: 'text', text: part.text };
    case 'refusal':
      return { type: 'text', text: part.refusal };
    case 'image_url':
    case 'input_image':
      return { type: 'file', mediaType: 'image', data: FILE_PLACEHOLDER };
    case 'input_audio':
      return {
        type: 'file',
        mediaType: `audio/${part.input_audio?.format ?? '*'}`,
        data: FILE_PLACEHOLDER,
      };
    case 'file':
    case 'input_file':
      return { type: 'file', data: FILE_PLACEHOLDER };
    default:
      return { type: part.type };
  }
}

function toolCallPart(call: {
  id?: string;
  name?: string;
  arguments?: string;
}): MessagePart {
  return {
    type: 'tool_call',
    toolCallId: call.id,
    toolName: call.name,
    input: toolInput(call.arguments),
  };
}

function textOf(content: ChatMessage['content']): string | undefined {
  if (typeof content === 'string') {
    return content;
  }
  return content?.map((part) => part.text ?? '').join('');
}

function chatMessage(message: ChatMessage): Message {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: [
        {
          type: 'tool_result',
          toolCallId: message.tool_call_id,
          output: textOf(message.content),
        },
      ],
    };
  }
  const toolCalls = (message.tool_calls ?? []).map((call) =>
    toolCallPart({
      id: call.id,
      name: call.function?.name,
      arguments: call.function?.arguments,
    })
  );
  const refusal: MessagePart[] = message.refusal
    ? [{ type: 'text', text: message.refusal }]
    : [];
  const isPlainText =
    typeof message.content === 'string' &&
    toolCalls.length === 0 &&
    refusal.length === 0;
  if (isPlainText) {
    return { role: message.role, content: message.content as string };
  }
  const parts =
    typeof message.content === 'string'
      ? [{ type: 'text', text: message.content }]
      : (message.content ?? []).map(contentPart);
  return { role: message.role, content: [...parts, ...refusal, ...toolCalls] };
}

function chatUsage(usage: ChatUsage | null | undefined): AiUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    cacheReadTokens: usage.prompt_tokens_details?.cached_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
  };
}

function chatStopReason(reason: string | null | undefined): string | undefined {
  return reason ? (CHAT_STOP_REASONS[reason] ?? 'other') : undefined;
}

function stopSequences(stop: ChatParams['stop']): string[] | undefined {
  if (!stop) {
    return undefined;
  }
  return typeof stop === 'string' ? [stop] : stop;
}

function chatTools(tools: ChatParams['tools']): unknown[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => {
    const definition = tool.function ?? tool.custom;
    return {
      type: tool.type,
      name: definition?.name,
      description: definition?.description,
      inputSchema: tool.function?.parameters,
    };
  });
}

class ChatStreamAccumulator implements StreamAccumulator {
  private text = '';
  private refusal = '';
  private readonly toolCalls = new Map<number, Required<ChatToolCall>>();
  private finishReason: string | null | undefined;
  private model: string | undefined;
  private usage: ChatUsage | null | undefined;

  observe(value: unknown): boolean {
    const chunk = value as ChatChunk;
    this.model = chunk.model ?? this.model;
    this.usage = chunk.usage ?? this.usage;
    // Only the first choice is kept, as for a streamed `n: 1` request.
    const choice = chunk.choices?.find((entry) => (entry.index ?? 0) === 0);
    if (!choice) {
      return false;
    }
    this.finishReason = choice.finish_reason ?? this.finishReason;
    const delta = choice.delta;
    this.text += delta?.content ?? '';
    this.refusal += delta?.refusal ?? '';
    for (const call of delta?.tool_calls ?? []) {
      const entry = this.toolCalls.get(call.index) ?? {
        id: '',
        function: { name: '', arguments: '' },
      };
      entry.id ||= call.id ?? '';
      entry.function.name ||= call.function?.name ?? '';
      entry.function.arguments += call.function?.arguments ?? '';
      this.toolCalls.set(call.index, entry);
    }
    return Boolean(
      delta?.content || delta?.refusal || delta?.tool_calls?.length
    );
  }

  result(): CallResult {
    const message: ChatMessage = {
      role: 'assistant',
      content: this.text || null,
      refusal: this.refusal || null,
      tool_calls: [...this.toolCalls.values()],
    };
    return {
      output: [chatMessage(message)],
      usage: chatUsage(this.usage),
      model: this.model,
      stopReason: chatStopReason(this.finishReason),
    };
  }
}

const chatCompletions: CreateAdapter = {
  describe(value): CallDescription {
    const params = value as ChatParams;
    return {
      model: params.model,
      provider: PROVIDER,
      stream: params.stream === true,
      input: params.messages.map(chatMessage),
      tools: chatTools(params.tools),
      modelParameters: definedOnly<AiModelParameters>({
        temperature: params.temperature ?? undefined,
        maxTokens:
          params.max_completion_tokens ?? params.max_tokens ?? undefined,
        topP: params.top_p ?? undefined,
        frequencyPenalty: params.frequency_penalty ?? undefined,
        presencePenalty: params.presence_penalty ?? undefined,
        seed: params.seed ?? undefined,
        stopSequences: stopSequences(params.stop),
        reasoningEffort: params.reasoning_effort ?? undefined,
      }),
    };
  },
  result(value): CallResult {
    const completion = value as ChatCompletion;
    return {
      output: (completion.choices ?? []).flatMap((choice) =>
        choice.message ? [chatMessage(choice.message)] : []
      ),
      usage: chatUsage(completion.usage),
      model: completion.model,
      stopReason: chatStopReason(completion.choices?.[0]?.finish_reason),
    };
  },
  accumulator: () => new ChatStreamAccumulator(),
};

function itemParts(item: ResponseItem): MessagePart[] {
  switch (item.type) {
    case 'function_call':
      return [
        toolCallPart({
          id: item.call_id,
          name: item.name,
          arguments: item.arguments,
        }),
      ];
    case 'function_call_output':
      return [
        { type: 'tool_result', toolCallId: item.call_id, output: item.output },
      ];
    case 'reasoning':
      return (item.summary ?? []).map((summary) => ({
        type: 'reasoning',
        text: summary.text,
      }));
    case undefined:
    case 'message':
      return typeof item.content === 'string'
        ? [{ type: 'text', text: item.content }]
        : (item.content ?? []).map(contentPart);
    default:
      return [{ type: item.type }];
  }
}

function itemRole(item: ResponseItem): string {
  if (item.type === 'function_call_output') {
    return 'tool';
  }
  return item.role ?? 'assistant';
}

function responsesInput(params: ResponsesParams): Message[] {
  const instructions: Message[] = params.instructions
    ? [{ role: 'system', content: params.instructions }]
    : [];
  if (typeof params.input === 'string') {
    return [...instructions, { role: 'user', content: params.input }];
  }
  const items = (params.input ?? []).map((item) => {
    const isPlainText =
      typeof item.content === 'string' &&
      (item.type === undefined || item.type === 'message');
    return {
      role: itemRole(item),
      content: isPlainText ? (item.content as string) : itemParts(item),
    };
  });
  return [...instructions, ...items];
}

function responsesStopReason(response: ResponseObject): string | undefined {
  switch (response.status) {
    case 'failed':
      return 'error';
    case 'incomplete':
      return (
        INCOMPLETE_STOP_REASONS[response.incomplete_details?.reason ?? ''] ??
        'other'
      );
    case 'completed':
      return response.output?.some((item) => item.type === 'function_call')
        ? 'tool-calls'
        : 'stop';
    default:
      return response.status;
  }
}

function responsesError(response: ResponseObject): Error | undefined {
  if (!response.error) {
    return undefined;
  }
  const error = new Error(response.error.message ?? 'response failed');
  error.name = response.error.code ?? error.name;
  return error;
}

function responsesResult(response: ResponseObject): CallResult {
  const output = (response.output ?? []).flatMap(itemParts);
  const usage = response.usage;
  return {
    output: output.length > 0 ? [{ role: 'assistant', content: output }] : [],
    usage: usage
      ? {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheReadTokens: usage.input_tokens_details?.cached_tokens,
          reasoningTokens: usage.output_tokens_details?.reasoning_tokens,
        }
      : undefined,
    model: response.model,
    stopReason: responsesStopReason(response),
    error: responsesError(response),
  };
}

/**
 * The final `response.*` event carries the whole response. Text deltas are
 * kept only for a stream the caller stops reading before that event.
 */
class ResponsesStreamAccumulator implements StreamAccumulator {
  private model: string | undefined;
  private response: ResponseObject | undefined;
  /** Text per output item and content part, so separate parts don't run together. */
  private readonly partialText = new Map<
    string,
    { item: number; part: number; text: string }
  >();

  observe(value: unknown): boolean {
    const event = value as ResponseStreamEvent;
    const type = event.type ?? '';
    if (type === RESPONSE_CREATED_EVENT) {
      this.model = event.response?.model;
    }
    if (FINAL_RESPONSE_EVENTS.has(type)) {
      this.response = event.response;
    }
    if (type === OUTPUT_TEXT_DELTA_EVENT) {
      this.addPartialText(event);
    }
    return type.endsWith(DELTA_EVENT_SUFFIX);
  }

  private addPartialText(event: ResponseStreamEvent): void {
    if (!event.delta) {
      return;
    }
    const item = event.output_index ?? 0;
    const part = event.content_index ?? 0;
    const key = `${item}:${part}`;
    const previous = this.partialText.get(key)?.text ?? '';
    this.partialText.set(key, { item, part, text: previous + event.delta });
  }

  result(): CallResult {
    if (this.response) {
      return responsesResult(this.response);
    }
    const parts = [...this.partialText.values()]
      .sort((a, b) => a.item - b.item || a.part - b.part)
      .map(({ text }): MessagePart => ({ type: 'text', text }));
    const output: Message[] =
      parts.length > 0 ? [{ role: 'assistant', content: parts }] : [];
    return { model: this.model, output };
  }
}

const responses: CreateAdapter = {
  describe(value): CallDescription {
    const params = value as ResponsesParams;
    return {
      model: params.model ?? '',
      provider: PROVIDER,
      stream: params.stream === true,
      input: responsesInput(params),
      tools: params.tools?.length
        ? params.tools.map((tool) => ({
            type: tool.type,
            name: tool.name,
            description: tool.description ?? undefined,
            inputSchema: tool.parameters,
          }))
        : undefined,
      modelParameters: definedOnly<AiModelParameters>({
        temperature: params.temperature ?? undefined,
        maxTokens: params.max_output_tokens ?? undefined,
        topP: params.top_p ?? undefined,
        reasoningEffort: params.reasoning?.effort ?? undefined,
      }),
    };
  },
  result: (value) => responsesResult(value as ResponseObject),
  accumulator: () => new ResponsesStreamAccumulator(),
};

/** Token-id inputs are not text, so only string inputs are kept. */
function embeddedTexts(input: unknown): string[] | undefined {
  const values = Array.isArray(input) ? input : [input];
  const texts = values.filter(
    (value): value is string => typeof value === 'string'
  );
  return texts.length > 0 ? texts : undefined;
}

const embeddings: CreateAdapter = {
  describe(value): CallDescription {
    const params = value as EmbeddingParams;
    return {
      kind: 'embedding',
      model: params.model,
      provider: PROVIDER,
      stream: false,
      input: embeddedTexts(params.input),
    };
  },
  result(value): CallResult {
    const response = value as EmbeddingResponse;
    return {
      model: response.model,
      usage: response.usage
        ? { inputTokens: response.usage.prompt_tokens ?? 0, outputTokens: 0 }
        : undefined,
    };
  },
};

/**
 * Records every Chat Completions, Responses and embeddings call made through
 * an `openai` client as an OpenPanel AI event, streamed or not, including
 * the SDK's own helpers (`parse`, `stream`, `runTools`):
 *
 *   const openai = wrapOpenAI(new OpenAI(), { op });
 *
 * The client is instrumented in place and returned. Per-request context
 * (user, conversation, name) comes from `withAiContext`.
 */
export function wrapOpenAI<Client extends object>(
  client: Client,
  options: AiIntegrationOptions
): Client {
  const resources = client as OpenAIClient;
  instrumentCreate(resources.chat?.completions, chatCompletions, options);
  instrumentCreate(resources.responses, responses, options);
  instrumentCreate(resources.embeddings, embeddings, options);
  return client;
}
