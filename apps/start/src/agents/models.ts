// Re-export the shared model whitelist from `@openpanel/validation`.
// Server + client consume the same source, so drift is a compile error
// rather than a silent "agent not found at runtime".
export {
  CHAT_MODELS,
  DEFAULT_MODEL_ID,
  MODEL_STORAGE_KEY,
  getModelLabel,
  isValidModelId,
} from '@openpanel/validation';
export type { ChatModelEntry as ChatModelOption } from '@openpanel/validation';
