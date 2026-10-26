// Turns the AI SDK's prompt and content parts into the plain message shape
// OpenPanel stores: `{ role, content }` with typed parts, no binary data.

import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';

export interface MessagePart {
  type: string;
  [key: string]: unknown;
}

export interface Message {
  role: string;
  content: string | MessagePart[];
}

const FILE_PLACEHOLDER = '[file]';

function partOf(part: Record<string, unknown>): MessagePart {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'reasoning':
      return { type: 'reasoning', text: part.text };
    case 'tool-call':
      return {
        type: 'tool_call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      };
    case 'tool-result':
      return {
        type: 'tool_result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: part.output ?? part.result,
      };
    case 'file':
      return {
        type: 'file',
        mediaType: part.mediaType,
        data: FILE_PLACEHOLDER,
      };
    default:
      return { type: String(part.type) };
  }
}

export function toMessages(prompt: LanguageModelV4Prompt): Message[] {
  return prompt.map((message) => {
    if (typeof message.content === 'string') {
      return { role: message.role, content: message.content };
    }
    return {
      role: message.role,
      content: message.content.map((part) =>
        partOf(part as unknown as Record<string, unknown>)
      ),
    };
  });
}

export function toOutputMessages(content: LanguageModelV4Content[]): Message[] {
  if (content.length === 0) {
    return [];
  }
  return [
    {
      role: 'assistant',
      content: content.map((part) =>
        partOf(part as unknown as Record<string, unknown>)
      ),
    },
  ];
}

export function toTools(
  tools: LanguageModelV4CallOptions['tools']
): unknown[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => {
    if (tool.type === 'function') {
      return {
        type: 'function',
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };
    }
    return { type: tool.type, id: tool.id, name: tool.name };
  });
}
