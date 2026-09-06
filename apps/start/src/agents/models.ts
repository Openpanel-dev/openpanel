// Re-export the shared model whitelist helpers from
// `@openpanel/core`'s assistant.constants.
// Server + client consume the same source, so drift is a compile error
// rather than a silent "agent not found at runtime".
//
// The *available* model list is fetched at runtime via `trpc.chat.models` —
// it filters by which provider API keys the API process has configured.

export type { ChatModelEntry as ChatModelOption } from '@openpanel/core/modules/assistant/assistant.constants';
export {
  getModelLabel,
  isValidModelId,
  MODEL_STORAGE_KEY,
} from '@openpanel/core/modules/assistant/assistant.constants';
