// Chat messages used to be stored one Better Agent item per row (a user
// message, a tool call, a tool result, an assistant message). The chat now
// stores one AI SDK UIMessage per row, so each conversation is rewritten:
// user items become user messages, and every run of tool calls and assistant
// text in between becomes one assistant message with tool and text parts.
import { db } from '../prisma-client';
import { getIsDry, printBoxMessage } from './helpers';

const MAX_TOOL_OUTPUT_CHARS = 200_000;
const PAGE_SIZE = 100;

interface LegacyMessageItem {
  type: 'message';
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string }>;
}

interface LegacyToolCallItem {
  type: 'tool-call';
  name: string;
  callId: string;
  arguments?: string;
  result?: unknown;
  status?: string;
}

type LegacyItem = LegacyMessageItem | LegacyToolCallItem | { type: string };

interface UIPart {
  type: string;
  [key: string]: unknown;
}

interface UIMessageRow {
  id: string;
  role: 'user' | 'assistant';
  parts: UIPart[];
  createdAt: Date;
}

function isLegacyRow(parts: unknown): parts is LegacyItem {
  return (
    typeof parts === 'object' &&
    parts !== null &&
    !Array.isArray(parts) &&
    typeof (parts as { type?: unknown }).type === 'string'
  );
}

function textOf(content: LegacyMessageItem['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function parseArguments(raw: string | undefined): unknown {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

/** Keeps what the chart card needs when a result is too large to store twice. */
function compactOutput(output: unknown): unknown {
  const serialized = JSON.stringify(output) ?? '';
  if (serialized.length <= MAX_TOOL_OUTPUT_CHARS) {
    return output;
  }
  if (typeof output === 'object' && output !== null) {
    const {
      data: _data,
      rows: _rows,
      ...rest
    } = output as Record<string, unknown>;
    return { ...rest, truncated: true };
  }
  return { truncated: true };
}

export function convertLegacyRows(
  rows: Array<{ id: string; parts: unknown; createdAt: Date }>
): UIMessageRow[] {
  const messages: UIMessageRow[] = [];
  let assistant: UIMessageRow | null = null;
  const toolParts = new Map<string, UIPart>();

  const flush = () => {
    if (assistant && assistant.parts.length > 0) {
      messages.push(assistant);
    }
    assistant = null;
    toolParts.clear();
  };

  for (const row of rows) {
    if (!isLegacyRow(row.parts)) {
      continue;
    }
    const item = row.parts;

    if (item.type === 'message') {
      const message = item as LegacyMessageItem;
      if (message.role === 'user') {
        flush();
        messages.push({
          id: row.id,
          role: 'user',
          parts: [{ type: 'text', text: textOf(message.content) }],
          createdAt: row.createdAt,
        });
        continue;
      }
      if (message.role === 'assistant') {
        assistant ??= {
          id: row.id,
          role: 'assistant',
          parts: [],
          createdAt: row.createdAt,
        };
        const text = textOf(message.content);
        if (text) {
          assistant.parts.push({ type: 'text', text, state: 'done' });
        }
      }
      continue;
    }

    if (item.type === 'tool-call') {
      const call = item as LegacyToolCallItem;
      assistant ??= {
        id: row.id,
        role: 'assistant',
        parts: [],
        createdAt: row.createdAt,
      };
      const existing = toolParts.get(call.callId);
      if (existing) {
        if ('result' in call) {
          if (call.status === 'error') {
            existing.state = 'output-error';
            existing.errorText = 'Tool failed';
          } else {
            existing.state = 'output-available';
            existing.output = compactOutput(call.result);
            existing.errorText = undefined;
          }
        }
        continue;
      }
      const part: UIPart = {
        type: `tool-${call.name}`,
        toolCallId: call.callId,
        state: 'result' in call ? 'output-available' : 'output-error',
        input: parseArguments(call.arguments),
      };
      if ('result' in call) {
        part.output = compactOutput(call.result);
      } else {
        part.errorText = 'No result recorded';
      }
      toolParts.set(call.callId, part);
      assistant.parts.push(part);
    }
  }
  flush();
  return messages;
}

export async function up() {
  printBoxMessage('🔄 Converting chat messages to UI messages', []);
  const dry = getIsDry();
  let converted = 0;
  let skipped = 0;
  let cursor: string | undefined;

  for (;;) {
    const conversations = await db.conversation.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (conversations.length === 0) {
      break;
    }
    cursor = conversations.at(-1)?.id;

    for (const conversation of conversations) {
      const rows = await db.chatMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, parts: true, createdAt: true },
      });
      if (rows.length === 0 || !rows.some((row) => isLegacyRow(row.parts))) {
        skipped += 1;
        continue;
      }
      const messages = convertLegacyRows(rows);
      if (dry) {
        console.log(
          `Would rewrite ${conversation.id}: ${rows.length} items → ${messages.length} messages`
        );
        converted += 1;
        continue;
      }
      await db.$transaction(async (tx) => {
        await tx.chatMessage.deleteMany({
          where: { conversationId: conversation.id },
        });
        if (messages.length > 0) {
          await tx.chatMessage.createMany({
            data: messages.map((message) => ({
              id: message.id,
              conversationId: conversation.id,
              role: message.role,
              parts: message.parts as unknown[],
              createdAt: message.createdAt,
            })),
          });
        }
      });
      converted += 1;
    }
  }

  printBoxMessage('✅ Chat messages converted', [
    `Converted: ${converted} conversations${dry ? ' (dry run)' : ''}`,
    `Skipped: ${skipped} conversations (already in the new format or empty)`,
  ]);
}
