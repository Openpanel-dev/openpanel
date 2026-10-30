import { z } from 'zod';
import { zGroupIds } from '../../shared/group-limits';

export const AI_EVENT_KINDS = [
  'generation',
  'embedding',
  'span',
  'trace',
] as const;
export type AiEventKind = (typeof AI_EVENT_KINDS)[number];

/** The `events.name` each kind is stored under. */
export const AI_EVENT_NAMES = {
  generation: 'ai_generation',
  embedding: 'ai_embedding',
  span: 'ai_span',
  trace: 'ai_trace',
} as const satisfies Record<AiEventKind, string>;
export type AiEventName = (typeof AI_EVENT_NAMES)[AiEventKind];

export const AI_EVENT_NAME_LIST = Object.values(AI_EVENT_NAMES);

export function isAiEventName(name: string): name is AiEventName {
  return (AI_EVENT_NAME_LIST as string[]).includes(name);
}

/**
 * The flat keys an AI event carries in `events.properties`, which is what the
 * report builder, filters and breakdowns see. Payload content (input, output,
 * tools, error message) never lands here; it lives in `ai_events`.
 */
export const AI_PROPERTY_KEYS = {
  traceId: 'ai_trace_id',
  conversationId: 'ai_conversation_id',
  name: 'ai_name',
  model: 'ai_model',
  provider: 'ai_provider',
  inputTokens: 'ai_input_tokens',
  outputTokens: 'ai_output_tokens',
  cacheReadTokens: 'ai_cache_read_tokens',
  cacheWriteTokens: 'ai_cache_write_tokens',
  reasoningTokens: 'ai_reasoning_tokens',
  totalTokens: 'ai_total_tokens',
  cost: 'ai_cost',
  latencyMs: 'ai_latency_ms',
  timeToFirstTokenMs: 'ai_time_to_first_token_ms',
  isError: 'ai_is_error',
  errorCode: 'ai_error_code',
  httpStatus: 'ai_http_status',
  stopReason: 'ai_stop_reason',
  stream: 'ai_stream',
} as const;
export type AiPropertyKey =
  (typeof AI_PROPERTY_KEYS)[keyof typeof AI_PROPERTY_KEYS];

export const AI_ID_MAX_LENGTH = 128;
export const AI_ID_PATTERN = /^[A-Za-z0-9._:@()!'|~-]+$/;
export const AI_NAME_MAX_LENGTH = 200;
/** Serialized `input`, `output`, `tools` and `error` are each cut here. */
export const AI_MAX_CONTENT_BYTES = 200_000;
export const AI_TRUNCATION_MARKER = '… [truncated]';
export const AI_MAX_CUSTOM_PROPERTIES = 100;

// Hand-written (not `z.infer`) for the same reason as ingest.constants: these
// interfaces ship in the SDK type declarations as plain TypeScript.

export interface IAiUsage {
  /** Includes cached tokens, the OpenTelemetry convention. */
  inputTokens?: number;
  /** Includes reasoning tokens. */
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

export interface IAiError {
  message: string;
  code?: string;
  httpStatus?: number;
}

export interface IAiModelParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
  [key: string]: unknown;
}

export interface IAiPayload {
  kind: AiEventKind;
  /** Groups every event of one request. */
  traceId: string;
  /** Defaults to the event id. */
  spanId?: string;
  /** A span id or the trace id. */
  parentId?: string;
  /** Display name of this step or trace, e.g. `summarize`. */
  name?: string;
  /** Groups traces into a conversation or thread. */
  conversationId?: string;
  model?: string;
  provider?: string;
  /** Messages for a generation, any JSON for a span or trace, strings for an embedding. */
  input?: unknown;
  output?: unknown;
  tools?: unknown;
  usage?: IAiUsage;
  /** USD. When given it is stored as is instead of being computed. */
  cost?: number;
  latencyMs?: number;
  timeToFirstTokenMs?: number;
  error?: IAiError | null;
  stopReason?: string;
  stream?: boolean;
  modelParameters?: IAiModelParameters;
  /** Drops input, output and tools before storage. */
  privacyMode?: boolean;
  properties?: Record<string, unknown>;
  profileId?: string | number;
  groups?: string[] | null;
  /** Binds the event to a web session's device. */
  deviceId?: string;
  /** ISO 8601. Back-dates the event, same rules as `__timestamp`. */
  timestamp?: string;
}

const zAiId = z
  .string()
  .min(1)
  .max(AI_ID_MAX_LENGTH)
  .regex(
    AI_ID_PATTERN,
    "Allowed characters: letters, digits and - _ ~ . @ ( ) ! ' : |"
  );

/** `ai_events` stores token counts and durations as UInt32. */
const UINT32_MAX = 4_294_967_295;

const zTokenCount = z.number().int().min(0).max(UINT32_MAX);
const zNonNegative = z.number().min(0);
const zDurationMs = z.number().min(0).max(UINT32_MAX);

export const zAiUsage = z.object({
  inputTokens: zTokenCount.optional(),
  outputTokens: zTokenCount.optional(),
  cacheReadTokens: zTokenCount.optional(),
  cacheWriteTokens: zTokenCount.optional(),
  reasoningTokens: zTokenCount.optional(),
}) satisfies z.ZodType<IAiUsage>;

export const zAiError = z.object({
  message: z.string(),
  code: z.string().max(AI_NAME_MAX_LENGTH).optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
}) satisfies z.ZodType<IAiError>;

export const zAiModelParameters = z
  .object({
    temperature: z.number().optional(),
    maxTokens: z.number().int().optional(),
    topP: z.number().optional(),
    topK: z.number().int().optional(),
    frequencyPenalty: z.number().optional(),
    presencePenalty: z.number().optional(),
    seed: z.number().int().optional(),
    stopSequences: z.array(z.string()).optional(),
  })
  .catchall(z.unknown()) satisfies z.ZodType<IAiModelParameters>;

const MODEL_CALL_KINDS: readonly AiEventKind[] = ['generation', 'embedding'];

export const zAiPayload = z
  .object({
    kind: z.enum(AI_EVENT_KINDS),
    traceId: zAiId,
    spanId: zAiId.optional(),
    parentId: zAiId.optional(),
    name: z.string().min(1).max(AI_NAME_MAX_LENGTH).optional(),
    conversationId: zAiId.optional(),
    model: z.string().min(1).max(AI_NAME_MAX_LENGTH).optional(),
    provider: z.string().min(1).max(AI_NAME_MAX_LENGTH).optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    tools: z.unknown().optional(),
    usage: zAiUsage.optional(),
    cost: zNonNegative.optional(),
    latencyMs: zDurationMs.optional(),
    timeToFirstTokenMs: zDurationMs.optional(),
    error: zAiError.nullish(),
    stopReason: z.string().max(AI_NAME_MAX_LENGTH).optional(),
    stream: z.boolean().optional(),
    modelParameters: zAiModelParameters.optional(),
    privacyMode: z.boolean().optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    profileId: z.union([z.string().min(1), z.number()]).optional(),
    groups: zGroupIds.nullish(),
    deviceId: z.string().min(1).max(64).optional(),
    timestamp: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((payload, context) => {
    if (!MODEL_CALL_KINDS.includes(payload.kind)) {
      return;
    }
    for (const field of ['model', 'provider'] as const) {
      if (!payload[field]) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required for ${payload.kind}`,
        });
      }
    }
    if (payload.usage?.inputTokens === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['usage', 'inputTokens'],
        message: `usage.inputTokens is required for ${payload.kind}`,
      });
    }
    if (
      payload.kind === 'generation' &&
      payload.usage?.outputTokens === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['usage', 'outputTokens'],
        message: 'usage.outputTokens is required for generation',
      });
    }
  }) satisfies z.ZodType<IAiPayload>;

// Dashboard vocabulary

export const AI_BREAKDOWN_DIMENSIONS = [
  'model',
  'provider',
  'name',
  'profile',
  'conversation',
  'group',
  'stopReason',
  'errorCode',
] as const;
export type AiBreakdownDimension = (typeof AI_BREAKDOWN_DIMENSIONS)[number];

export const AI_LIST_DEFAULT_TAKE = 50;
export const AI_LIST_MAX_TAKE = 500;
export const AI_BREAKDOWN_DEFAULT_LIMIT = 10;
export const AI_BREAKDOWN_MAX_LIMIT = 100;

export const zAiFilters = z.object({
  models: z.array(z.string()).optional(),
  providers: z.array(z.string()).optional(),
  names: z.array(z.string()).optional(),
  types: z.array(z.enum(AI_EVENT_KINDS)).optional(),
  profileId: z.string().optional(),
  conversationId: z.string().optional(),
  sessionId: z.string().optional(),
  groupId: z.string().optional(),
  isError: z.boolean().optional(),
  /** Matches trace and conversation ids exactly, prompt and completion text loosely. */
  search: z.string().max(200).optional(),
});
export type IAiFilters = z.infer<typeof zAiFilters>;
