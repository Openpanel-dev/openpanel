// Shared with the server so drift is a compile error, not a runtime "agent not
// found". The available models come from `trpc.chat.models`, filtered by the
// API's configured provider keys.

export type { ChatModelEntry as ChatModelOption } from '@openpanel/core/modules/assistant/assistant.constants';
export {
  getModelLabel,
  isValidModelId,
  MODEL_STORAGE_KEY,
} from '@openpanel/core/modules/assistant/assistant.constants';
