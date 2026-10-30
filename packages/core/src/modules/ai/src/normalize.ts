// Turns one `type: 'ai'` payload into the two things the pipeline stores: the
// flat scalar properties of the `events` row and the draft `ai_events` row.

import { toDots } from '@openpanel/shared';
import {
  AI_EVENT_NAMES,
  AI_MAX_CONTENT_BYTES,
  AI_MAX_CUSTOM_PROPERTIES,
  AI_PROPERTY_KEYS,
  AI_TRUNCATION_MARKER,
  type AiEventName,
  type IAiPayload,
} from '../ai.constants';
import { calculateAiCost } from './pricing/cost';
import type { AiEventRowDraft } from './row';

export interface NormalizedAiEvent {
  name: AiEventName;
  /** For the `events` row: the caller's properties under the reserved `ai_*` keys. */
  properties: Record<string, unknown>;
  draft: AiEventRowDraft;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: false });

/**
 * JSON with a byte cap. A cut serialisation is no longer valid JSON; readers
 * fall back to showing it as text, which beats dropping a 300 KB prompt.
 */
export function serializeBounded(
  value: unknown,
  maxBytes = AI_MAX_CONTENT_BYTES
): string {
  if (value === undefined || value === null) {
    return '';
  }
  let json: string;
  try {
    json = JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
  const bytes = textEncoder.encode(json);
  if (bytes.byteLength <= maxBytes) {
    return json;
  }
  // Decoding a sliced buffer drops a split multi-byte character cleanly.
  const cut = textDecoder.decode(bytes.subarray(0, maxBytes)).replace(/�$/, '');
  return `${cut}${AI_TRUNCATION_MARKER}`;
}

function customProperties(
  properties: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!properties) {
    return {};
  }
  const entries = Object.entries(properties)
    .filter(([key]) => !key.startsWith('ai_'))
    .slice(0, AI_MAX_CUSTOM_PROPERTIES);
  return Object.fromEntries(entries);
}

function defined<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export function normalizeAiPayload(payload: IAiPayload): NormalizedAiEvent {
  const usage = payload.usage ?? {};
  const cost = calculateAiCost({
    model: payload.model,
    provider: payload.provider,
    usage: payload.usage,
    cost: payload.cost,
  });
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const isError = Boolean(payload.error);
  const storeContent = !payload.privacyMode;
  const custom = customProperties(payload.properties);

  const properties: Record<string, unknown> = {
    ...custom,
    ...defined({
      [AI_PROPERTY_KEYS.traceId]: payload.traceId,
      [AI_PROPERTY_KEYS.conversationId]: payload.conversationId,
      [AI_PROPERTY_KEYS.name]: payload.name,
      [AI_PROPERTY_KEYS.model]: payload.model,
      [AI_PROPERTY_KEYS.provider]: payload.provider,
      [AI_PROPERTY_KEYS.inputTokens]: usage.inputTokens,
      [AI_PROPERTY_KEYS.outputTokens]: usage.outputTokens,
      [AI_PROPERTY_KEYS.cacheReadTokens]: usage.cacheReadTokens,
      [AI_PROPERTY_KEYS.cacheWriteTokens]: usage.cacheWriteTokens,
      [AI_PROPERTY_KEYS.reasoningTokens]: usage.reasoningTokens,
      [AI_PROPERTY_KEYS.totalTokens]: payload.usage
        ? inputTokens + outputTokens
        : undefined,
      [AI_PROPERTY_KEYS.cost]:
        cost.source === 'none' ? undefined : cost.totalCost,
      [AI_PROPERTY_KEYS.latencyMs]: payload.latencyMs,
      [AI_PROPERTY_KEYS.timeToFirstTokenMs]: payload.timeToFirstTokenMs,
      [AI_PROPERTY_KEYS.isError]: isError,
      [AI_PROPERTY_KEYS.errorCode]: payload.error?.code,
      [AI_PROPERTY_KEYS.httpStatus]: payload.error?.httpStatus,
      [AI_PROPERTY_KEYS.stopReason]: payload.stopReason,
      [AI_PROPERTY_KEYS.stream]: payload.stream,
    }),
  };

  const draft: AiEventRowDraft = {
    type: payload.kind,
    trace_id: payload.traceId,
    span_id: payload.spanId ?? '',
    parent_id: payload.parentId ?? '',
    conversation_id: payload.conversationId ?? '',
    name: payload.name ?? '',
    model: payload.model ?? '',
    provider: payload.provider ?? '',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: usage.cacheReadTokens ?? 0,
    cache_write_tokens: usage.cacheWriteTokens ?? 0,
    reasoning_tokens: usage.reasoningTokens ?? 0,
    input_cost: cost.inputCost,
    output_cost: cost.outputCost,
    total_cost: cost.totalCost,
    cost_source: cost.source,
    latency_ms: Math.round(payload.latencyMs ?? 0),
    time_to_first_token_ms: Math.round(payload.timeToFirstTokenMs ?? 0),
    is_error: isError,
    http_status: payload.error?.httpStatus ?? 0,
    stop_reason: payload.stopReason ?? '',
    is_stream: payload.stream ?? false,
    model_parameters: serializeBounded(payload.modelParameters),
    input: storeContent ? serializeBounded(payload.input) : '',
    output: storeContent ? serializeBounded(payload.output) : '',
    tools: storeContent ? serializeBounded(payload.tools) : '',
    error: serializeBounded(payload.error ?? undefined),
    properties: toDots(custom) as Record<string, string>,
  };

  return { name: AI_EVENT_NAMES[payload.kind], properties, draft };
}
