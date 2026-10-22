import { getToolName, isToolUIPart } from 'ai';
import type { AssistantUIMessage, AssistantUIMessagePart } from './message';

export const INTERRUPTED_TOOL_ERROR_TEXT =
  'Interrupted before the tool finished.';

type ToolPart = Extract<AssistantUIMessagePart, { toolCallId: string }>;

/** A call the model made that never got a result: the model refuses the whole history until it has one. */
function awaitsResult(part: ToolPart): boolean {
  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return true;
  }
  return part.state === 'approval-responded' && part.approval.approved;
}

function failed(part: ToolPart): ToolPart {
  const { output: _output, errorText: _errorText, ...rest } = part;
  // The SDK's part union cannot be re-tagged generically without an assertion.
  return {
    ...rest,
    state: 'output-error',
    errorText: INTERRUPTED_TOOL_ERROR_TEXT,
  } as ToolPart;
}

/**
 * Turns tool calls that will never get a result into failed ones, so the
 * conversation can continue. `stillPending` names tools whose result is
 * legitimately outstanding at this point (client tools waiting on the browser).
 */
export function failInterruptedToolParts(
  message: AssistantUIMessage,
  stillPending: (toolName: string) => boolean = () => false
): AssistantUIMessage {
  if (message.role !== 'assistant') {
    return message;
  }
  let changed = false;
  const parts = message.parts.map((part) => {
    if (
      !(isToolUIPart(part) && awaitsResult(part)) ||
      stillPending(getToolName(part))
    ) {
      return part;
    }
    changed = true;
    return failed(part);
  });
  return changed ? { ...message, parts } : message;
}
