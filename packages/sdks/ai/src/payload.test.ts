import { describe, expect, test } from 'bun:test';
import type { AiPayload } from '@openpanel/sdk';
import { withAiContext } from './context';
import {
  type AiCall,
  buildPayload,
  errorOf,
  recordCall,
  resolveContext,
} from './payload';

const call: AiCall = {
  context: { profileId: 'usr_1', traceId: 'trace_1' },
  model: 'gpt-5-mini',
  provider: 'openai',
  startedAt: Date.now() - 50,
  input: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  tools: [{ name: 'get_weather' }],
};

describe('buildPayload', () => {
  test('keeps content unless privacy mode is on', () => {
    const op = { ai: () => undefined };
    const open = buildPayload(call, { stream: false }, { op });
    expect(open.input).toEqual(call.input);
    expect(open.tools).toEqual(call.tools);
    expect(open.privacyMode).toBeUndefined();

    const closed = buildPayload(
      call,
      { stream: false },
      { op, privacyMode: true }
    );
    expect(closed.input).toBeUndefined();
    expect(closed.output).toBeUndefined();
    expect(closed.tools).toBeUndefined();
    expect(closed.privacyMode).toBe(true);
    expect(closed.model).toBe('gpt-5-mini');
  });

  test('the response model and the configured provider win', () => {
    const payload = buildPayload(
      call,
      { stream: true, model: 'gpt-5-mini-2026-03-01' },
      { op: { ai: () => undefined }, provider: 'openrouter' }
    );
    expect(payload.model).toBe('gpt-5-mini-2026-03-01');
    expect(payload.provider).toBe('openrouter');
    expect(payload.stream).toBe(true);
    expect(payload.latencyMs).toBeGreaterThanOrEqual(50);
  });
});

describe('resolveContext', () => {
  test('per-call beats ambient beats defaults, properties merge', () => {
    const resolved = withAiContext(
      { name: 'ambient', conversationId: 'c1', properties: { b: 2 } },
      () =>
        resolveContext(
          { name: 'per-call', properties: { c: 3 } },
          {
            op: { ai: () => undefined },
            defaults: { name: 'default', groups: ['g'], properties: { a: 1 } },
          }
        )
    );
    expect(resolved).toMatchObject({
      name: 'per-call',
      conversationId: 'c1',
      groups: ['g'],
      properties: { a: 1, b: 2, c: 3 },
    });
  });
});

describe('errorOf', () => {
  test('reads the status from statusCode or status and caps the message', () => {
    const aiSdkError = Object.assign(new Error('rate limited'), {
      statusCode: 429,
    });
    expect(errorOf(aiSdkError)).toEqual({
      message: 'rate limited',
      code: 'Error',
      httpStatus: 429,
    });
    const providerError = Object.assign(new Error('overloaded'), {
      status: 529,
    });
    expect(errorOf(providerError)).toEqual({
      message: 'overloaded',
      code: 'Error',
      httpStatus: 529,
    });
    expect(errorOf('boom')).toEqual({ message: 'boom' });
    expect(errorOf(new Error('x'.repeat(3000))).message).toHaveLength(2000);
  });
});

describe('recordCall', () => {
  test('a throwing or rejecting sink never surfaces', async () => {
    const sent: AiPayload[] = [];
    expect(() =>
      recordCall(
        call,
        { stream: false },
        {
          op: {
            ai: () => {
              throw new Error('sink down');
            },
          },
        }
      )
    ).not.toThrow();
    recordCall(
      call,
      { stream: false },
      { op: { ai: () => Promise.reject(new Error('later')) } }
    );
    recordCall(
      call,
      { stream: false },
      { op: { ai: (payload) => sent.push(payload) } }
    );
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.kind).toBe('generation');
  });
});
