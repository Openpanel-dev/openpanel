// Records calls made through the official `@anthropic-ai/sdk` client (and the
// Bedrock and Vertex clients built on it): `messages.create`, streamed or not,
// and `beta.messages.create`. The interfaces below describe only the fields
// read, so any SDK version with these shapes works.

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

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  source?: { media_type?: string };
}

interface MessageParam {
  role: string;
  content: string | ContentBlock[];
}

interface MessagesParams {
  model: string;
  messages: MessageParam[];
  system?: string | ContentBlock[];
  stream?: boolean;
  tools?: {
    type?: string;
    name: string;
    description?: string;
    input_schema?: unknown;
  }[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
}

interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

interface MessageResponse {
  model?: string;
  content?: ContentBlock[];
  stop_reason?: string | null;
  usage?: Usage;
}

interface StreamEvent {
  type: string;
  index?: number;
  message?: MessageResponse;
  content_block?: ContentBlock;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string | null;
  };
  usage?: Usage;
}

/** The resources wrapped; each is optional so a partial or older client still works. */
interface AnthropicClient {
  messages?: unknown;
  beta?: { messages?: unknown };
}

const PROVIDER = 'anthropic';

const STOP_REASONS: Record<string, string> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
  tool_use: 'tool-calls',
  refusal: 'content-filter',
};

const TOOL_CALL_BLOCKS = new Set(['tool_use', 'server_tool_use']);

function blockPart(block: ContentBlock): MessagePart {
  if (TOOL_CALL_BLOCKS.has(block.type)) {
    return {
      type: 'tool_call',
      toolCallId: block.id,
      toolName: block.name,
      input: block.input,
    };
  }
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'thinking':
      return { type: 'reasoning', text: block.thinking };
    case 'redacted_thinking':
      return { type: 'reasoning' };
    case 'tool_result':
      return {
        type: 'tool_result',
        toolCallId: block.tool_use_id,
        output:
          typeof block.content === 'string'
            ? block.content
            : block.content?.map(blockPart),
      };
    case 'image':
    case 'document':
      return {
        type: 'file',
        mediaType: block.source?.media_type,
        data: FILE_PLACEHOLDER,
      };
    default:
      return { type: block.type };
  }
}

function toMessage(role: string, content: string | ContentBlock[]): Message {
  return {
    role,
    content: typeof content === 'string' ? content : content.map(blockPart),
  };
}

/** Anthropic counts cached tokens apart from `input_tokens`; OpenPanel's input total includes them. */
function usageOf(usage: Usage | undefined): AiUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const cacheRead = usage.cache_read_input_tokens ?? undefined;
  const cacheWrite = usage.cache_creation_input_tokens ?? undefined;
  return {
    inputTokens:
      (usage.input_tokens ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0),
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  };
}

function stopReasonOf(reason: string | null | undefined): string | undefined {
  return reason ? (STOP_REASONS[reason] ?? 'other') : undefined;
}

function resultOf(message: MessageResponse): CallResult {
  const content = message.content ?? [];
  return {
    output: content.length > 0 ? [toMessage('assistant', content)] : [],
    usage: usageOf(message.usage),
    model: message.model,
    stopReason: stopReasonOf(message.stop_reason),
  };
}

/** Rebuilds the final message from stream events, the way the SDK's `MessageStream` does. */
class MessagesStreamAccumulator implements StreamAccumulator {
  private message: MessageResponse = {};
  private readonly blocks: ContentBlock[] = [];
  private readonly toolInputs = new Map<number, string>();

  observe(value: unknown): boolean {
    const event = value as StreamEvent;
    const index = event.index ?? 0;
    switch (event.type) {
      case 'message_start':
        this.message = { ...event.message };
        return false;
      case 'content_block_start':
        // A block opens empty; the first token is its first delta.
        if (event.content_block) {
          this.blocks[index] = { ...event.content_block };
        }
        return false;
      case 'content_block_delta':
        this.applyDelta(index, event.delta);
        return true;
      case 'message_delta':
        this.message.stop_reason =
          event.delta?.stop_reason ?? this.message.stop_reason;
        this.message.usage = this.mergeUsage(event.usage);
        return false;
      default:
        return false;
    }
  }

  private applyDelta(index: number, delta: StreamEvent['delta']): void {
    const block = this.blocks[index];
    if (!(block && delta)) {
      return;
    }
    if (delta.text !== undefined) {
      block.text = (block.text ?? '') + delta.text;
    }
    if (delta.thinking !== undefined) {
      block.thinking = (block.thinking ?? '') + delta.thinking;
    }
    if (delta.partial_json !== undefined) {
      this.toolInputs.set(
        index,
        (this.toolInputs.get(index) ?? '') + delta.partial_json
      );
    }
  }

  /** `message_delta` usage is cumulative; a field it leaves out keeps its `message_start` value. */
  private mergeUsage(usage: Usage | undefined): Usage | undefined {
    if (!usage) {
      return this.message.usage;
    }
    const updates = Object.fromEntries(
      Object.entries(usage).filter(([, count]) => count !== null)
    );
    return { ...this.message.usage, ...updates };
  }

  result(): CallResult {
    const content = this.blocks.flatMap((block, index) => {
      if (!block) {
        return [];
      }
      const json = this.toolInputs.get(index);
      return [
        json === undefined ? block : { ...block, input: toolInput(json) },
      ];
    });
    return resultOf({ ...this.message, content });
  }
}

const messages: CreateAdapter = {
  describe(value): CallDescription {
    const params = value as MessagesParams;
    const system: Message[] = params.system
      ? [toMessage('system', params.system)]
      : [];
    return {
      model: params.model,
      provider: PROVIDER,
      stream: params.stream === true,
      input: [
        ...system,
        ...params.messages.map((message) =>
          toMessage(message.role, message.content)
        ),
      ],
      tools: params.tools?.length
        ? params.tools.map((tool) => ({
            type: tool.type ?? 'function',
            name: tool.name,
            description: tool.description,
            inputSchema: tool.input_schema,
          }))
        : undefined,
      modelParameters: definedOnly<AiModelParameters>({
        temperature: params.temperature,
        maxTokens: params.max_tokens,
        topP: params.top_p,
        topK: params.top_k,
        stopSequences: params.stop_sequences,
      }),
    };
  },
  result: (value) => resultOf(value as MessageResponse),
  accumulator: () => new MessagesStreamAccumulator(),
};

/**
 * Records every `messages.create` call made through an Anthropic client as an
 * OpenPanel AI event, streamed or not, including `messages.stream()`,
 * `messages.parse()` and the beta tool runner:
 *
 *   const anthropic = wrapAnthropic(new Anthropic(), { op });
 *
 * The client is instrumented in place and returned. Per-request context
 * (user, conversation, name) comes from `withAiContext`.
 */
export function wrapAnthropic<Client extends object>(
  client: Client,
  options: AiIntegrationOptions
): Client {
  const resources = client as AnthropicClient;
  instrumentCreate(resources.messages, messages, options);
  instrumentCreate(resources.beta?.messages, messages, options);
  return client;
}
