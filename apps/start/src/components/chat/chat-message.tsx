import { cn } from '@/utils/cn';
import type { UIMessage } from '@better-agent/client';
import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { ChatMarkdown } from './chat-markdown';
import { chatToolRenderers, DefaultToolResult } from './tool-results/registry';
import type { ToolResultPart } from './tool-results/types';

/**
 * Renders a single message by switching over `message.parts[i].type`.
 *
 * Better Agent's part model splits tool calls and results into TWO
 * separate parts (`tool-call` and `tool-result`) keyed by `callId`.
 * We pair them up before rendering so the UI sees one logical "tool
 * invocation" per call.
 *
 * Assistant text supports markdown via `<ChatMarkdown>`. User text
 * stays plain (no markdown injection from user input).
 */
export function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  // Index tool results by callId so we can attach them to their call.
  const resultByCallId = new Map<string, { result?: unknown; status: string }>();
  for (const part of message.parts) {
    if (part.type === 'tool-result') {
      resultByCallId.set(part.callId, {
        result: part.result,
        status: part.status,
      });
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        isUser ? 'items-end' : 'items-start',
      )}
    >
      {message.parts.map((part, idx) => {
        switch (part.type) {
          case 'text':
            if (isUser) {
              return (
                <div
                  key={`${message.localId}-text-${idx}`}
                  className="rounded-lg px-3 py-2 text leading-[1.5] whitespace-pre-wrap break-words max-w-[90%] bg-primary text-primary-foreground"
                >
                  {part.text}
                </div>
              );
            }
            return (
              <div
                key={`${message.localId}-text-${idx}`}
                className="max-w-full w-full"
              >
                <ChatMarkdown text={part.text} />
              </div>
            );

          case 'reasoning':
            return (
              <ReasoningBlock
                key={`${message.localId}-reasoning-${idx}`}
                text={part.text}
                complete={(part as { state?: string }).state === 'complete'}
              />
            );

          case 'tool-call': {
            const matched = resultByCallId.get(part.callId);
            const toolName = part.name;
            // If the tool's name hasn't streamed in yet (intermediate
            // state between TOOL_CALL_START and the args event), show
            // a neutral "Thinking…" shimmer instead of "Running
            // unknown…". Once the name arrives, the part re-renders
            // with the real tool + its renderer.
            if (!toolName) {
              return (
                <div
                  key={part.callId}
                  className="flex items-center gap-2 py-1.5 text-sm"
                >
                  <span className="op-shimmer font-medium">Thinking…</span>
                </div>
              );
            }
            const Renderer =
              chatToolRenderers[`tool-${toolName}` as keyof typeof chatToolRenderers] ??
              DefaultToolResult;
            const toolPart: ToolResultPart = {
              type: `tool-${toolName}`,
              toolCallId: part.callId,
              state: derivePartState(part.state, matched?.status),
              input: part.args ? safeParse(part.args) : undefined,
              output: matched?.result,
              errorText:
                matched?.status === 'error' ? 'Tool failed' : undefined,
            };
            return (
              <div key={part.callId} className="w-full max-w-full">
                <Renderer part={toolPart} />
              </div>
            );
          }

          case 'tool-result':
            // Already rendered above as part of the matching tool-call.
            return null;

          default:
            return null;
        }
      })}
    </div>
  );
}

/**
 * Reasoning trace from the model. While streaming, shows a shimmer
 * "Thinking…" header with the latest line as a one-line preview.
 * When complete, becomes a click-to-expand "Thought" disclosure.
 */
function ReasoningBlock({
  text,
  complete,
}: {
  text: string;
  complete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  // Latest non-empty line for the live preview.
  const latestLine =
    trimmed
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .pop() ?? '';

  if (!complete) {
    return (
      <div className="w-full max-w-full">
        <div className="flex items-center gap-2 text-sm">
          <span className="op-shimmer font-medium">Thinking…</span>
        </div>
        {latestLine && (
          <div className="mt-1 text-sm text-muted-foreground/80 italic line-clamp-1">
            {latestLine}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRightIcon
          className={cn('size-3 transition-transform', open && 'rotate-90')}
        />
        <span>Thought</span>
      </button>
      {open && (
        <div className="mt-1 ml-4 border-l-2 border-muted-foreground/20 pl-3">
          <ChatMarkdown
            text={trimmed}
            className="text-sm text-muted-foreground"
          />
        </div>
      )}
    </div>
  );
}

function derivePartState(
  callState: string | undefined,
  resultStatus: string | undefined,
): string {
  if (resultStatus === 'success') return 'output-available';
  if (resultStatus === 'error') return 'output-error';
  if (resultStatus === 'pending') return 'input-available';
  if (callState === 'input-streaming') return 'input-streaming';
  if (callState === 'input-complete') return 'input-available';
  return 'input-streaming';
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
