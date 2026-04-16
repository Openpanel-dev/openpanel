// Re-export the shared chat schemas from `@openpanel/validation` so the
// rest of the agent code can keep importing from `./context`. The
// schemas themselves live in validation because the frontend needs them
// too (see packages/validation/src/chat.ts).
export {
  chatContextSchema,
  pageContextSchema,
  pageContextPageSchema,
} from '@openpanel/validation';
export type {
  ChatAgentContext,
  PageContext,
  PageContextPage,
} from '@openpanel/validation';
