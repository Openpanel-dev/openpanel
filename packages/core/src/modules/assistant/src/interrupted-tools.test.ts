import { describe, expect, test } from 'bun:test';
import {
  failInterruptedToolParts,
  INTERRUPTED_TOOL_ERROR_TEXT,
} from './interrupted-tools';
import type { AssistantUIMessage } from './message';

type Part = AssistantUIMessage['parts'][number];

function assistant(parts: Part[]): AssistantUIMessage {
  return { id: 'a1', role: 'assistant', parts };
}

/** Fixtures carry only the fields under test, not a full tool output. */
function part(value: Record<string, unknown>): Part {
  return value as unknown as Part;
}

const pending = part({
  type: 'tool-describe_data',
  toolCallId: 'call_A',
  state: 'input-available',
  input: {},
});

const done = part({
  type: 'tool-get_billing',
  toolCallId: 'call_B',
  state: 'output-available',
  input: {},
  output: { plan: 'growth' },
});

describe('failInterruptedToolParts', () => {
  test('marks calls without a result as failed and keeps the rest', () => {
    const repaired = failInterruptedToolParts(
      assistant([{ type: 'step-start' }, pending, done])
    );
    expect(repaired.parts).toEqual([
      { type: 'step-start' },
      {
        type: 'tool-describe_data',
        toolCallId: 'call_A',
        state: 'output-error',
        input: {},
        errorText: INTERRUPTED_TOOL_ERROR_TEXT,
      },
      done,
    ]);
  });

  test('a call whose input was still streaming fails too', () => {
    const streaming = {
      type: 'tool-get_breakdown',
      toolCallId: 'call_C',
      state: 'input-streaming',
      input: undefined,
      rawInput: '{"metr',
    } as Part;
    const [part] = failInterruptedToolParts(assistant([streaming])).parts;
    expect(part).toMatchObject({
      state: 'output-error',
      rawInput: '{"metr',
      errorText: INTERRUPTED_TOOL_ERROR_TEXT,
    });
  });

  test('an approved call that never ran fails; a denied or open approval stays', () => {
    const approved = {
      type: 'tool-save_chart',
      toolCallId: 'call_D',
      state: 'approval-responded',
      input: {},
      approval: { id: 'ap_1', approved: true },
    } as Part;
    const denied = {
      type: 'tool-save_chart',
      toolCallId: 'call_E',
      state: 'approval-responded',
      input: {},
      approval: { id: 'ap_2', approved: false },
    } as Part;
    const open = {
      type: 'tool-save_chart',
      toolCallId: 'call_F',
      state: 'approval-requested',
      input: {},
      approval: { id: 'ap_3' },
    } as Part;
    const { parts } = failInterruptedToolParts(
      assistant([approved, denied, open])
    );
    expect(parts[0]).toMatchObject({
      state: 'output-error',
      approval: { id: 'ap_1', approved: true },
    });
    expect(parts[1]).toBe(denied);
    expect(parts[2]).toBe(open);
  });

  test('tools named as still pending are left alone', () => {
    const navigate = {
      type: 'tool-navigate',
      toolCallId: 'call_G',
      state: 'input-available',
      input: { route: 'overview' },
    } as Part;
    const message = assistant([navigate, pending]);
    const { parts } = failInterruptedToolParts(
      message,
      (name) => name === 'navigate'
    );
    expect(parts[0]).toBe(navigate);
    expect(parts[1]).toMatchObject({ state: 'output-error' });
  });

  test('returns the same object when nothing needs repair', () => {
    const message = assistant([
      done,
      { type: 'text', text: 'Hi', state: 'done' },
    ]);
    expect(failInterruptedToolParts(message)).toBe(message);
    const user: AssistantUIMessage = {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hej' }],
    };
    expect(failInterruptedToolParts(user)).toBe(user);
  });
});
