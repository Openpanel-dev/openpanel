import { describe, expect, test } from 'bun:test';
import { convertLegacyRows } from './27-chat-ui-messages';

const at = (second: number) => new Date(2026, 9, 19, 12, 0, second);

describe('convertLegacyRows', () => {
  test('folds a user item, its tool calls and the assistant text into two messages', () => {
    const messages = convertLegacyRows([
      {
        id: 'u1',
        createdAt: at(0),
        parts: { type: 'message', role: 'user', content: 'show signups' },
      },
      {
        id: 't1',
        createdAt: at(1),
        parts: {
          type: 'tool-call',
          name: 'generate_report',
          callId: 'c1',
          arguments: '{"chartType":"linear"}',
        },
      },
      {
        id: 't2',
        createdAt: at(2),
        parts: {
          type: 'tool-call',
          name: 'generate_report',
          callId: 'c1',
          result: { report: { chartType: 'linear' } },
          arguments: '{}',
        },
      },
      {
        id: 'a1',
        createdAt: at(3),
        parts: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Here you go.' }],
        },
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'show signups' }],
    });
    expect(messages[1]?.id).toBe('t1');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.parts).toEqual([
      {
        type: 'tool-generate_report',
        toolCallId: 'c1',
        state: 'output-available',
        input: { chartType: 'linear' },
        output: { report: { chartType: 'linear' } },
      },
      { type: 'text', text: 'Here you go.', state: 'done' },
    ]);
  });

  test('a call without a result becomes an error part', () => {
    const messages = convertLegacyRows([
      {
        id: 'u1',
        createdAt: at(0),
        parts: { type: 'message', role: 'user', content: 'hi' },
      },
      {
        id: 't1',
        createdAt: at(1),
        parts: {
          type: 'tool-call',
          name: 'list_event_names',
          callId: 'c1',
          arguments: '{}',
        },
      },
    ]);
    expect(messages[1]?.parts[0]).toMatchObject({
      state: 'output-error',
      errorText: 'No result recorded',
    });
  });

  test('rows already in the new format are ignored', () => {
    expect(
      convertLegacyRows([
        { id: 'x', createdAt: at(0), parts: [{ type: 'text', text: 'new' }] },
      ])
    ).toEqual([]);
  });
});
