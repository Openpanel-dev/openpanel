import { describe, expect, test } from 'bun:test';
import {
  AI_MAX_CONTENT_BYTES,
  AI_TRUNCATION_MARKER,
  zAiPayload,
} from '../ai.constants';
import { normalizeAiPayload, serializeBounded } from './normalize';
import { buildAiEventRow } from './row';

const generation = zAiPayload.parse({
  kind: 'generation',
  traceId: 'trace_1',
  spanId: 'span_1',
  name: 'summarize',
  conversationId: 'thread_1',
  model: 'gpt-5-mini',
  provider: 'openai',
  input: [{ role: 'user', content: 'hi' }],
  output: [{ role: 'assistant', content: 'hello' }],
  tools: [{ type: 'function', function: { name: 'get_weather' } }],
  usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 100 },
  latencyMs: 1234.6,
  stopReason: 'stop',
  stream: true,
  modelParameters: { temperature: 0.2 },
  properties: {
    feature: 'inbox',
    nested: { plan: 'pro' },
    ai_model: 'spoofed',
  },
});

describe('zAiPayload', () => {
  test('a generation needs model, provider and token counts', () => {
    const result = zAiPayload.safeParse({ kind: 'generation', traceId: 't' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining([
        'model',
        'provider',
        'usage.inputTokens',
        'usage.outputTokens',
      ])
    );
  });

  test('a span only needs a trace id', () => {
    expect(zAiPayload.safeParse({ kind: 'span', traceId: 't' }).success).toBe(
      true
    );
  });

  test('ids are restricted to the allowed alphabet', () => {
    expect(
      zAiPayload.safeParse({ kind: 'span', traceId: 'has space' }).success
    ).toBe(false);
    expect(
      zAiPayload.safeParse({ kind: 'span', traceId: "a-b_c.d:e@f(g)!h'i|j~k" })
        .success
    ).toBe(true);
  });
});

describe('normalizeAiPayload', () => {
  test('maps a generation to the events row properties and the ai_events draft', () => {
    const { name, properties, draft } = normalizeAiPayload(generation);
    expect(name).toBe('ai_generation');
    expect(properties).toMatchObject({
      feature: 'inbox',
      nested: { plan: 'pro' },
      ai_trace_id: 'trace_1',
      ai_conversation_id: 'thread_1',
      ai_name: 'summarize',
      ai_model: 'gpt-5-mini',
      ai_provider: 'openai',
      ai_input_tokens: 1000,
      ai_output_tokens: 200,
      ai_cache_read_tokens: 100,
      ai_total_tokens: 1200,
      ai_latency_ms: 1234.6,
      ai_is_error: false,
      ai_stop_reason: 'stop',
      ai_stream: true,
    });
    expect(properties.ai_cost).toBeGreaterThan(0);
    expect(properties).not.toHaveProperty('ai_input');
    expect(properties).not.toHaveProperty('ai_output');
    expect(properties).not.toHaveProperty('ai_span_id');

    expect(draft).toMatchObject({
      type: 'generation',
      trace_id: 'trace_1',
      span_id: 'span_1',
      conversation_id: 'thread_1',
      model: 'gpt-5-mini',
      input_tokens: 1000,
      cache_read_tokens: 100,
      cost_source: 'catalog',
      latency_ms: 1235,
      is_stream: true,
      is_error: false,
      properties: { feature: 'inbox', 'nested.plan': 'pro' },
    });
    expect(JSON.parse(draft.input)).toEqual([{ role: 'user', content: 'hi' }]);
    expect(JSON.parse(draft.tools)).toHaveLength(1);
    expect(JSON.parse(draft.model_parameters)).toEqual({ temperature: 0.2 });
  });

  test('a caller cannot spoof reserved ai_* keys through custom properties', () => {
    const { properties, draft } = normalizeAiPayload(generation);
    expect(properties.ai_model).toBe('gpt-5-mini');
    expect(draft.properties).not.toHaveProperty('ai_model');
  });

  test('privacy mode keeps the numbers and drops the content', () => {
    const { draft, properties } = normalizeAiPayload({
      ...generation,
      privacyMode: true,
    });
    expect(draft.input).toBe('');
    expect(draft.output).toBe('');
    expect(draft.tools).toBe('');
    expect(draft.input_tokens).toBe(1000);
    expect(properties.ai_input_tokens).toBe(1000);
  });

  test('an error marks the event and keeps the message out of the events row', () => {
    const { properties, draft } = normalizeAiPayload({
      ...generation,
      error: { message: 'rate limited', code: 'rate_limit', httpStatus: 429 },
    });
    expect(properties).toMatchObject({
      ai_is_error: true,
      ai_error_code: 'rate_limit',
      ai_http_status: 429,
    });
    expect(properties).not.toHaveProperty('ai_error');
    expect(draft.is_error).toBe(true);
    expect(draft.http_status).toBe(429);
    expect(JSON.parse(draft.error).message).toBe('rate limited');
  });

  test('a passthrough cost is stored as given', () => {
    const { properties, draft } = normalizeAiPayload({
      ...generation,
      cost: 0.5,
    });
    expect(properties.ai_cost).toBe(0.5);
    expect(draft).toMatchObject({
      total_cost: 0.5,
      cost_source: 'passthrough',
    });
  });

  test('an unpriced model has no ai_cost property but keeps the row', () => {
    const { properties, draft } = normalizeAiPayload({
      ...generation,
      model: 'my-finetune',
      provider: 'acme',
    });
    expect(properties).not.toHaveProperty('ai_cost');
    expect(draft).toMatchObject({ total_cost: 0, cost_source: 'none' });
  });

  test('a span without usage has no token properties', () => {
    const { name, properties, draft } = normalizeAiPayload(
      zAiPayload.parse({
        kind: 'span',
        traceId: 't',
        name: 'vector_search',
        input: 'q',
      })
    );
    expect(name).toBe('ai_span');
    expect(properties).not.toHaveProperty('ai_input_tokens');
    expect(properties).not.toHaveProperty('ai_total_tokens');
    expect(draft.input).toBe('"q"');
  });
});

describe('serializeBounded', () => {
  test('cuts oversized content at the byte cap with a marker', () => {
    const big = 'ä'.repeat(AI_MAX_CONTENT_BYTES);
    const out = serializeBounded(big);
    expect(out.endsWith(AI_TRUNCATION_MARKER)).toBe(true);
    expect(new TextEncoder().encode(out).byteLength).toBeLessThanOrEqual(
      AI_MAX_CONTENT_BYTES +
        new TextEncoder().encode(AI_TRUNCATION_MARKER).byteLength
    );
    expect(out).not.toContain('�');
  });

  test('leaves small content alone and maps nothing to the empty string', () => {
    expect(serializeBounded({ a: 1 })).toBe('{"a":1}');
    expect(serializeBounded(undefined)).toBe('');
    expect(serializeBounded(null)).toBe('');
  });
});

describe('buildAiEventRow', () => {
  const event = {
    id: 'evt_1',
    project_id: 'p',
    profile_id: 'usr_1',
    device_id: 'dev_1',
    session_id: 'sess_1',
    groups: ['acme'],
    created_at: '2026-10-26 10:00:00.000',
  };

  test('copies identity from the stored event and defaults span_id to the event id', () => {
    const { draft } = normalizeAiPayload({ ...generation, spanId: undefined });
    const row = buildAiEventRow(draft, event, { storeContent: true });
    expect(row).toMatchObject({
      ...event,
      span_id: 'evt_1',
      model: 'gpt-5-mini',
    });
    expect(row.input).not.toBe('');
  });

  test('the project privacy setting blanks content', () => {
    const { draft } = normalizeAiPayload(generation);
    const row = buildAiEventRow(draft, event, { storeContent: false });
    expect(row.input).toBe('');
    expect(row.output).toBe('');
    expect(row.tools).toBe('');
    expect(row.input_tokens).toBe(1000);
  });
});
