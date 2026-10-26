import { describe, expect, test } from 'bun:test';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import type { AiPayload } from '@openpanel/sdk';
import { withAiContext } from './context';
import { openpanelAiMiddleware } from './middleware';

const model = {
  specificationVersion: 'v4',
  provider: 'openai.chat',
  modelId: 'gpt-5-mini',
} as LanguageModelV4;

const params: LanguageModelV4CallOptions = {
  prompt: [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: [{ type: 'text', text: 'Summarize my inbox' }] },
  ],
  temperature: 0.2,
  maxOutputTokens: 200,
  tools: [
    {
      type: 'function',
      name: 'get_weather',
      description: 'Weather',
      inputSchema: { type: 'object' },
    },
  ],
  providerOptions: {
    openpanel: {
      profileId: 'usr_1',
      name: 'inbox',
      properties: { plan: 'pro' },
    },
  },
};

const usage = {
  inputTokens: {
    total: 812,
    noCache: 712,
    cacheRead: 100,
    cacheWrite: undefined,
  },
  outputTokens: { total: 140, text: 140, reasoning: undefined },
};

const generateResult: LanguageModelV4GenerateResult = {
  content: [{ type: 'text', text: 'You have 3 unread emails.' }],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage,
  response: { modelId: 'gpt-5-mini-2025-08-07' },
  warnings: [],
};

function collect() {
  const payloads: AiPayload[] = [];
  const op = { ai: (payload: AiPayload) => payloads.push(payload) };
  return { op, payloads };
}

function wrap(middleware: ReturnType<typeof openpanelAiMiddleware>) {
  return {
    generate: (callParams = params) =>
      middleware.wrapGenerate!({
        doGenerate: async () => generateResult,
        doStream: async () => {
          throw new Error('not used');
        },
        params: callParams,
        model,
      }),
    stream: (parts: LanguageModelV4StreamPart[], callParams = params) =>
      middleware.wrapStream!({
        doGenerate: async () => {
          throw new Error('not used');
        },
        doStream: async () => ({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              for (const part of parts) {
                controller.enqueue(part);
              }
              controller.close();
            },
          }),
        }),
        params: callParams,
        model,
      }),
  };
}

async function drain(stream: ReadableStream<LanguageModelV4StreamPart>) {
  const reader = stream.getReader();
  const parts: LanguageModelV4StreamPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return parts;
    }
    parts.push(value);
  }
}

describe('openpanelAiMiddleware', () => {
  test('records a generate call with messages, tools, usage and context', async () => {
    const { op, payloads } = collect();
    const result = await wrap(openpanelAiMiddleware({ op })).generate();

    expect(result).toBe(generateResult);
    expect(payloads).toHaveLength(1);
    const payload = payloads[0]!;
    expect(payload).toMatchObject({
      kind: 'generation',
      model: 'gpt-5-mini-2025-08-07',
      provider: 'openai',
      name: 'inbox',
      profileId: 'usr_1',
      properties: { plan: 'pro' },
      usage: { inputTokens: 812, outputTokens: 140, cacheReadTokens: 100 },
      stopReason: 'stop',
      stream: false,
      modelParameters: { temperature: 0.2, maxTokens: 200 },
    });
    expect(payload.traceId).toBeTruthy();
    expect(payload.input).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: [{ type: 'text', text: 'Summarize my inbox' }] },
    ]);
    expect(payload.output).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'You have 3 unread emails.' }],
      },
    ]);
    expect(payload.tools).toEqual([
      {
        type: 'function',
        name: 'get_weather',
        description: 'Weather',
        inputSchema: { type: 'object' },
      },
    ]);
    expect(payload.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('privacy mode keeps content out of the payload', async () => {
    const { op, payloads } = collect();
    await wrap(openpanelAiMiddleware({ op, privacyMode: true })).generate();
    expect(payloads[0]).toMatchObject({
      privacyMode: true,
      usage: { inputTokens: 812 },
    });
    expect(payloads[0]!.input).toBeUndefined();
    expect(payloads[0]!.output).toBeUndefined();
    expect(payloads[0]!.tools).toBeUndefined();
  });

  test('a failing call is recorded as an error and rethrown', async () => {
    const { op, payloads } = collect();
    const middleware = openpanelAiMiddleware({ op });
    const failure = Object.assign(new Error('rate limited'), {
      name: 'APICallError',
      statusCode: 429,
    });
    await expect(
      middleware.wrapGenerate!({
        doGenerate: async () => {
          throw failure;
        },
        doStream: async () => {
          throw new Error('not used');
        },
        params,
        model,
      })
    ).rejects.toBe(failure);
    expect(payloads[0]).toMatchObject({
      error: { message: 'rate limited', code: 'APICallError', httpStatus: 429 },
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  test('withAiContext supplies one trace id to every call inside it', async () => {
    const { op, payloads } = collect();
    const wrapped = wrap(openpanelAiMiddleware({ op }));
    await withAiContext(
      { conversationId: 'thread_1', groups: ['acme'] },
      async () => {
        await wrapped.generate();
        await wrapped.generate();
      }
    );
    expect(payloads).toHaveLength(2);
    expect(payloads[0]!.traceId).toBe(payloads[1]!.traceId);
    expect(payloads[0]).toMatchObject({
      conversationId: 'thread_1',
      groups: ['acme'],
      profileId: 'usr_1',
    });
  });

  test('a stream is recorded once it ends, with time to first token', async () => {
    const { op, payloads } = collect();
    const result = await wrap(openpanelAiMiddleware({ op })).stream([
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', modelId: 'gpt-5-mini-2025-08-07' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'You have ' },
      { type: 'text-delta', id: 't1', delta: '3 unread emails.' },
      { type: 'text-end', id: 't1' },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'get_weather',
        input: '{"city":"Paris"}',
      },
      {
        type: 'finish',
        usage,
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      },
    ]);

    expect(payloads).toHaveLength(0);
    const parts = await drain(result.stream);
    expect(parts).toHaveLength(8);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      stream: true,
      model: 'gpt-5-mini-2025-08-07',
      stopReason: 'tool-calls',
      usage: { inputTokens: 812, outputTokens: 140 },
    });
    expect(payloads[0]!.timeToFirstTokenMs).toBeGreaterThanOrEqual(0);
    expect(payloads[0]!.output).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'You have 3 unread emails.' },
          {
            type: 'tool_call',
            toolCallId: 'call_1',
            toolName: 'get_weather',
            input: '{"city":"Paris"}',
          },
        ],
      },
    ]);
  });

  test('a stream that reports an error part is recorded as an error', async () => {
    const { op, payloads } = collect();
    const result = await wrap(openpanelAiMiddleware({ op })).stream([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 't1' },
      { type: 'error', error: new Error('overloaded') },
    ]);
    await drain(result.stream);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.error).toMatchObject({ message: 'overloaded' });
  });

  test('a stream that fails mid-way is recorded as an error', async () => {
    const { op, payloads } = collect();
    const middleware = openpanelAiMiddleware({ op });
    const result = await middleware.wrapStream!({
      doGenerate: async () => {
        throw new Error('not used');
      },
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 't1' });
            controller.error(new Error('connection reset'));
          },
        }),
      }),
      params,
      model,
    });
    await expect(drain(result.stream)).rejects.toThrow('connection reset');
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.error).toMatchObject({ message: 'connection reset' });
  });
});
