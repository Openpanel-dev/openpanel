// Re-export the shared model whitelist helpers from `@openpanel/validation`.
// Server + client consume the same source, so drift is a compile error
// rather than a silent "agent not found at runtime".
//
// The *available* model list is fetched at runtime via `trpc.chat.models` —
// it filters by which provider API keys the API process has configured.
export {
  MODEL_STORAGE_KEY,
  getModelLabel,
  isValidModelId,
} from '@openpanel/validation';
export type { ChatModelEntry as ChatModelOption } from '@openpanel/validation';
