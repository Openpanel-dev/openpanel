import { describe, expect, test } from 'bun:test';
import Anthropic from '@anthropic-ai/sdk';
import { wrapAnthropic } from './anthropic';
import { withAiContext } from './context';
import { collect, jsonResponse, mockFetch, sseResponse } from './test-helpers';

function client(responses: (() => Response)[]) {
  const { op, payloads } = collect();
  const { fetch, requests } = mockFetch(responses);
  const anthropic = wrapAnthropic(
    new Anthropic({ apiKey: 'sk-ant-test', fetch, maxRetries: 0 }),
    { op }
  );
  return { anthropic, payloads, requests };
}

const toolUseMessage = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5-20261001',
  stop_reason: 'tool_use',
  stop_sequence: null,
  content: [
    { type: 'thinking', thinking: 'Check the weather.', signature: 'sig' },
    {
      type: 'tool_use',
      id: 'toolu_1',
      name: 'get_weather',
      input: { city: 'Oslo' },
    },
  ],
  usage: {
    input_tokens: 20,
    output_tokens: 40,
    cache_read_input_tokens: 1000,
    cache_creation_input_tokens: 200,
  },
};

const streamEvents = [
  {
    type: 'message_start',
    message: {
      id: 'msg_2',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5-20261001',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 15,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Let me ' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'check.' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'tool_use',
      id: 'toolu_2',
      name: 'get_weather',
      input: {},
    },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '{"city":' },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '"Oslo"}' },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'tool_use', stop_sequence: null },
    usage: { output_tokens: 25 },
  },
  { type: 'message_stop' },
];

describe('wrapAnthropic', () => {
  test('records a message with system, tool results and cache-inclusive usage', async () => {
    const { anthropic, payloads } = client([
      () => jsonResponse(toolUseMessage),
    ]);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 1024,
      stop_sequences: ['END'],
      system: 'Be brief.',
      tools: [
        {
          name: 'get_weather',
          description: 'Weather for a city',
          input_schema: { type: 'object', properties: {} },
        },
      ],
      messages: [
        { role: 'user', content: 'Weather in Oslo?' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_0', name: 'locate', input: {} },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_0', content: 'Oslo' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
            },
          ],
        },
      ],
    });

    expect(message.id).toBe('msg_1');
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      kind: 'generation',
      model: 'claude-sonnet-5-5-20261001',
      provider: 'anthropic',
      stream: false,
      stopReason: 'tool-calls',
      usage: {
        inputTokens: 1220,
        outputTokens: 40,
        cacheReadTokens: 1000,
        cacheWriteTokens: 200,
      },
      modelParameters: { stopSequences: ['END'], maxTokens: 1024 },
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Weather for a city',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });
    expect(payloads[0]?.input).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Weather in Oslo?' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            toolCallId: 'toolu_0',
            toolName: 'locate',
            input: {},
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolCallId: 'toolu_0', output: 'Oslo' },
          { type: 'file', mediaType: 'image/png', data: '[file]' },
        ],
      },
    ]);
    expect(payloads[0]?.output).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Check the weather.' },
          {
            type: 'tool_call',
            toolCallId: 'toolu_1',
            toolName: 'get_weather',
            input: { city: 'Oslo' },
          },
        ],
      },
    ]);
  });

  test('rebuilds a streamed message from its events', async () => {
    const { anthropic, payloads } = client([
      () => sseResponse(streamEvents, { named: true }),
    ]);

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Weather?' }],
      stream: true,
    });
    let events = 0;
    for await (const _event of stream) {
      events++;
    }

    expect(events).toBe(streamEvents.length);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      stream: true,
      stopReason: 'tool-calls',
      usage: { inputTokens: 15, outputTokens: 25 },
      output: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check.' },
            {
              type: 'tool_call',
              toolCallId: 'toolu_2',
              toolName: 'get_weather',
              input: { city: 'Oslo' },
            },
          ],
        },
      ],
    });
    expect(payloads[0]?.timeToFirstTokenMs).toBeNumber();
  });

  test('records the messages.stream helper once', async () => {
    const { anthropic, payloads } = client([
      () => sseResponse(streamEvents, { named: true }),
    ]);

    const final = await anthropic.messages
      .stream({
        model: 'claude-sonnet-5-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Weather?' }],
      })
      .finalMessage();

    expect(final.content[0]).toMatchObject({ text: 'Let me check.' });
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.stream).toBe(true);
  });

  test('records beta messages and failures with their status', async () => {
    const { anthropic, payloads } = client([
      () => jsonResponse(toolUseMessage),
      () =>
        jsonResponse(
          {
            type: 'error',
            error: { type: 'overloaded_error', message: 'Overloaded' },
          },
          529
        ),
    ]);

    await withAiContext({ profileId: 'usr_1', name: 'beta' }, () =>
      anthropic.beta.messages.create({
        model: 'claude-sonnet-5-5',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      })
    );
    const error = await anthropic.messages
      .create({
        model: 'claude-sonnet-5-5',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      })
      .then(
        () => undefined,
        (caught: unknown) => caught
      );

    expect(error).toBeInstanceOf(Anthropic.APIError);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ profileId: 'usr_1', name: 'beta' });
    expect(payloads[1]?.error).toMatchObject({
      httpStatus: 529,
      message: expect.stringContaining('Overloaded'),
    });
  });
});
