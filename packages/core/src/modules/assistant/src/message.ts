import type { InferUITools, UIMessage } from 'ai';
import type {
  ChatDataParts,
  ChatMessageMetadata,
} from '../assistant.constants';
import type { ChatTools } from './tools';

/** The wire and storage shape of one chat message. */
export type AssistantUIMessage = UIMessage<
  ChatMessageMetadata,
  ChatDataParts,
  InferUITools<ChatTools>
>;

export type AssistantUIMessagePart = AssistantUIMessage['parts'][number];
