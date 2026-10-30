import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4Middleware,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import type { AiPayload, AiUsage } from '@openpanel/sdk';
import type { AiCallContext } from './context';
import { toMessages, toOutputMessages, toTools } from './messages';
import {
  type AiCall,
  type AiCallOutcome,
  type AiIntegrationOptions,
  recordCall,
  resolveContext,
} from './payload';

export type { AiEventSink } from './payload';

export interface OpenPanelAiMiddlewareOptions extends AiIntegrationOptions {}

/** What a stream or generate call hands back, in AI SDK terms. */
interface CallResult {
  content: LanguageModelV4Content[];
  usage?: LanguageModelV4Usage;
  finishReason?: LanguageModelV4FinishReason;
  modelId?: string;
  error?: unknown;
  timeToFirstTokenMs?: number;
  stream: boolean;
}

const PROVIDER_OPTIONS_KEY = 'openpanel';
const PROVIDER_ID_SEPARATOR = '.';

/** `openai.chat` → `openai`; `amazon-bedrock` stays as is. */
function providerName(model: LanguageModelV4): string {
  return model.provider.split(PROVIDER_ID_SEPARATOR)[0] || model.provider;
}

function modelParameters(
  params: LanguageModelV4CallOptions
): AiPayload['modelParameters'] | undefined {
  const entries = Object.entries({
    temperature: params.temperature,
    maxTokens: params.maxOutputTokens,
    topP: params.topP,
    topK: params.topK,
    frequencyPenalty: params.frequencyPenalty,
    presencePenalty: params.presencePenalty,
    seed: params.seed,
    stopSequences: params.stopSequences,
  }).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function usageOf(usage: LanguageModelV4Usage | undefined): AiUsage {
  return {
    inputTokens: usage?.inputTokens.total ?? 0,
    outputTokens: usage?.outputTokens.total ?? 0,
    cacheReadTokens: usage?.inputTokens.cacheRead ?? undefined,
    cacheWriteTokens: usage?.inputTokens.cacheWrite ?? undefined,
    reasoningTokens: usage?.outputTokens.reasoning ?? undefined,
  };
}

function beginCall(
  params: LanguageModelV4CallOptions,
  model: LanguageModelV4,
  options: OpenPanelAiMiddlewareOptions
): AiCall {
  const perCall = params.providerOptions?.[PROVIDER_OPTIONS_KEY] as
    | AiCallContext
    | undefined;
  return {
    context: resolveContext(perCall, options),
    model: model.modelId,
    provider: providerName(model),
    startedAt: Date.now(),
    input: toMessages(params.prompt),
    tools: toTools(params.tools),
    modelParameters: modelParameters(params),
  };
}

function outcomeOf(result: CallResult): AiCallOutcome {
  return {
    output: toOutputMessages(result.content),
    usage: usageOf(result.usage),
    model: result.modelId,
    stopReason: result.finishReason?.unified,
    error: result.error,
    timeToFirstTokenMs: result.timeToFirstTokenMs,
    stream: result.stream,
  };
}

/** Accumulates a stream into the same shape a generate call returns. */
class StreamObserver {
  readonly content: LanguageModelV4Content[] = [];
  usage: LanguageModelV4Usage | undefined;
  finishReason: LanguageModelV4FinishReason | undefined;
  modelId: string | undefined;
  firstTokenAt: number | undefined;
  /** A provider can report failure as a stream part instead of rejecting. */
  error: unknown;
  private readonly text = new Map<string, string>();
  private readonly reasoning = new Map<string, string>();

  observe(part: LanguageModelV4StreamPart): void {
    switch (part.type) {
      case 'text-delta':
        this.markFirstToken();
        this.text.set(part.id, (this.text.get(part.id) ?? '') + part.delta);
        return;
      case 'reasoning-delta':
        this.markFirstToken();
        this.reasoning.set(
          part.id,
          (this.reasoning.get(part.id) ?? '') + part.delta
        );
        return;
      case 'tool-input-start':
        this.markFirstToken();
        return;
      case 'tool-call':
      case 'tool-result':
        this.content.push(part);
        return;
      case 'response-metadata':
        this.modelId = part.modelId ?? this.modelId;
        return;
      case 'finish':
        this.usage = part.usage;
        this.finishReason = part.finishReason;
        return;
      case 'error':
        this.error = part.error;
        return;
      default:
        return;
    }
  }

  private markFirstToken(): void {
    if (this.firstTokenAt === undefined) {
      this.firstTokenAt = Date.now();
    }
  }

  result(startedAt: number, error?: unknown): CallResult {
    const content: LanguageModelV4Content[] = [
      ...[...this.reasoning.values()].map(
        (text) => ({ type: 'reasoning', text }) as LanguageModelV4Content
      ),
      ...[...this.text.values()].map(
        (text) => ({ type: 'text', text }) as LanguageModelV4Content
      ),
      ...this.content,
    ];
    return {
      content,
      usage: this.usage,
      finishReason: this.finishReason,
      modelId: this.modelId,
      error: error ?? this.error,
      timeToFirstTokenMs:
        this.firstTokenAt === undefined
          ? undefined
          : this.firstTokenAt - startedAt,
      stream: true,
    };
  }
}

function observedStream(
  source: ReadableStream<LanguageModelV4StreamPart>,
  onDone: (observer: StreamObserver, error?: unknown) => void
): ReadableStream<LanguageModelV4StreamPart> {
  const reader = source.getReader();
  const observer = new StreamObserver();
  let settled = false;
  const settle = (error?: unknown) => {
    if (settled) {
      return;
    }
    settled = true;
    onDone(observer, error);
  };
  return new ReadableStream<LanguageModelV4StreamPart>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          settle();
          controller.close();
          return;
        }
        observer.observe(value);
        controller.enqueue(value);
      } catch (error) {
        settle(error);
        controller.error(error);
      }
    },
    cancel(reason) {
      settle(reason ?? new Error('stream cancelled'));
      return reader.cancel(reason);
    },
  });
}

/**
 * A Vercel AI SDK middleware that records every model call as an OpenPanel
 * `ai_generation`:
 *
 *   const model = wrapLanguageModel({
 *     model: openai('gpt-5-mini'),
 *     middleware: openpanelAiMiddleware({ op }),
 *   });
 *
 * Per-call context goes in `providerOptions.openpanel` or `withAiContext`.
 */
export function openpanelAiMiddleware(
  options: OpenPanelAiMiddlewareOptions
): LanguageModelV4Middleware {
  const send = (call: AiCall, result: CallResult) =>
    recordCall(call, outcomeOf(result), options);

  return {
    specificationVersion: 'v4',

    async wrapGenerate({ doGenerate, params, model }) {
      const call = beginCall(params, model, options);
      let result: LanguageModelV4GenerateResult;
      try {
        result = await doGenerate();
      } catch (error) {
        send(call, { content: [], error, stream: false });
        throw error;
      }
      send(call, {
        content: result.content,
        usage: result.usage,
        finishReason: result.finishReason,
        modelId: result.response?.modelId,
        stream: false,
      });
      return result;
    },

    async wrapStream({ doStream, params, model }) {
      const call = beginCall(params, model, options);
      let result: Awaited<ReturnType<typeof doStream>>;
      try {
        result = await doStream();
      } catch (error) {
        send(call, { content: [], error, stream: true });
        throw error;
      }
      return {
        ...result,
        stream: observedStream(result.stream, (observer, error) => {
          send(call, observer.result(call.startedAt, error));
        }),
      };
    },
  };
}
