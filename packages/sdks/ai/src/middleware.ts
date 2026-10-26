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
import { type AiCallContext, createAiTraceId, getAiContext } from './context';
import { toMessages, toOutputMessages, toTools } from './messages';

/** The part of the OpenPanel client the middleware uses. */
export interface AiEventSink {
  ai(payload: AiPayload): unknown;
}

export interface OpenPanelAiMiddlewareOptions {
  op: AiEventSink;
  /** Never send prompts, completions or tool definitions. */
  privacyMode?: boolean;
  /** Fallback context for calls with no `withAiContext` and no `providerOptions.openpanel`. */
  defaults?: AiCallContext;
  /** Reported instead of the model's provider id, e.g. `openrouter` behind a gateway. */
  provider?: string;
}

interface CallState {
  context: AiCallContext;
  model: LanguageModelV4;
  params: LanguageModelV4CallOptions;
  startedAt: number;
}

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
const MAX_ERROR_MESSAGE_LENGTH = 2000;
const HTTP_STATUS_MIN = 100;
const HTTP_STATUS_MAX = 599;

/** `openai.chat` → `openai`; `amazon-bedrock` stays as is. */
function providerName(model: LanguageModelV4): string {
  return model.provider.split(PROVIDER_ID_SEPARATOR)[0] || model.provider;
}

function contextFor(
  params: LanguageModelV4CallOptions,
  options: OpenPanelAiMiddlewareOptions
): AiCallContext {
  const perCall = params.providerOptions?.[PROVIDER_OPTIONS_KEY] as
    | AiCallContext
    | undefined;
  const ambient = getAiContext();
  return {
    ...options.defaults,
    ...ambient,
    ...perCall,
    properties: {
      ...options.defaults?.properties,
      ...ambient?.properties,
      ...perCall?.properties,
    },
  };
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

function errorOf(error: unknown): AiPayload['error'] {
  if (!(error instanceof Error)) {
    return { message: String(error).slice(0, MAX_ERROR_MESSAGE_LENGTH) };
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const httpStatus =
    typeof statusCode === 'number' &&
    statusCode >= HTTP_STATUS_MIN &&
    statusCode <= HTTP_STATUS_MAX
      ? statusCode
      : undefined;
  return {
    message: error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
    code: error.name,
    httpStatus,
  };
}

function buildPayload(
  call: CallState,
  result: CallResult,
  options: OpenPanelAiMiddlewareOptions
): AiPayload {
  const { context, params, model } = call;
  const privacyMode = options.privacyMode || context.privacyMode;
  const hasProperties = Object.keys(context.properties ?? {}).length > 0;
  return {
    kind: 'generation',
    traceId: context.traceId ?? createAiTraceId(),
    parentId: context.parentId,
    name: context.name,
    conversationId: context.conversationId,
    model: result.modelId ?? model.modelId,
    provider: options.provider ?? providerName(model),
    input: privacyMode ? undefined : toMessages(params.prompt),
    output: privacyMode ? undefined : toOutputMessages(result.content),
    tools: privacyMode ? undefined : toTools(params.tools),
    usage: usageOf(result.usage),
    latencyMs: Date.now() - call.startedAt,
    timeToFirstTokenMs: result.timeToFirstTokenMs,
    error: result.error === undefined ? undefined : errorOf(result.error),
    stopReason: result.finishReason?.unified,
    stream: result.stream,
    modelParameters: modelParameters(params),
    privacyMode: privacyMode || undefined,
    properties: hasProperties ? context.properties : undefined,
    profileId: context.profileId,
    groups: context.groups,
    deviceId: context.deviceId,
  };
}

function send(
  call: CallState,
  result: CallResult,
  options: OpenPanelAiMiddlewareOptions
): void {
  try {
    const outcome = options.op.ai(buildPayload(call, result, options));
    if (outcome instanceof Promise) {
      outcome.catch(() => undefined);
    }
  } catch {
    // Observability must never fail the model call.
  }
}

/** Accumulates a stream into the same shape a generate call returns. */
class StreamObserver {
  readonly content: LanguageModelV4Content[] = [];
  usage: LanguageModelV4Usage | undefined;
  finishReason: LanguageModelV4FinishReason | undefined;
  modelId: string | undefined;
  firstTokenAt: number | undefined;
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
      error,
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
  const begin = (
    params: LanguageModelV4CallOptions,
    model: LanguageModelV4
  ): CallState => ({
    context: contextFor(params, options),
    model,
    params,
    startedAt: Date.now(),
  });

  return {
    specificationVersion: 'v4',

    async wrapGenerate({ doGenerate, params, model }) {
      const call = begin(params, model);
      let result: LanguageModelV4GenerateResult;
      try {
        result = await doGenerate();
      } catch (error) {
        send(call, { content: [], error, stream: false }, options);
        throw error;
      }
      send(
        call,
        {
          content: result.content,
          usage: result.usage,
          finishReason: result.finishReason,
          modelId: result.response?.modelId,
          stream: false,
        },
        options
      );
      return result;
    },

    async wrapStream({ doStream, params, model }) {
      const call = begin(params, model);
      let result: Awaited<ReturnType<typeof doStream>>;
      try {
        result = await doStream();
      } catch (error) {
        send(call, { content: [], error, stream: true }, options);
        throw error;
      }
      return {
        ...result,
        stream: observedStream(result.stream, (observer, error) => {
          send(call, observer.result(call.startedAt, error), options);
        }),
      };
    },
  };
}
