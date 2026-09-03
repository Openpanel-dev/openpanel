// Re-export the shared chat schemas from `../assistant.constants` so the
// rest of the agent code can keep importing from `./context`. The schemas
// themselves live in the module's constants file because the frontend needs
// them too (isomorphic — see assistant.constants.ts's header).

export type {
  ChatAgentContext,
  PageContext,
  PageContextPage,
} from '../assistant.constants';
export {
  chatContextSchema,
  pageContextPageSchema,
  pageContextSchema,
} from '../assistant.constants';
