import { describe, expect, test } from 'bun:test';
import OpenAI from 'openai';
import { withAiContext } from './context';
import { wrapOpenAI } from './openai';
import { collect, jsonResponse, mockFetch, sseResponse } from './test-helpers';

function client(responses: (() => Response)[], wrapTimes = 1) {
  const { op, payloads } = collect();
  const { fetch, requests } = mockFetch(responses);
  let openai = new OpenAI({ apiKey: 'sk-test', fetch, maxRetries: 0 });
  for (let i = 0; i < wrapTimes; i++) {
    openai = wrapOpenAI(openai, { op });
  }
  return { openai, payloads, requests };
}

const toolCompletion = {
  id: 'chatcmpl_1',
  object: 'chat.completion',
  created: 1,
  model: 'gpt-5-mini-2025-08-07',
  choices: [
    {
      index: 0,
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: null,
        refusal: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Oslo"}' },
          },
        ],
      },
    },
  ],
  usage: {
    prompt_tokens: 120,
    completion_tokens: 30,
    total_tokens: 150,
    prompt_tokens_details: { cached_tokens: 100 },
    completion_tokens_details: { reasoning_tokens: 10 },
  },
};

function chatChunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null
) {
  return {
    id: 'chatcmpl_2',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-5-mini-2025-08-07',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

const textChunks = [
  chatChunk({ role: 'assistant', content: 'Hello' }),
  chatChunk({ content: ' there' }),
  chatChunk({}, 'stop'),
  {
    id: 'chatcmpl_2',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-5-mini-2025-08-07',
    choices: [],
    usage: { prompt_tokens: 12, completion_tokens: 2, total_tokens: 14 },
  },
];

const functionCallResponse = {
  id: 'resp_1',
  object: 'response',
  created_at: 1,
  model: 'gpt-5-2025-08-07',
  status: 'completed',
  output: [
    {
      type: 'reasoning',
      id: 'rs_1',
      summary: [{ type: 'summary_text', text: 'Need the weather.' }],
    },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_9',
      name: 'get_weather',
      arguments: '{"city":"Oslo"}',
      status: 'completed',
    },
  ],
  usage: {
    input_tokens: 50,
    output_tokens: 20,
    total_tokens: 70,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 12 },
  },
};

describe('wrapOpenAI', () => {
  test('records a chat completion with tool calls, usage and parameters', async () => {
    const { openai, payloads } = client([() => jsonResponse(toolCompletion)]);

    const { data, request_id } = await openai.chat.completions
      .create({
        model: 'gpt-5-mini',
        temperature: 0.3,
        max_completion_tokens: 200,
        stop: 'END',
        messages: [
          { role: 'system', content: 'Be brief.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Weather?' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,AAAA' },
              },
            ],
          },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_0',
                type: 'function',
                function: { name: 'locate', arguments: '{}' },
              },
            ],
          },
          { role: 'tool', tool_call_id: 'call_0', content: 'Oslo' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Weather for a city',
              parameters: { type: 'object' },
            },
          },
        ],
      })
      .withResponse();

    expect(request_id).toBe('req_1');
    expect(data.choices[0]?.message.tool_calls?.[0]?.id).toBe('call_1');
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      kind: 'generation',
      model: 'gpt-5-mini-2025-08-07',
      provider: 'openai',
      stream: false,
      stopReason: 'tool-calls',
      usage: {
        inputTokens: 120,
        outputTokens: 30,
        cacheReadTokens: 100,
        reasoningTokens: 10,
      },
      modelParameters: {
        temperature: 0.3,
        maxTokens: 200,
        stopSequences: ['END'],
      },
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Weather for a city',
          inputSchema: { type: 'object' },
        },
      ],
    });
    expect(payloads[0]?.input).toEqual([
      { role: 'system', content: 'Be brief.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Weather?' },
          { type: 'file', mediaType: 'image', data: '[file]' },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            toolCallId: 'call_0',
            toolName: 'locate',
            input: {},
          },
        ],
      },
      {
        role: 'tool',
        content: [
          { type: 'tool_result', toolCallId: 'call_0', output: 'Oslo' },
        ],
      },
    ]);
    expect(payloads[0]?.output).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            toolCallId: 'call_1',
            toolName: 'get_weather',
            input: { city: 'Oslo' },
          },
        ],
      },
    ]);
  });

  test('records a streamed chat completion once the stream is read', async () => {
    const { openai, payloads } = client([
      () => sseResponse(textChunks, { done: true }),
    ]);

    const stream = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(payloads).toHaveLength(0);

    let text = '';
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta.content ?? '';
    }

    expect(text).toBe('Hello there');
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      stream: true,
      stopReason: 'stop',
      usage: { inputTokens: 12, outputTokens: 2 },
      output: [{ role: 'assistant', content: 'Hello there' }],
    });
    expect(payloads[0]?.timeToFirstTokenMs).toBeNumber();
    expect(payloads[0]?.error).toBeUndefined();
  });

  test('assembles streamed tool calls', async () => {
    const { openai, payloads } = client([
      () =>
        sseResponse(
          [
            chatChunk({
              tool_calls: [
                {
                  index: 0,
                  id: 'call_5',
                  type: 'function',
                  function: { name: 'get_weather', arguments: '{"ci' },
                },
              ],
            }),
            chatChunk({
              tool_calls: [
                { index: 0, function: { arguments: 'ty":"Oslo"}' } },
              ],
            }),
            chatChunk({}, 'tool_calls'),
          ],
          { done: true }
        ),
    ]);

    const stream = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'Weather?' }],
      stream: true,
    });
    for await (const _chunk of stream) {
      // drain
    }

    expect(payloads[0]).toMatchObject({
      stopReason: 'tool-calls',
      output: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_call',
              toolCallId: 'call_5',
              toolName: 'get_weather',
              input: { city: 'Oslo' },
            },
          ],
        },
      ],
    });
    expect(payloads[0]?.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  test('records the SDK stream helper through create', async () => {
    const { openai, payloads } = client([
      () => sseResponse(textChunks, { done: true }),
    ]);

    const completion = await openai.chat.completions
      .stream({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: 'Hi' }],
      })
      .finalChatCompletion();

    expect(completion.choices[0]?.message.content).toBe('Hello there');
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      stream: true,
      output: [{ role: 'assistant', content: 'Hello there' }],
    });
  });

  test('marks a stream the caller stops reading as cancelled', async () => {
    const { openai, payloads } = client([
      () => sseResponse(textChunks, { done: true }),
    ]);

    const stream = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
    });
    for await (const _chunk of stream) {
      break;
    }

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.error?.message).toBe('stream cancelled');
    expect(payloads[0]?.output).toEqual([
      { role: 'assistant', content: 'Hello' },
    ]);
  });

  test('records a failed call with its status and rethrows', async () => {
    const { openai, payloads } = client([
      () =>
        jsonResponse(
          {
            error: { message: 'Invalid model', type: 'invalid_request_error' },
          },
          400
        ),
    ]);

    const call = openai.chat.completions.create({
      model: 'gpt-nope',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    // `rejects` reads the native promise state, which APIPromise always resolves.
    const error = await call.then(
      () => undefined,
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(OpenAI.BadRequestError);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      model: 'gpt-nope',
      error: { httpStatus: 400, code: 'invalid_request_error' },
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  test('records a Responses API call with reasoning and a function call', async () => {
    const { openai, payloads } = client([
      () => jsonResponse(functionCallResponse),
    ]);

    await openai.responses.create({
      model: 'gpt-5',
      instructions: 'Be brief.',
      input: [
        { role: 'user', content: 'Weather in Oslo?' },
        {
          type: 'function_call_output',
          call_id: 'call_0',
          output: 'sunny',
        },
      ],
      max_output_tokens: 500,
      reasoning: { effort: 'low' },
    });

    expect(payloads[0]).toMatchObject({
      model: 'gpt-5-2025-08-07',
      stopReason: 'tool-calls',
      usage: {
        inputTokens: 50,
        outputTokens: 20,
        cacheReadTokens: 0,
        reasoningTokens: 12,
      },
      modelParameters: { maxTokens: 500, reasoningEffort: 'low' },
    });
    expect(payloads[0]?.input).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Weather in Oslo?' },
      {
        role: 'tool',
        content: [
          { type: 'tool_result', toolCallId: 'call_0', output: 'sunny' },
        ],
      },
    ]);
    expect(payloads[0]?.output).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Need the weather.' },
          {
            type: 'tool_call',
            toolCallId: 'call_9',
            toolName: 'get_weather',
            input: { city: 'Oslo' },
          },
        ],
      },
    ]);
  });

  test('records a streamed Responses API call from its final event', async () => {
    const final = {
      ...functionCallResponse,
      output: [
        {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Sunny.', annotations: [] }],
        },
      ],
    };
    const { openai, payloads } = client([
      () =>
        sseResponse(
          [
            {
              type: 'response.created',
              sequence_number: 0,
              response: { ...final, status: 'in_progress', output: [] },
            },
            {
              type: 'response.output_text.delta',
              sequence_number: 1,
              item_id: 'msg_1',
              output_index: 0,
              content_index: 0,
              delta: 'Sunny.',
            },
            { type: 'response.completed', sequence_number: 2, response: final },
          ],
          { named: true }
        ),
    ]);

    const stream = await openai.responses.create({
      model: 'gpt-5',
      input: 'Weather?',
      stream: true,
    });
    for await (const _event of stream) {
      // drain
    }

    expect(payloads[0]).toMatchObject({
      stream: true,
      stopReason: 'stop',
      model: 'gpt-5-2025-08-07',
      input: [{ role: 'user', content: 'Weather?' }],
      output: [
        { role: 'assistant', content: [{ type: 'text', text: 'Sunny.' }] },
      ],
      usage: { inputTokens: 50, outputTokens: 20 },
    });
    expect(payloads[0]?.timeToFirstTokenMs).toBeNumber();
  });

  test('keeps the Responses text that arrived when the reader stops early', async () => {
    const { openai, payloads } = client([
      () =>
        sseResponse(
          [
            {
              type: 'response.created',
              sequence_number: 0,
              response: {
                ...functionCallResponse,
                status: 'in_progress',
                output: [],
              },
            },
            {
              type: 'response.output_text.delta',
              sequence_number: 1,
              item_id: 'msg_1',
              output_index: 0,
              content_index: 0,
              delta: 'Sun',
            },
            {
              type: 'response.output_text.delta',
              sequence_number: 2,
              item_id: 'msg_1',
              output_index: 0,
              content_index: 0,
              delta: 'ny',
            },
          ],
          { named: true }
        ),
    ]);

    const stream = await openai.responses.create({
      model: 'gpt-5',
      input: 'Weather?',
      stream: true,
    });
    let seen = 0;
    for await (const _event of stream) {
      seen += 1;
      if (seen === 3) {
        break;
      }
    }

    expect(payloads[0]?.error?.message).toBe('stream cancelled');
    expect(payloads[0]?.output).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: 'Sunny' }] },
    ]);
  });

  test('keeps partial text from separate Responses output items apart', async () => {
    const delta = (outputIndex: number, text: string, sequence: number) => ({
      type: 'response.output_text.delta',
      sequence_number: sequence,
      item_id: `msg_${outputIndex}`,
      output_index: outputIndex,
      content_index: 0,
      delta: text,
    });
    const { openai, payloads } = client([
      () =>
        sseResponse(
          [
            {
              type: 'response.created',
              sequence_number: 0,
              response: {
                ...functionCallResponse,
                status: 'in_progress',
                output: [],
              },
            },
            delta(0, 'Let me check.', 1),
            delta(1, '', 2),
            delta(1, 'The answer is 5', 3),
            { ...delta(1, ' (checked)', 4), content_index: 1 },
          ],
          { named: true }
        ),
    ]);

    const stream = await openai.responses.create({
      model: 'gpt-5',
      input: 'Sum?',
      stream: true,
    });
    let seen = 0;
    for await (const _event of stream) {
      seen += 1;
      if (seen === 5) {
        break;
      }
    }

    expect(payloads[0]?.output).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'text', text: 'The answer is 5' },
          { type: 'text', text: ' (checked)' },
        ],
      },
    ]);
  });

  test('records embeddings with their texts and token count', async () => {
    const { openai, payloads } = client([
      () =>
        jsonResponse({
          object: 'list',
          model: 'text-embedding-3-small',
          data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
          usage: { prompt_tokens: 4, total_tokens: 4 },
        }),
    ]);

    await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: ['hello world'],
      encoding_format: 'float',
    });

    expect(payloads[0]).toMatchObject({
      kind: 'embedding',
      model: 'text-embedding-3-small',
      input: ['hello world'],
      usage: { inputTokens: 4, outputTokens: 0 },
    });
    expect(payloads[0]?.output).toBeUndefined();
  });

  test('takes context from withAiContext and wraps a client only once', async () => {
    const { openai, payloads } = client(
      [() => jsonResponse(toolCompletion)],
      2
    );

    await withAiContext(
      { profileId: 'usr_1', conversationId: 'thread_1', name: 'weather' },
      () =>
        openai.chat.completions.create({
          model: 'gpt-5-mini',
          messages: [{ role: 'user', content: 'Weather?' }],
        })
    );

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      profileId: 'usr_1',
      conversationId: 'thread_1',
      name: 'weather',
    });
  });

  test('leaves the body unread for asResponse', async () => {
    const { openai, payloads } = client([() => jsonResponse(toolCompletion)]);

    const response = await openai.chat.completions
      .create({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: 'Hi' }],
      })
      .asResponse();

    expect((await response.json()).id).toBe('chatcmpl_1');
    expect(payloads).toHaveLength(0);
  });
});
