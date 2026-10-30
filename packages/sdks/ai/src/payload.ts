// The provider-neutral half of every integration: what a model call is, what
// it produced, and how that becomes one `ai_generation` payload. A wrapper for
// a provider SDK converts its own request and response shapes into `AiCall`
// and `AiCallOutcome` and leaves the rest to this module.

import type { AiPayload, AiUsage } from '@openpanel/sdk';
import { type AiCallContext, createAiTraceId, getAiContext } from './context';
import type { Message } from './messages';

/** The part of the OpenPanel client an integration uses. */
export interface AiEventSink {
  ai(payload: AiPayload): unknown;
}

/** Options every integration accepts. */
export interface AiIntegrationOptions {
  op: AiEventSink;
  /** Never send prompts, completions or tool definitions. */
  privacyMode?: boolean;
  /** Fallback context for calls with no `withAiContext` and no per-call context. */
  defaults?: AiCallContext;
  /** Reported instead of the provider's own id, e.g. `openrouter` behind a gateway. */
  provider?: string;
}

/** What an integration knows when a model call starts. */
export interface AiCall {
  context: AiCallContext;
  model: string;
  provider: string;
  startedAt: number;
  input?: Message[];
  tools?: unknown;
  modelParameters?: AiPayload['modelParameters'];
}

/** What it knows once the call has ended, however it ended. */
export interface AiCallOutcome {
  output?: Message[];
  usage?: AiUsage;
  /** The model the response names, when it differs from the one requested. */
  model?: string;
  stopReason?: string;
  error?: unknown;
  timeToFirstTokenMs?: number;
  stream: boolean;
}

const MAX_ERROR_MESSAGE_LENGTH = 2000;
const HTTP_STATUS_MIN = 100;
const HTTP_STATUS_MAX = 599;

/** Per-call context wins over the ambient `withAiContext`, which wins over `defaults`. */
export function resolveContext(
  perCall: AiCallContext | undefined,
  options: AiIntegrationOptions
): AiCallContext {
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

export function errorOf(error: unknown): NonNullable<AiPayload['error']> {
  if (!(error instanceof Error)) {
    return { message: String(error).slice(0, MAX_ERROR_MESSAGE_LENGTH) };
  }
  // Provider SDK errors carry the HTTP status as `statusCode` (AI SDK) or `status` (OpenAI, Anthropic).
  const { statusCode, status } = error as {
    statusCode?: unknown;
    status?: unknown;
  };
  const candidate = typeof statusCode === 'number' ? statusCode : status;
  const httpStatus =
    typeof candidate === 'number' &&
    candidate >= HTTP_STATUS_MIN &&
    candidate <= HTTP_STATUS_MAX
      ? candidate
      : undefined;
  return {
    message: error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
    code: error.name,
    httpStatus,
  };
}

export function buildPayload(
  call: AiCall,
  outcome: AiCallOutcome,
  options: AiIntegrationOptions
): AiPayload {
  const { context } = call;
  const privacyMode = options.privacyMode || context.privacyMode;
  const hasProperties = Object.keys(context.properties ?? {}).length > 0;
  return {
    kind: 'generation',
    traceId: context.traceId ?? createAiTraceId(),
    parentId: context.parentId,
    name: context.name,
    conversationId: context.conversationId,
    model: outcome.model ?? call.model,
    provider: options.provider ?? call.provider,
    input: privacyMode ? undefined : call.input,
    output: privacyMode ? undefined : outcome.output,
    tools: privacyMode ? undefined : call.tools,
    usage: outcome.usage,
    latencyMs: Date.now() - call.startedAt,
    timeToFirstTokenMs: outcome.timeToFirstTokenMs,
    error: outcome.error === undefined ? undefined : errorOf(outcome.error),
    stopReason: outcome.stopReason,
    stream: outcome.stream,
    modelParameters: call.modelParameters,
    privacyMode: privacyMode || undefined,
    properties: hasProperties ? context.properties : undefined,
    profileId: context.profileId,
    groups: context.groups,
    deviceId: context.deviceId,
    // The call's start, so a trace timeline places steps where they began.
    timestamp: new Date(call.startedAt).toISOString(),
  };
}

/** Observability must never fail the model call: nothing here throws or rejects. */
export function recordCall(
  call: AiCall,
  outcome: AiCallOutcome,
  options: AiIntegrationOptions
): void {
  try {
    const result = options.op.ai(buildPayload(call, outcome, options));
    if (result instanceof Promise) {
      result.catch(() => undefined);
    }
  } catch {
    // Swallowed on purpose; see above.
  }
}
